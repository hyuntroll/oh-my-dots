import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

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
@pytest.mark.parametrize("unavailable_first", [False, True])
@pytest.mark.parametrize("unfinished_first", [False, True])
async def test_codex_streams_before_completion_and_cleans_up(monkeypatch, unexpected_host_tools, unavailable_first, unfinished_first):
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
            from ohmydot.providers import CODEX_TOOL_INSTRUCTIONS, instructions_for
            assert request["params"]["baseInstructions"] == instructions_for(SimpleNamespace()) + "\n" + CODEX_TOOL_INSTRUCTIONS
            assert request["params"]["developerInstructions"] == ""
            assert request["params"]["approvalPolicy"] == "never"
            servers = request["params"]["config"]["mcp_servers"]
            assert set(servers) == {"host-server", "dot"}
            assert servers["host-server"] == {"enabled": False}
            assert servers["dot"] == {"enabled": False}
            from ohmydot.tool_registry import TOOLS
            registered = request["params"]["dynamicTools"]
            assert [tool["name"] for tool in registered] == [tool["name"] for tool in TOOLS]
            assert all(not tool["deferLoading"] and tool["type"] == "function" for tool in registered)
            assert [tool["inputSchema"] for tool in registered] == [tool["inputSchema"] for tool in TOOLS]
            assert request["params"]["config"]["skills"] == {
                "config": [{"path": "/private/host/SKILL.md", "enabled": False}]}
            feed({"id": request["id"], "result": {"thread": {"id": "thread"}}})
        elif request.get("method") == "mcpServerStatus/list":
            servers = []
            if unexpected_host_tools:
                servers.append({"name": "host-server", "tools": {"host_shell": {"name": "host_shell"}}})
            feed({"id": request["id"], "result": {"data": servers}})
        elif request.get("method") == "thread/inject_items":
            assert request["params"]["items"] == [
                {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "play game"}]},
                {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "tools unavailable"}]}]
            feed({"id": request["id"], "result": {}})
        elif request.get("method") == "turn/start":
            assert not unexpected_host_tools  # No model request with inherited host tools.
            assert "outputSchema" in request["params"]
            schema = request["params"]["outputSchema"]
            assert set(schema["required"]) == set(schema["properties"])
            if request["id"] == 6:
                assert request["params"]["input"] == [{"type": "text", "text": "try again"}]
            elif request["id"] == 8:
                assert unavailable_first and request["id"] == 8
                assert request["params"]["input"][1] == {"type": "image", "url": "data:image/png;base64,test"}
                assert "base64" not in request["params"]["input"][0]["text"]
            else:
                assert unfinished_first and request["id"] == 9
                assert request["params"]["threadId"] == "thread"
                assert "Continue this same task" in request["params"]["input"][0]["text"]
                assert request["params"]["input"][1] == {"type": "image", "url": "data:image/png;base64,test"}
            feed({"id": request["id"], "result": {}})
            if unavailable_first and request["id"] == 6:
                feed({"method": "item/completed", "params": {"item": {
                    "type": "agentMessage", "id": "refusal", "phase": "final_answer",
                    "text": '{"status":"failed","message":"desktop tools unavailable"}'}}})
                feed({"method": "turn/completed", "params": {"turn": {"status": "completed"}}})
                return
            if unfinished_first and request["id"] != 9:
                feed({"method": "item/completed", "params": {"item": {
                    "type": "agentMessage", "id": "unfinished", "phase": "final_answer",
                    "text": '{"status":"failed","message":"No safe move yet; board in progress"}'}}})
                feed({"method": "turn/completed", "params": {"turn": {"status": "completed"}}})
                return
            for rpc_id, thread_id, tool in [(101, "foreign", "desktop_screenshot"),
                                            (102, "thread", "host_shell"),
                                            (103, "thread", "desktop_screenshot")]:
                feed({"id": rpc_id, "method": "item/tool/call", "params": {
                    "threadId": thread_id, "turnId": "turn", "callId": str(rpc_id),
                    "tool": tool, "arguments": {}}})
            feed({"method": "item/agentMessage/delta", "params": {"itemId": "a", "delta": final[:-8]}})
            feed({"method": "item/completed", "params": {"item": {
                "type": "agentMessage", "id": "a", "phase": "final_answer", "text": final}}})
            for total in (6, 6, 12):  # A replay must not add another request.
                feed({"method": "thread/tokenUsage/updated", "params": {
                    "tokenUsage": {"total": {"inputTokens": total, "outputTokens": 4, "cachedInputTokens": 2},
                                   "last": {"inputTokens": 6}}}})
            feed({"method": "turn/completed", "params": {"turn": {"status": "completed"}}})

        elif request.get("id") in (101, 102):
            assert request["error"]["code"] == -32601
        elif request.get("id") == 103:
            assert request["result"] == {"success": True, "contentItems": [
                {"type": "inputText", "text": '{"image_url": "data:image/png;base64,test", "epoch": 2}'}]}

    async def drain():
        pass

    async def wait():
        proc.returncode = -9

    async def spawn(*args, **kwargs):
        assert "app-server" in args and "features.shell_tool=false" in args
        assert "features.code_mode_host=true" in args
        return proc

    proc.stdin = SimpleNamespace(write=write, drain=drain)
    proc.wait = wait
    monkeypatch.setattr(codex_stream.shutil, "which", lambda _: "codex")
    monkeypatch.setattr(codex_stream.asyncio, "create_subprocess_exec", spawn)
    monkeypatch.setattr(codex_stream.os, "killpg", lambda pid, sig: killed.append(pid))
    runtime = SimpleNamespace(config=SimpleNamespace(codex_bin="codex", internal_url="http://local"),
                              store=store, tool_tokens={"run": "private"})
    tool_result = {"image_url": "data:image/png;base64,test", "epoch": 2}
    tools = SimpleNamespace(invoke=AsyncMock(return_value=tool_result), screen_hash="observed")
    history = [{"role": "user", "content": "play game"},
               {"role": "assistant", "content": "tools unavailable"},
               {"role": "user", "content": "try again"}]
    if unexpected_host_tools:
        with pytest.raises(RuntimeError, match="CODEX_TOOLSET_MISMATCH"):
            await run_codex(runtime, SimpleNamespace(id="run", model=""), history, tools)
        assert killed == [proc.pid]
        return
    result = await run_codex(runtime, SimpleNamespace(id="run", model=""), history, tools)
    assert result == "hello world"
    assert tools.invoke.await_count == 1 + int(unavailable_first) + int(unfinished_first)
    assert all(call.args == ("desktop_screenshot", {}) for call in tools.invoke.await_args_list)
    rechecks = [event for event in store.events if event["type"] == "run.tool_recheck"]
    assert len(rechecks) == int(unavailable_first)
    assert len([e for e in store.events if e["type"] == "run.checkpoint"]) == int(unfinished_first)
    assert tool_result["image_url"] == "data:image/png;base64,test"
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


def test_goal_loop_continues_uncertainty_and_rejects_unverified_gui_success():
    from ohmydot.providers import GoalLoop
    store = Events()
    runtime = SimpleNamespace(store=store, config=SimpleNamespace(max_tools=80))
    tools = SimpleNamespace(calls=3, desktop_actions=1, last_observation_call=3,
                            last_desktop_action_call=3, last_error=None, last_user_answer=None)
    loop = GoalLoop(runtime, SimpleNamespace(id="run"), tools)
    assert loop.continuation(Outcome(status="failed", message="안전한 수를 확정하지 못했습니다."))
    assert loop.continuation(Outcome(status="in_progress", message="진행 중", checkpoint="보드 분석", next_action="재관찰"))
    assert loop.continuation(Outcome(status="completed", message="승리했습니다."))
    assert loop.continuation(Outcome(status="completed", message="승리했습니다.", completion_evidence="승리 배너를 확인")) is None
    checkpoints = [e for e in store.events if e["type"] == "run.checkpoint"]
    assert len(checkpoints) == 3
    assert checkpoints[1]["payload"]["checkpoint"] == "보드 분석"


def test_goal_loop_stops_at_limit_or_observed_blocker():
    from ohmydot.providers import GoalLoop, TaskFailure
    runtime = SimpleNamespace(store=Events(), config=SimpleNamespace(max_tools=80))
    tools = SimpleNamespace(calls=0, desktop_actions=0, last_error=None, last_user_answer=None)
    loop = GoalLoop(runtime, SimpleNamespace(id="run"), tools)
    for _ in range(loop.max_continuations):
        assert loop.continuation(Outcome(status="in_progress", message="계속 분석"))
    with pytest.raises(TaskFailure, match="GOAL_CONTINUATION_LIMIT"):
        loop.continuation(Outcome(status="in_progress", message="계속 분석"))
    blocked = Outcome(status="blocked", message="컴퓨터 연결 오류", blocker="tool_error")
    loop = GoalLoop(runtime, SimpleNamespace(id="run"), tools)
    assert loop.continuation(blocked)  # A model claim without an observed error is insufficient.
    tools.last_error = "connection refused"
    assert loop.continuation(blocked)  # One tool error must allow recovery before terminating.
    assert loop.continuation(blocked)  # Repeating an answer without a new tool attempt is insufficient.
    tools.calls += 1
    assert loop.continuation(blocked) is None


@pytest.mark.asyncio
async def test_openai_continuation_keeps_tool_history_and_cumulative_usage(monkeypatch):
    from ohmydot import providers
    runs = []
    store = Events()

    async def events():
        if False:
            yield

    def invoke(agent, *, input, **kwargs):
        runs.append(input)
        if len(runs) == 1:
            outcome = Outcome(status='in_progress', message='첫 시도 실패, 재시작 가능', checkpoint='attempt 1')
        else:
            assert input[0]['role'] == 'assistant' and input[0]['content'] == 'prior tool transcript'
            assert 'Continue this same task' in input[-1]['content']
            outcome = Outcome(status='completed', message='verified result')
        return SimpleNamespace(stream_events=events, final_output=outcome, cancel=lambda: None,
                               to_input_list=lambda: [{'role': 'assistant', 'content': 'prior tool transcript'}],
                               context_wrapper=SimpleNamespace(usage=SimpleNamespace(
                                   requests=1, input_tokens=10, output_tokens=2,
                                   input_tokens_details=SimpleNamespace(cached_tokens=3))))

    monkeypatch.setattr(providers, 'api_key', lambda _: 'test')
    monkeypatch.setattr(providers.Runner, 'run_streamed', invoke)
    runtime = SimpleNamespace(store=store, config=SimpleNamespace(max_tools=80))
    assert await run_openai(runtime, SimpleNamespace(id='run', model='test'), [], None) == 'verified result'
    assert len(runs) == 2
    assert store.events[-1]['payload']['model_requests'] == 2
    assert store.events[-1]['payload']['input_tokens'] == 20


@pytest.mark.asyncio
async def test_desktop_unchanged_clicks_re_ground_and_reject_out_of_bounds():
    import base64
    import struct

    from ohmydot.tools import Tools
    # A deterministic PNG header is sufficient for coordinate bounds/hash comparisons.
    png = b'\x89PNG\r\n\x1a\n' + b'\0' * 8 + struct.pack('>II', 640, 480)
    url = 'data:image/png;base64,' + base64.b64encode(png).decode()
    desktop = SimpleNamespace(image=AsyncMock(return_value=url),
                              get=AsyncMock(return_value={'owner': 'AGENT', 'handoff': False, 'epoch': 0}),
                              post=AsyncMock(return_value={}))
    runtime = SimpleNamespace(desktop=desktop, store=Events(), config=SimpleNamespace(max_tools=80),
                              check_run=lambda _: None, abort=AsyncMock())
    tools = Tools(runtime, 'run')
    capability = await tools.capability_state()
    assert capability['computer']['available'] is True
    assert 'mouse_click' in capability['computer']['capabilities']
    before = await tools.invoke('desktop_screenshot', {})
    assert before['screen_width'] == 640 and before['screen_changed'] is None
    for _ in range(2):
        after = await tools.invoke('desktop_input', {'action': 'click', 'x': 10, 'y': 20})
        assert after['screen_changed'] is False and 're-ground' in after['notice']
    rejected = await tools.invoke('desktop_input', {'action': 'click', 'x': 10, 'y': 20})
    assert 'Two identical actions' in rejected['error']
    rejected = await tools.invoke('desktop_input', {'action': 'click', 'x': 640, 'y': 20})
    assert 'outside' in rejected['error']
    assert desktop.post.await_count == 2
    assert tools.last_observation_call == tools.last_desktop_action_call
    assert url not in json.dumps(runtime.store.events)
    # A different coordinate can recover without cancelling the run.
    await tools.invoke('desktop_input', {'action': 'click', 'x': 30, 'y': 20})
    assert desktop.post.await_count == 3
    runtime.abort.assert_not_awaited()


@pytest.mark.asyncio
async def test_click_verification_ignores_timer_changes_elsewhere():
    import base64
    import io

    from ohmydot.tools import Tools
    from PIL import Image

    def frame(timer, target=False):
        pixels = Image.new('RGB', (200, 100), 'white')
        pixels.putpixel((180, 10), (timer, 0, 0))
        if target:
            pixels.putpixel((30, 50), (0, 0, 0))
        output = io.BytesIO()
        pixels.save(output, format='PNG')
        return 'data:image/png;base64,' + base64.b64encode(output.getvalue()).decode()

    desktop = SimpleNamespace(image=AsyncMock(side_effect=[frame(0), frame(1), frame(2), frame(3, True)]),
                              get=AsyncMock(return_value={'owner': 'AGENT', 'handoff': False, 'epoch': 0}),
                              post=AsyncMock(return_value={}))
    runtime = SimpleNamespace(desktop=desktop, store=Events(), config=SimpleNamespace(max_tools=80),
                              check_run=lambda _: None, abort=AsyncMock())
    tools = Tools(runtime, 'run')
    await tools.invoke('desktop_screenshot', {})
    for _ in range(2):
        result = await tools.invoke('desktop_input', {'action': 'click', 'x': 30, 'y': 50})
        assert result['screen_changed'] is True
        assert result['target_changed'] is False
        assert 're-ground' in result['notice']
    rejected = await tools.invoke('desktop_input', {'action': 'click', 'x': 30, 'y': 50})
    assert 'Two identical actions' in rejected['error']
    assert desktop.post.await_count == 2
    result = await tools.invoke('desktop_input', {'action': 'click', 'x': 31, 'y': 50})
    assert result['target_changed'] is True
    assert tools.unchanged_count == 0


@pytest.mark.asyncio
async def test_continuation_observes_through_budget_and_cancel_boundary():
    from ohmydot.providers import GoalLoop
    from ohmydot.tools import Tools

    runtime = SimpleNamespace(store=Events(), config=SimpleNamespace(max_tools=0),
                              check_run=lambda _: None, abort=AsyncMock())
    tools = Tools(runtime, 'run')
    tools.desktop_actions = 1
    loop = GoalLoop(runtime, SimpleNamespace(id='run'), tools)
    with pytest.raises(asyncio.CancelledError):
        await loop.observe_continuation()
    runtime.abort.assert_awaited_once_with('run', 'TOOL_LIMIT_EXCEEDED')
    runtime.check_run = lambda _: (_ for _ in ()).throw(asyncio.CancelledError())
    with pytest.raises(asyncio.CancelledError):
        await loop.observe_continuation()
    assert tools.calls == 1  # Cancelled before another tool/capture can run.


@pytest.mark.asyncio
async def test_openai_continuation_includes_fresh_native_image(monkeypatch):
    from ohmydot import providers

    calls = []
    tools = SimpleNamespace(calls=1, desktop_actions=1, last_observation_call=1,
                            last_desktop_action_call=1,
                            invoke=AsyncMock(return_value={'image_url': 'data:image/png;base64,fresh'}))

    async def events():
        if False:
            yield

    def invoke(agent, *, input, **kwargs):
        calls.append(input)
        if len(calls) == 2:
            assert input[-1]['content'][1] == {
                'type': 'input_image', 'image_url': 'data:image/png;base64,fresh'}
        return SimpleNamespace(stream_events=events, cancel=lambda: None, to_input_list=lambda: [],
                               final_output=Outcome(status='in_progress' if len(calls) == 1 else 'completed',
                                                    message='result', completion_evidence='visible goal'),
                               context_wrapper=SimpleNamespace(usage=SimpleNamespace(requests=0)))

    monkeypatch.setattr(providers, 'api_key', lambda _: 'test')
    monkeypatch.setattr(providers.Runner, 'run_streamed', invoke)
    runtime = SimpleNamespace(store=Events(), config=SimpleNamespace(max_tools=80))
    assert await run_openai(runtime, SimpleNamespace(id='run', model='test'), [], tools) == 'result'
    tools.invoke.assert_awaited_once_with('desktop_screenshot', {})
