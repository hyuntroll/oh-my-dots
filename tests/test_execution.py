import asyncio
import json
from types import SimpleNamespace

import pytest
from ohmydot.execution import OutputStream
from ohmydot.providers import Outcome, run_codex, run_openai
from ohmydot.store import Conversation, Run, Store, Task


class Events:
    def __init__(self):
        self.events = []

    def event(self, kind, summary, run_id=None, payload=None):
        self.events.append({"type": kind, "run_id": run_id, "payload": payload})


def test_stream_exposes_message_not_outcome_json_and_decodes_escapes():
    store = Events()
    stream = OutputStream(store, "run")
    raw = json.dumps({"status": "completed", "message": '안녕\n"세계" 🌍'}, ensure_ascii=True)
    for char in raw:
        stream.update("answer", char, force=True)
    visible = [e["payload"]["text"] for e in store.events]
    assert visible[-1] == '안녕\n"세계" 🌍'
    assert all('"status"' not in text and '\\u' not in text for text in visible)
    assert len(visible) > 2
    stream.update("answer", raw, replace=True, force=True)
    assert len(store.events) == len(visible)  # Duplicate completion is idempotent.


def test_replay_and_usage_use_latest_report_per_run(tmp_path):
    store = Store("sqlite:///" + str(tmp_path / "events.db"))
    with store.session() as db:
        conversation = Conversation()
        db.add(conversation)
        db.flush()
        task = Task(conversation_id=conversation.id, prompt="test")
        db.add(task)
        db.flush()
        run = Run(task_id=task.id, conversation_id=conversation.id,
                  idempotency_key="one", provider="codex", model="test")
        db.add(run)
        db.commit()
    store.event("message.updated", "", run.id, {"text": "partial"})
    store.event("message.updated", "", run.id, {"text": "complete"})
    for count in (10, 20, 20):
        store.event("run.usage", "", run.id, {"input_tokens": count, "output_tokens": 5})
    assert len(store.execution(conversation.id)) == 2
    assert next(e for e in store.execution(conversation.id)
                if e["type"] == "message.updated")["payload"]["text"] == "complete"
    assert store.usage()["providers"][0]["input_tokens"] == 20
    assert store.usage()["recorded_runs"] == 1
    for kind in ("tool.started", "tool.completed", "tool.started", "tool.cancelled"):
        store.event(kind, "shell_exec", run.id, {"call_id": "test"})
    assert [e["type"] for e in store.execution(conversation.id) if e["type"].startswith("tool.")] == [
        "tool.started", "tool.completed", "tool.started", "tool.cancelled"]
    assert store.execution("another-conversation") == []


@pytest.mark.asyncio
@pytest.mark.parametrize("unexpected_host_tools", [False, True])
async def test_codex_streams_before_completion_and_cleans_up(monkeypatch, unexpected_host_tools):
    from ohmydot import codex_stream
    store = Events()
    reader = asyncio.StreamReader()
    killed = []
    proc = SimpleNamespace(stdout=reader, returncode=None, pid=123456789)
    final = '{"status":"completed","message":"hello world"}'

    def feed(value):
        reader.feed_data((json.dumps(value) + "\n").encode())

    def write(raw):
        request = json.loads(raw)
        if request.get("method") == "initialize":
            feed({"id": request["id"], "result": {}})
        elif request.get("method") == "config/read":
            assert not request["params"]["includeLayers"]
            feed({"id": request["id"], "result": {"config": {"mcp_servers": {
                "dot": {}, "host-server": {"env": {"SECRET": "not-for-model"}}}}}})
        elif request.get("method") == "skills/list":
            feed({"id": request["id"], "result": {"data": [{"skills": [
                {"path": "/private/host/SKILL.md", "description": "not-for-model"}]}]}})
        elif request.get("method") == "thread/start":
            assert request["params"]["sandbox"] == "read-only"
            assert request["params"]["ephemeral"]
            from ohmydot.providers import instructions_for
            assert request["params"]["baseInstructions"] == instructions_for(SimpleNamespace())
            assert request["params"]["developerInstructions"] == ""
            assert request["params"]["approvalPolicy"] == "never"
            servers = request["params"]["config"]["mcp_servers"]
            assert set(servers) == {"host-server", "dot"}
            assert servers["host-server"] == {"enabled": False}
            assert servers["dot"]["required"]
            assert servers["dot"]["env"]["DOT_TOOL_URL"] == "http://local/internal/runs/run/tools"
            assert request["params"]["config"]["skills"] == {
                "config": [{"path": "/private/host/SKILL.md", "enabled": False}]}
            feed({"id": request["id"], "result": {"thread": {"id": "thread"}}})
        elif request.get("method") == "mcpServerStatus/list":
            from ohmydot.tool_registry import TOOLS
            servers = [{"name": "dot", "tools": {tool["name"]: tool for tool in TOOLS}}]
            if unexpected_host_tools:
                servers.append({"name": "host-server", "tools": {"host_shell": {"name": "host_shell"}}})
            feed({"id": request["id"], "result": {"data": servers}})
        elif request.get("method") == "turn/start":
            assert not unexpected_host_tools  # No model request with inherited host tools.
            assert "outputSchema" in request["params"]
            feed({"id": request["id"], "result": {}})
            feed({"method": "item/agentMessage/delta", "params": {"itemId": "a", "delta": final[:-8]}})
            feed({"method": "item/completed", "params": {"item": {
                "type": "agentMessage", "id": "a", "phase": "final_answer", "text": final}}})
            for total in (6, 6, 12):  # A replay must not add another request.
                feed({"method": "thread/tokenUsage/updated", "params": {
                    "tokenUsage": {"total": {"inputTokens": total, "outputTokens": 4, "cachedInputTokens": 2},
                                   "last": {"inputTokens": 6}}}})
            feed({"method": "turn/completed", "params": {"turn": {"status": "completed"}}})

    async def drain():
        pass

    async def wait():
        proc.returncode = -9

    async def spawn(*args, **kwargs):
        assert "app-server" in args and "features.shell_tool=false" in args
        return proc

    proc.stdin = SimpleNamespace(write=write, drain=drain)
    proc.wait = wait
    monkeypatch.setattr(codex_stream.shutil, "which", lambda _: "codex")
    monkeypatch.setattr(codex_stream.asyncio, "create_subprocess_exec", spawn)
    monkeypatch.setattr(codex_stream.os, "killpg", lambda pid, sig: killed.append(pid))
    runtime = SimpleNamespace(config=SimpleNamespace(codex_bin="codex", internal_url="http://local"),
                              store=store, tool_tokens={"run": "private"})
    if unexpected_host_tools:
        with pytest.raises(RuntimeError, match="CODEX_TOOLSET_MISMATCH"):
            await run_codex(runtime, SimpleNamespace(id="run", model=""), [], None)
        assert killed == [proc.pid]
        return
    result = await run_codex(runtime, SimpleNamespace(id="run", model=""), [], None)
    assert result == "hello world"
    assert next(e for e in store.events if e["type"] == "message.updated")["payload"]["text"] != result
    assert store.events[-1]["payload"]["cached_input_tokens"] == 2
    assert store.events[-1]["payload"]["model_requests"] == 2
    assert store.events[-1]["payload"]["last_input_tokens"] == 6
    assert "not-for-model" not in json.dumps(store.events)
    assert killed == [proc.pid]


@pytest.mark.asyncio
async def test_openai_stream_and_usage_keep_final_outcome(monkeypatch):
    from ohmydot import providers
    store = Events()
    final = '{"status":"completed","message":"안녕하세요"}'
    cancelled = []

    async def events():
        for text in [final[:38], final[38:]]:
            yield SimpleNamespace(type="raw_response_event", data=SimpleNamespace(
                type="response.output_text.delta", item_id="a", delta=text))
        yield SimpleNamespace(type="raw_response_event", data=SimpleNamespace(
            type="response.output_text.done", item_id="a", text=final))

    result = SimpleNamespace(stream_events=events, final_output=Outcome.model_validate_json(final),
                             cancel=lambda: cancelled.append(True), context_wrapper=SimpleNamespace(
                                 usage=SimpleNamespace(requests=1, input_tokens=9, output_tokens=3,
                                                       input_tokens_details=SimpleNamespace(cached_tokens=2))))
    monkeypatch.setattr(providers, "api_key", lambda _: "test-key")
    monkeypatch.setattr(providers.Runner, "run_streamed", lambda *args, **kwargs: result)
    runtime = SimpleNamespace(store=store, config=None)
    assert await run_openai(runtime, SimpleNamespace(id="run", model="test"), [], None) == "안녕하세요"
    assert any(e["type"] == "message.updated" for e in store.events)
    assert store.events[-1]["payload"]["input_tokens"] == 9
    assert store.events[-1]["payload"]["model_requests"] == 1
    assert cancelled


@pytest.mark.asyncio
async def test_tool_history_pairs_calls_bounds_output_and_excludes_images():
    from unittest.mock import AsyncMock

    from ohmydot.tools import Tools
    store = Events()
    runtime = SimpleNamespace(store=store, config=SimpleNamespace(max_tools=10), check_run=lambda _: None)
    tool = Tools(runtime, "run")
    tool._invoke = AsyncMock(return_value={"stdout": "x" * 9000, "stderr": "", "exit_code": 0,
                                          "image_url": "data:image/png;base64,private"})
    await tool.invoke("shell_exec", {"command": "echo demo"})
    start, end = [e for e in store.events if e["type"].startswith("tool.")]
    assert start["payload"]["call_id"] == end["payload"]["call_id"]
    assert start["payload"]["command"] == "echo demo"
    assert end["payload"]["duration_ms"] >= 0
    assert len(end["payload"]["stdout"]) == 8192
    assert end["payload"]["stdout_truncated"]
    assert "private" not in json.dumps(store.events)
    await tool.invoke("desktop_input", {"action": "type", "text": "private"})
    assert "private" not in json.dumps(store.events)


@pytest.mark.asyncio
async def test_cancelled_tool_records_terminal_event():
    from unittest.mock import AsyncMock

    from ohmydot.tools import Tools
    store = Events()
    runtime = SimpleNamespace(store=store, config=SimpleNamespace(max_tools=10), check_run=lambda _: None)
    tool = Tools(runtime, "run")
    tool._invoke = AsyncMock(side_effect=asyncio.CancelledError)
    with pytest.raises(asyncio.CancelledError):
        await tool.invoke("shell_exec", {"command": "sleep 30"})
    assert store.events[-1]["type"] == "tool.cancelled"
    assert store.events[-1]["payload"]["call_id"] == store.events[0]["payload"]["call_id"]


@pytest.mark.asyncio
async def test_repeated_failed_commands_keep_the_last_output_when_run_aborts():
    from unittest.mock import AsyncMock

    from ohmydot.tools import Tools
    store = Events()
    runtime = SimpleNamespace(store=store, config=SimpleNamespace(max_tools=10),
                              check_run=lambda _: None, abort=AsyncMock())
    tool = Tools(runtime, "run")
    tool._invoke = AsyncMock(return_value={"stdout": "", "stderr": "command failed", "exit_code": 2})
    for _ in range(2):
        await tool.invoke("shell_exec", {"command": "false"})
    with pytest.raises(asyncio.CancelledError):
        await tool.invoke("shell_exec", {"command": "false"})
    terminal = [e for e in store.events if e["type"] in ("tool.completed", "tool.cancelled")]
    assert len(terminal) == 3
    assert all(e["payload"]["stderr"] == "command failed" for e in terminal)
    runtime.abort.assert_awaited_once_with("run", "REPEATED_TOOL_FAILURE")


def test_usage_optional_details_do_not_invent_unknown_counts():
    from ohmydot.execution import record_usage
    store = Events()
    record_usage(store, "run", "codex", {"inputTokens": 100, "outputTokens": 5, "cachedInputTokens": 80})
    payload = store.events[-1]["payload"]
    assert "model_requests" not in payload and "last_input_tokens" not in payload
    record_usage(store, "run", "codex", {}, requests=True, last={"inputTokens": -1})
    assert "model_requests" not in store.events[-1]["payload"]
    assert "last_input_tokens" not in store.events[-1]["payload"]


def test_custom_identity_replaces_product_name_without_changing_agent_rules():
    from ohmydot.providers import INSTRUCTIONS, instructions_for
    named = instructions_for(SimpleNamespace(dot_name='Wars'))
    assert named.startswith(INSTRUCTIONS)
    assert '"Wars"' in named
    assert 'replaces any name in earlier conversation messages' in named
    assert '"OhMyDots"' in instructions_for(SimpleNamespace())
