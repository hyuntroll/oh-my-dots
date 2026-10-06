import asyncio
from contextlib import asynccontextmanager

import httpx
import pytest
from ohmydot.config import Config
from ohmydot.main import create_app
from ohmydot.store import Message, Run
from sqlalchemy import select


class Adapter:
    async def get(self, path):
        return {"owner": "AGENT", "handoff": False, "epoch": 0}

    async def post(self, path, body=None, **kwargs):
        return {"cancelled": True}


@pytest.fixture
def app(tmp_path):
    app = create_app(
        Config(
            database_url="sqlite:///" + str(tmp_path / "db"),
            data_dir=str(tmp_path),
            session_token="test-session",
            computer_token="test-computer",
            shell_token="test-shell",
        )
    )
    app.state.runtime.desktop = Adapter()
    app.state.runtime.shell = Adapter()
    return app


@asynccontextmanager
async def client(app, startup=True):
    if startup:
        await app.state.runtime.start()
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        ) as c:
            await c.get("/api/session", headers={"X-Dot-Bootstrap": "test-session"})
            yield c
    finally:
        if startup:
            await app.state.runtime.stop()


async def eventually(check):
    async with asyncio.timeout(5):
        while not check():
            await asyncio.sleep(0.01)


@pytest.mark.asyncio
async def test_release_racing_control_change_is_conflict_not_server_error(app, monkeypatch):
    async def get(path):
        return {"owner": "USER", "epoch": 1}

    async def post(path, body=None, **kwargs):
        response = httpx.Response(409, request=httpx.Request("POST", "http://desktop/control/release"))
        response.raise_for_status()

    monkeypatch.setattr(app.state.runtime.desktop, "get", get)
    monkeypatch.setattr(app.state.runtime.desktop, "post", post)
    async with client(app, startup=False) as c:
        response = await c.post("/api/computer-sessions/computer-1/release", json={"epoch": 1})
        assert response.status_code == 409


@pytest.mark.asyncio
async def test_input_connection_timeout_is_recoverable(app, monkeypatch):
    async def post(path, body=None, **kwargs):
        raise httpx.ReadTimeout("desktop unavailable")

    monkeypatch.setattr(app.state.runtime.desktop, "post", post)
    async with client(app, startup=False) as c:
        response = await c.post("/api/computer-sessions/computer-1/input", json={"epoch": 1, "action": "move"})
        assert response.status_code == 503
        assert "다시 연결" in response.json()["detail"]


def status(app, run_id):
    with app.state.store.session() as db:
        return db.get(Run, run_id).status


async def submit(c, cid, text, key):
    response = await c.post(f"/api/conversations/{cid}/messages", json={"text": text, "idempotency_key": key})
    assert response.status_code == 200
    return response.json()["id"]


async def test_fifo_idempotency_cancel_does_not_kill_worker(app, monkeypatch):
    started = []
    history = []
    hold = asyncio.Event()

    async def provider(runtime, run, messages, tools):
        started.append(run.id)
        history.append(messages)
        if len(started) == 1:
            await hold.wait()
        return "done"

    monkeypatch.setattr("ohmydot.runtime.run_codex", provider)
    async with client(app) as c:
        cid = (await c.post("/api/conversations")).json()["id"]
        first = await submit(c, cid, "first", "one")
        await eventually(lambda: len(started) == 1)
        assert await submit(c, cid, "first", "one") == first
        conflict = await c.post(
            f"/api/conversations/{cid}/messages", json={"text": "different", "idempotency_key": "one"}
        )
        assert conflict.status_code == 409
        second = await submit(c, cid, "second", "two")
        assert status(app, second) == "PENDING"
        await c.post(f"/api/runs/{first}/cancel")
        await eventually(lambda: status(app, second) == "COMPLETED")
        assert status(app, first) == "CANCELLED"
        assert started == [first, second]
        assert history[0] == [{"role": "user", "content": "first"}]
        assert history[1][-1]["content"] == "second"
        assert (await c.get(f"/api/conversations/{cid}")).json()["runs"].__len__() == 2


async def test_answer_resumes_same_run_and_does_not_unblock_fifo_early(app, monkeypatch):
    async def provider(runtime, run, messages, tools):
        return (
            await runtime.ask_user(run.id, "어떤 파일명인가요?")
            if messages[-1]["content"] == "question"
            else "done"
        )

    monkeypatch.setattr("ohmydot.runtime.run_codex", provider)
    async with client(app) as c:
        cid = (await c.post("/api/conversations")).json()["id"]
        first = await submit(c, cid, "question", "one")
        await eventually(lambda: status(app, first) == "WAITING_USER")
        second = await submit(c, cid, "second", "two")
        assert status(app, second) == "PENDING"
        await c.post(f"/api/runs/{first}/answer", json={"text": "result.txt", "question_id": app.state.runtime.question_ids[first]})
        await eventually(lambda: status(app, second) == "COMPLETED")
        with app.state.store.session() as db:
            assert db.get(Run, first).result == "result.txt"
            assert len(list(db.scalars(select(Run)))) == 2
            assert len(list(db.scalars(select(Message).where(Message.run_id == first)))) == 4
        assert (await c.post(f"/api/runs/{first}/answer", json={"text": "again", "question_id": "old"})).status_code == 409


async def test_restart_requires_explicit_retry(app):
    async with client(app, startup=False) as c:
        cid = (await c.post("/api/conversations")).json()["id"]
        rid = await submit(c, cid, "pending", "one")
        assert app.state.store.recover() == [rid]
        assert status(app, rid) == "FAILED"
        with app.state.store.session() as db:
            assert db.get(Run, rid).error == "SERVER_RESTARTED"
        assert await submit(c, cid, "pending", "one") == rid
        assert app.state.runtime.queue.qsize() == 1


async def test_auth_csrf_and_settings_never_return_key(app):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as c:
        assert (await c.get("/api/conversations")).status_code == 401
        assert (
            await c.get("/api/session", headers={"origin": "https://attacker.example"})
        ).status_code == 403
        await c.get("/api/session", headers={"X-Dot-Bootstrap": "test-session"})
        assert (
            await c.post("/api/conversations", headers={"sec-fetch-site": "cross-site"})
        ).status_code == 401
        assert (
            await c.put(
                "/api/settings",
                json={"provider": "openai", "model": "gpt-5.4", "api_key": "test-placeholder"},
            )
        ).status_code == 200
        assert "test-placeholder" not in (await c.get("/api/settings")).text


async def test_blocked_work_is_failed_with_explanation(app, monkeypatch):
    from ohmydot.providers import TaskFailure

    async def provider(runtime, run, messages, tools):
        raise TaskFailure("failed", "공개 페이지에 연결하지 못했습니다.")

    monkeypatch.setattr("ohmydot.runtime.run_codex", provider)
    async with client(app) as c:
        cid = (await c.post("/api/conversations")).json()["id"]
        rid = await submit(c, cid, "open page", "one")
        await eventually(lambda: status(app, rid) == "FAILED")
        with app.state.store.session() as db:
            assert db.get(Run, rid).error == "TASK_NOT_COMPLETED"
            assert (
                list(db.scalars(select(Message).where(Message.run_id == rid)))[-1].text
                == "공개 페이지에 연결하지 못했습니다."
            )


async def test_repeated_tool_failure_stops_execution(app, monkeypatch):
    async def provider(runtime, run, messages, tools):
        for _ in range(10):
            await tools.invoke("unknown_tool", {})
        return "must not complete"

    monkeypatch.setattr("ohmydot.runtime.run_codex", provider)
    async with client(app) as c:
        cid = (await c.post("/api/conversations")).json()["id"]
        rid = await submit(c, cid, "fail repeatedly", "one")
        await eventually(lambda: status(app, rid) == "FAILED")
        with app.state.store.session() as db:
            assert db.get(Run, rid).error == "REPEATED_TOOL_FAILURE"


async def test_queued_followup_receives_previous_result_not_future_request(app, monkeypatch):
    hold = asyncio.Event()
    histories = []

    async def provider(runtime, run, messages, tools):
        histories.append(messages)
        if len(histories) == 1:
            await hold.wait()
            return "previous-result"
        return "followup-result"

    monkeypatch.setattr("ohmydot.runtime.run_codex", provider)
    async with client(app) as c:
        cid = (await c.post("/api/conversations")).json()["id"]
        first = await submit(c, cid, "first", "one")
        await eventually(lambda: len(histories) == 1)
        second = await submit(c, cid, "followup", "two")
        hold.set()
        await eventually(lambda: status(app, second) == "COMPLETED")
        assert status(app, first) == "COMPLETED"
        assert "followup" not in str(histories[0])
        assert any(m["role"] == "assistant" and m["content"] == "previous-result" for m in histories[1])


async def test_restart_cancels_recovered_shell_processes(app):
    class Shell:
        calls = []

        async def post(self, path, *args, **kwargs):
            self.calls.append(path)
            return {"cancelled": True}

    async with client(app, startup=False) as c:
        cid = (await c.post("/api/conversations")).json()["id"]
        rid = await submit(c, cid, "pending", "one")
    shell = Shell()
    app.state.runtime.shell = shell
    await app.state.runtime.start()
    try:
        assert "/cancel/" + rid in shell.calls
        assert status(app, rid) == "FAILED"
    finally:
        await app.state.runtime.stop()


async def test_missing_artifact_preserves_not_found_status(app):
    class Shell:
        async def get(self, path):
            response = httpx.Response(404, request=httpx.Request("GET", "http://shell" + path))
            response.raise_for_status()

    app.state.runtime.shell = Shell()
    async with client(app, startup=False) as c:
        response = await c.get("/api/artifacts/missing.txt")
        assert response.status_code == 404 and response.json()["detail"] == "Artifact not found"


async def test_question_options_survive_reload_and_stale_answers_cannot_resume_next_question(app, monkeypatch):
    received = []

    async def provider(runtime, run, messages, tools):
        received.append(await runtime.ask_user(run.id, "어떤 방식을 원하세요?", ["초안만 준비", "그만하기"], 0))
        received.append(await runtime.ask_user(run.id, "제목을 알려 주세요"))
        return "done"

    monkeypatch.setattr("ohmydot.runtime.run_codex", provider)
    async with client(app) as c:
        cid = (await c.post("/api/conversations")).json()["id"]
        run_id = await submit(c, cid, "question", "structured")
        await eventually(lambda: status(app, run_id) == "WAITING_USER")
        replay = (await c.get(f"/api/conversations/{cid}")).json()["execution"]
        question = next(e for e in replay if e["type"] == "run.question")
        first_id = question["payload"]["question_id"]
        assert question["payload"]["options"] == ["초안만 준비", "그만하기"]
        assert question["payload"]["recommended_index"] == 0
        assert received == []  # A recommendation is not an answer.
        assert (await c.post(f"/api/runs/{run_id}/answer", json={"text": " ", "question_id": first_id})).status_code == 422
        assert (await c.post(f"/api/runs/{run_id}/answer", json={"text": "다른 의견", "question_id": first_id})).status_code == 200
        await eventually(lambda: app.state.runtime.question_ids.get(run_id) not in (None, first_id))
        assert (await c.post(f"/api/runs/{run_id}/answer", json={"text": "중복 답변", "question_id": first_id})).status_code == 409
        assert received == ["다른 의견"]
        second_id = app.state.runtime.question_ids[run_id]
        await c.post(f"/api/runs/{run_id}/answer", json={"text": "회의 메모", "question_id": second_id})
        await eventually(lambda: status(app, run_id) == "COMPLETED")
        assert received == ["다른 의견", "회의 메모"]
        assert run_id not in app.state.runtime.question_ids
