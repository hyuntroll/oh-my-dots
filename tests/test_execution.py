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


@pytest.mark.asyncio
async def test_codex_streams_before_completion_and_cleans_up(monkeypatch):
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
        elif request.get("method") == "thread/start":
            assert request["params"]["sandbox"] == "read-only"
            assert request["params"]["ephemeral"]
            feed({"id": request["id"], "result": {"thread": {"id": "thread"}}})
        elif request.get("method") == "turn/start":
            assert "outputSchema" in request["params"]
            feed({"id": request["id"], "result": {}})
            feed({"method": "item/agentMessage/delta", "params": {"itemId": "a", "delta": final[:-8]}})
            feed({"method": "item/completed", "params": {"item": {
                "type": "agentMessage", "id": "a", "phase": "final_answer", "text": final}}})
            feed({"method": "thread/tokenUsage/updated", "params": {
                "tokenUsage": {"total": {"inputTokens": 12, "outputTokens": 4, "cachedInputTokens": 2}}}})
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
    result = await run_codex(runtime, SimpleNamespace(id="run", model=""), [], None)
    assert result == "hello world"
    assert store.events[0]["payload"]["text"] != result
    assert store.events[-1]["payload"]["cached_input_tokens"] == 2
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
    assert cancelled
