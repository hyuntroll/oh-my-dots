"""Use the local Codex app-server protocol without reading or copying credentials."""
import asyncio
import json
import os
import shutil
import signal
import sys
import tempfile
from pathlib import Path

from .execution import OutputStream, record_usage


async def run_streamed_codex(runtime, run, history):
    from .providers import INSTRUCTIONS, Outcome, codex_args, final_answer

    if not shutil.which(runtime.config.codex_bin):
        raise RuntimeError("CODEX_NOT_INSTALLED")
    stream = OutputStream(runtime.store, run.id)
    args = codex_args(runtime.config)
    # Carry over the same disabled host tools as the noninteractive runner.
    overrides = [part for i, value in enumerate(args) if value == "-c" for part in args[i:i + 2]]
    bridge = str(Path(__file__).with_name("mcp_bridge.py").resolve())
    mcp = ('{dot={command=' + json.dumps(sys.executable) + ',args=[' + json.dumps(bridge)
           + '],required=true,default_tools_approval_mode="approve",tool_timeout_sec=3600,env={'
           + 'DOT_TOOL_URL=' + json.dumps(runtime.config.internal_url + "/internal/runs/" + run.id + "/tools")
           + ',DOT_RUN_TOKEN=' + json.dumps(runtime.tool_tokens[run.id]) + '}}}')
    with tempfile.TemporaryDirectory(prefix="ohmydot-stream-") as cwd:
        proc = await asyncio.create_subprocess_exec(
            runtime.config.codex_bin, "app-server", "--listen", "stdio://", *overrides,
            "-c", "mcp_servers=" + mcp, "-c", 'user_instructions=""',
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL, limit=2**22, start_new_session=True, cwd=cwd,
        )
        async def send(message):
            proc.stdin.write((json.dumps(message) + "\n").encode())
            await proc.stdin.drain()

        async def read():
            line = await proc.stdout.readline()
            if not line:
                raise RuntimeError("CODEX_CONNECTION_CLOSED")
            return json.loads(line)

        async def request(request_id, method, params):
            await send({"id": request_id, "method": method, "params": params})
            while True:
                event = await read()
                if event.get("id") == request_id and "method" not in event:
                    if "error" in event:
                        raise RuntimeError("CODEX_PROTOCOL_ERROR")
                    return event["result"]
                await notification(event)

        answer = ""
        phases = {}
        async def notification(event):
            nonlocal answer
            method, params = event.get("method"), event.get("params", {})
            # Reject any unexpected host tool/approval request; only our MCP tools run.
            if "id" in event and method:
                await send({"id": event["id"], "error": {"code": -32601, "message": "Unsupported request"}})
                return
            if method == "item/started" and params.get("item", {}).get("type") == "agentMessage":
                item = params["item"]
                phases[item["id"]] = item.get("phase")
            elif method == "item/agentMessage/delta":
                item_id = params["itemId"]
                stream.update(item_id, params["delta"], structured=phases.get(item_id) != "commentary")
            elif method == "item/completed" and params.get("item", {}).get("type") == "agentMessage":
                item = params["item"]
                text = item.get("text", "")
                structured = item.get("phase") != "commentary"
                stream.update(item["id"], text, structured=structured, replace=True, force=True)
                if structured:
                    answer = text
            elif method == "thread/tokenUsage/updated":
                record_usage(runtime.store, run.id, "codex", params["tokenUsage"]["total"])

        try:
            await request(1, "initialize", {"clientInfo": {"name": "ohmydots", "title": "OhMyDots",
                                                           "version": "0.0.1"},
                                             "capabilities": {"experimentalApi": True}})
            await send({"method": "initialized"})
            thread = await request(2, "thread/start", {
                "cwd": cwd, "ephemeral": True, "approvalPolicy": "never", "sandbox": "read-only",
                "developerInstructions": INSTRUCTIONS,
                **({"model": run.model} if run.model else {}),
            })
            thread_id = thread["thread"]["id"]
            prompt = "\n\n".join(item["role"] + ": " + item["content"] for item in history)
            await request(3, "turn/start", {"threadId": thread_id,
                                           "input": [{"type": "text", "text": prompt}],
                                           "outputSchema": Outcome.model_json_schema()})
            while True:
                event = await read()
                await notification(event)
                if event.get("method") == "turn/completed":
                    if event["params"]["turn"]["status"] != "completed" or not answer:
                        raise RuntimeError("CODEX_RUN_FAILED")
                    return final_answer(Outcome.model_validate_json(answer))
        finally:
            if proc.returncode is None:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            await proc.wait()
