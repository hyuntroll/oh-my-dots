import json
import time
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from ohmydot.integrations import SERVICES, IntegrationError, Integrations


@pytest.fixture
def manager(tmp_path, monkeypatch):
    for prefix in ("GOOGLE", "SLACK"):
        monkeypatch.setenv(prefix + "_CLIENT_ID", "client")
        monkeypatch.setenv(prefix + "_CLIENT_SECRET", "secret")
    return Integrations(SimpleNamespace(origin="http://localhost:3080", data_dir=str(tmp_path)))


async def test_oauth_bound_state_scope_and_single_use(manager):
    calls = []

    def exchange(request):
        calls.append(request)
        return httpx.Response(
            200,
            json={
                "access_token": "private-access",
                "refresh_token": "private-refresh",
                "scope": SERVICES["gmail"]["scope"],
                "expires_in": 3600,
            },
        )

    manager.transport = httpx.MockTransport(exchange)
    state = parse_qs(urlparse(manager.start("gmail", "session")).query)["state"][0]
    for service, session in [("drive", "session"), ("gmail", "wrong")]:
        with pytest.raises(IntegrationError):
            await manager.finish(service, state, "code", session)
    assert not calls
    await manager.finish("gmail", state, "code", "session")
    assert manager.path.stat().st_mode & 0o777 == 0o600
    assert "private-access" not in json.dumps(manager.catalog())
    with pytest.raises(IntegrationError):
        await manager.finish("gmail", state, "code", "session")
    assert len(calls) == 1
    assert manager.resolve("gmail", "search")["executor"] == "integration"
    assert manager.resolve("gmail", "send")["executor"] == "browser"
    await manager.disconnect("gmail")
    assert manager.resolve("gmail", "search")["executor"] == "browser"


async def test_expired_state_and_rejected_scopes(manager):
    state = parse_qs(urlparse(manager.start("gmail", "session")).query)["state"][0]
    manager.pending[state]["expires"] = 0
    with pytest.raises(IntegrationError):
        await manager.finish("gmail", state, "code", "session")
    state = parse_qs(urlparse(manager.start("gmail", "session")).query)["state"][0]
    manager.transport = httpx.MockTransport(
        lambda r: httpx.Response(200, json={"access_token": "token", "scope": ""})
    )
    with pytest.raises(IntegrationError):
        await manager.finish("gmail", state, "code", "session")
    assert not manager.path.exists()


async def test_refresh_and_fixed_api_destination(manager):
    manager.save(
        {
            "gmail": {
                "access_token": "old",
                "refresh_token": "refresh",
                "expires": 0,
                "scope": SERVICES["gmail"]["scope"],
            }
        }
    )
    calls = []

    def reply(request):
        calls.append(request)
        if request.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "new", "expires_in": 3600})
        assert request.url.host == "gmail.googleapis.com"
        assert request.headers["authorization"] == "Bearer new"
        assert request.url.params["q"] == "from:friend@example.com"
        return httpx.Response(200, json={"messages": [{"id": "message"}]})

    manager.transport = httpx.MockTransport(reply)
    result = await manager.read("gmail", "search", query="from:friend@example.com")
    assert result["data"]["messages"][0]["id"] == "message"
    assert result["untrusted_content"]
    assert len(calls) == 2
    assert manager.tokens()["gmail"]["expires"] > time.time()
    with pytest.raises(IntegrationError):
        await manager.read("gmail", "channels")


async def test_errors_do_not_expose_provider_payload_or_credentials(manager):
    manager.transport = httpx.MockTransport(
        lambda r: httpx.Response(400, json={"error": "secret private-access"})
    )
    with pytest.raises(IntegrationError) as exc:
        await manager.request("POST", "https://oauth2.googleapis.com/token", data={"client_secret": "secret"})
    assert "secret" not in str(exc.value)
    assert "private-access" not in str(exc.value)


def test_missing_config_and_unknown_services(manager, monkeypatch):
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET")
    assert not next(item for item in manager.catalog() if item["id"] == "gmail")["configured"]
    with pytest.raises(IntegrationError):
        manager.start("gmail", "session")
    with pytest.raises(IntegrationError):
        manager.resolve("unknown", "search")


async def test_api_oauth_uses_dedicated_lax_cookie_without_relaxing_app_session(tmp_path, monkeypatch):
    from ohmydot.config import Config
    from ohmydot.main import create_app

    monkeypatch.setenv("GOOGLE_CLIENT_ID", "client")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "secret")
    app = create_app(
        Config(
            database_url="sqlite:///" + str(tmp_path / "db"),
            data_dir=str(tmp_path),
            session_token="session",
            computer_token="computer",
            shell_token="shell",
        )
    )
    manager = app.state.runtime.integrations
    manager.transport = httpx.MockTransport(
        lambda r: httpx.Response(
            200,
            json={"access_token": "private-token", "scope": SERVICES["gmail"]["scope"], "expires_in": 3600},
        )
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://localhost:3080"
    ) as client:
        assert (await client.get("/api/integrations")).status_code == 401
        session = await client.get("/api/session", headers={"X-Dot-Bootstrap": "session"})
        assert "SameSite=strict" in session.headers["set-cookie"]
        denied = await client.post(
            "/api/integrations/gmail/connect",
            headers={"Origin": "https://evil.example", "Sec-Fetch-Site": "cross-site"},
        )
        assert denied.status_code == 401
        response = await client.post("/api/integrations/gmail/connect")
        assert response.status_code == 200
        assert "SameSite=lax" in response.headers["set-cookie"]
        state = parse_qs(urlparse(response.json()["url"]).query)["state"][0]
        # Simulate cross-site callback with main Strict cookie absent.
        client.cookies.delete("dot_session")
        callback = await client.get(
            "/api/integrations/gmail/callback",
            params={"state": state, "code": "code"},
            headers={"Sec-Fetch-Site": "cross-site"},
        )
        assert callback.status_code == 200
        assert "private-token" not in callback.text
        assert manager.resolve("gmail", "read")["executor"] == "integration"


async def test_gmail_read_decodes_bounded_mime_and_excludes_other_headers(manager):
    import base64

    manager.save({"gmail": {"access_token": "token", "expires": time.time() + 3600}})
    encoded = base64.urlsafe_b64encode(("hello " + "x" * 17000).encode()).decode().rstrip("=")
    manager.transport = httpx.MockTransport(
        lambda r: httpx.Response(
            200,
            json={
                "id": "message",
                "payload": {
                    "mimeType": "multipart/mixed",
                    "headers": [
                        {"name": "Subject", "value": "Test"},
                        {"name": "X-Internal", "value": "private"},
                    ],
                    "parts": [
                        {"mimeType": "text/plain", "body": {"data": encoded}},
                        {"mimeType": "application/pdf", "filename": "report.pdf", "body": {"size": 42}},
                    ],
                },
            },
        )
    )
    result = await manager.read("gmail", "read", id="message")
    data = result["data"]
    assert data["bodies"][0]["text"].startswith("hello ")
    assert len(data["bodies"][0]["text"]) == 16000
    assert data["bodies"][0]["truncated"]
    assert data["headers"] == [{"name": "Subject", "value": "Test"}]
    assert data["attachments"] == [{"name": "report.pdf", "size": 42}]
