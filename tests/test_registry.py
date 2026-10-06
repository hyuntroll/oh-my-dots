"""Shared schemas and the private MCP execution boundary, without model/network calls."""

import asyncio
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from mcp.client.session import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client
from ohmydot.config import Config
from ohmydot.main import create_app
from ohmydot.tool_registry import TOOLS, ToolInputError, validate_input
from ohmydot.tools import Tools


class Events:
    def __init__(self):
        self.events = []

    def event(self, kind, summary, run_id=None, payload=None):
        self.events.append({"type": kind, "summary": summary, "payload": payload})


@pytest.mark.parametrize("name,args", [
    ("shell_exec", ["secret-command"]),
    ("shell_exec", {"command": "secret-command", "secret-key": "secret-value"}),
    ("shell_exec", {}),
    ("desktop_input", {"action": "secret-action"}),
    ("desktop_input", {"action": "click", "x": "secret-coordinate"}),
    ("ask_user", {"question": "secret-question", "options": None}),
    ("ask_user", {"question": "secret-question", "options": ["one"]}),
    ("ask_user", {"question": "secret-question", "recommended_index": True}),
])
async def test_invalid_input_has_no_effect_or_value_leak(name, args):
    store = Events()
    runtime = SimpleNamespace(store=store, config=SimpleNamespace(max_tools=10), check_run=lambda _: None)
    tool = Tools(runtime, "run")
    tool._invoke = AsyncMock()
    result = await tool.invoke(name, args)
    assert "Invalid tool input" in result["error"]
    assert "secret" not in json.dumps(result) + json.dumps(store.events)
    tool._invoke.assert_not_awaited()
    start, failed = [event for event in store.events if event["type"].startswith("tool.")]
    assert failed["type"] == "tool.failed"
    assert start["payload"]["call_id"] == failed["payload"]["call_id"]


def test_optional_fields_stay_optional_and_unknown_tool_fails():
    validate_input("ask_user", {"question": "Continue?"})
    validate_input("desktop_input", {"action": "click", "x": 20, "y": 30})
    validate_input("shell_exec", {"command": "pwd"})
    with pytest.raises(ToolInputError, match="Unknown tool"):
        validate_input("missing", {})


async def test_private_catalog_and_execution_require_active_run_token(tmp_path):
    app = create_app(Config(database_url="sqlite:///" + str(tmp_path / "registry.db"),
                            data_dir=str(tmp_path), session_token="session",
                            computer_token="computer", shell_token="shell"))
    runtime = app.state.runtime
    runtime.tool_tokens["run"] = "run-token"
    runtime.tools["run"] = SimpleNamespace(invoke=AsyncMock(return_value={"ok": True}))
    url = "/internal/runs/run/tools"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test") as client:
        assert (await client.get(url)).status_code == 401
        assert (await client.get(url, headers={"Authorization": "Bearer wrong"})).status_code == 401
        headers = {"Authorization": "Bearer run-token"}
        assert (await client.get(url, headers=headers)).json() == {"tools": TOOLS}
        assert (await client.post(url + "/missing", headers=headers, json={})).status_code == 404
        assert (await client.post(url + "/desktop_windows", headers=headers, json={})).json() == {"ok": True}
        del runtime.tool_tokens["run"]
        assert (await client.get(url, headers=headers)).status_code == 401


async def test_openai_uses_registry_schema_and_execution_boundary(monkeypatch):
    from ohmydot import providers

    captured = []
    calls = SimpleNamespace(invoke=AsyncMock(return_value={"answer": "yes"}))

    async def events():
        if False:
            yield

    result = SimpleNamespace(stream_events=events,
                             final_output=providers.Outcome(status="completed", message="done"),
                             cancel=lambda: None,
                             context_wrapper=SimpleNamespace(usage=SimpleNamespace(
                                 requests=0, input_tokens=0, output_tokens=0, input_tokens_details=None)))

    def stream(agent, **kwargs):
        captured.extend(agent.tools)
        return result

    monkeypatch.setattr(providers, "api_key", lambda _: "test-key")
    monkeypatch.setattr(providers.Runner, "run_streamed", stream)
    runtime = SimpleNamespace(store=Events(), config=None)
    assert await providers.run_openai(runtime, SimpleNamespace(id="run", model="test"), [], calls) == "done"
    assert [{"name": tool.name, "description": tool.description, "inputSchema": tool.params_json_schema}
            for tool in captured] == TOOLS
    question = next(tool for tool in captured if tool.name == "ask_user")
    await question.on_invoke_tool(None, '{"question":"Continue?"}')
    calls.invoke.assert_awaited_once_with("ask_user", {"question": "Continue?"})


async def test_real_stdio_mcp_lists_authoritative_schema_and_preserves_arguments():
    seen = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def reply(self, body, status=200):
            payload = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def do_GET(self):
            if self.headers.get("Authorization") != "Bearer test-run":
                return self.reply({}, 401)
            self.reply({"tools": TOOLS})

        def do_POST(self):
            if self.headers.get("Authorization") != "Bearer test-run":
                return self.reply({}, 401)
            args = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            name = self.path.rsplit("/", 1)[-1]
            seen.append((name, args))
            try:
                validate_input(name, args)
            except ToolInputError as exc:
                return self.reply({"error": str(exc)})
            if name == "desktop_screenshot":
                return self.reply({"image_url": "data:image/png;base64,aGVsbG8=", "notice": "observed"})
            self.reply({"answer": "yes"})

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    bridge = Path(__file__).resolve().parents[1] / "apps/api/ohmydot/mcp_bridge.py"
    params = StdioServerParameters(command=sys.executable, args=[str(bridge)], env={
        "DOT_TOOL_URL": f"http://127.0.0.1:{server.server_port}/internal/runs/test/tools",
        "DOT_RUN_TOKEN": "test-run",
    })
    try:
        async with asyncio.timeout(20):
            async with stdio_client(params) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    catalog = await session.list_tools()
                    assert [{"name": tool.name, "description": tool.description, "inputSchema": tool.input_schema}
                            for tool in catalog.tools] == TOOLS
                    result = await session.call_tool("ask_user", {"question": "Continue?"})
                    assert not result.is_error
                    assert seen[-1] == ("ask_user", {"question": "Continue?"})  # No injected options=None.
                    failed = await session.call_tool("desktop_input", {"action": "secret-invalid"})
                    assert failed.is_error and "secret" not in failed.content[0].text
                    image = await session.call_tool("desktop_screenshot", {})
                    assert image.content[0].type == "image" and image.content[0].data == "aGVsbG8="
                    assert json.loads(image.content[1].text) == {"notice": "observed"}
                    count = len(seen)
                    unknown = await session.call_tool("missing", {})
                    assert unknown.is_error and len(seen) == count
    finally:
        await asyncio.to_thread(server.shutdown)
        server.server_close()
        thread.join(timeout=2)
