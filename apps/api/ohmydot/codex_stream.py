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
from .tool_registry import TOOLS


async def run_streamed_codex(runtime, run, history):
    from .providers import instructions_for, Outcome, codex_args, final_answer

    if not shutil.which(runtime.config.codex_bin):
        raise RuntimeError("CODEX_NOT_INSTALLED")
    stream = OutputStream(runtime.store, run.id)
    args = codex_args(runtime.config)
    # Carry over the same disabled host tools as the noninteractive runner.
    overrides = [part for i, value in enumerate(args) if value == "-c" for part in args[i:i + 2]]
    bridge = str(Path(__file__).with_name("mcp_bridge.py").resolve())
    dot_server = {
        "command": sys.executable, "args": [bridge], "required": True,
        "default_tools_approval_mode": "approve", "tool_timeout_sec": 3600,
        "env": {"DOT_TOOL_URL": runtime.config.internal_url + "/internal/runs/" + run.id + "/tools",
                "DOT_RUN_TOKEN": runtime.tool_tokens[run.id]},
    }
    with tempfile.TemporaryDirectory(prefix="ohmydot-stream-") as cwd:
        proc = await asyncio.create_subprocess_exec(
            runtime.config.codex_bin, "app-server", "--listen", "stdio://", *overrides,
            "-c", 'user_instructions=""',
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
        usage_input = 0
        usage_requests = 0
        usage_count_known = True
        async def notification(event):
            nonlocal answer, usage_input, usage_requests, usage_count_known
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
                usage = params["tokenUsage"]
                total, last = usage["total"], usage.get("last", {})
                current = total.get("inputTokens", 0)
                if current > usage_input:
                    # Count only complete per-request reports; duplicate notifications
                    # do not add calls. Omit the count if the provider skipped a report.
                    usage_count_known &= current - usage_input == last.get("inputTokens")
                    usage_requests += 1
                    usage_input = current
                record_usage(runtime.store, run.id, "codex", total, last=last,
                             requests=usage_requests if usage_count_known and usage_requests else None)

        try:
            await request(1, "initialize", {"clientInfo": {"name": "ohmydots", "title": "OhMyDots",
                                                           "version": "0.0.1"},
                                             "capabilities": {"experimentalApi": True}})
            await send({"method": "initialized"})
            # app-server has no exec's --ignore-user-config flag. Config tables
            # merge, so assigning mcp_servers={dot=...} alone keeps host servers.
            # Read names through the protocol (never log config/auth values), and
            # disable inherited servers only for this ephemeral product thread.
            effective = await request(2, "config/read", {"includeLayers": False, "cwd": cwd})
            inherited = effective["config"].get("mcp_servers", {})
            # The discovery flag alone does not remove the installed skill catalog
            # in all CLI versions. Disable its paths explicitly for this thread;
            # product skills remain available through our own MCP tools.
            catalog = await request(3, "skills/list", {"cwds": [cwd], "forceReload": False})
            host_skills = sorted({skill["path"] for entry in catalog["data"] for skill in entry["skills"]})
            thread = await request(4, "thread/start", {
                "cwd": cwd, "ephemeral": True, "approvalPolicy": "never", "sandbox": "read-only",
                # Supply the product's full instructions as the base instead of
                # appending them to the large general-purpose coding-agent prompt.
                "baseInstructions": instructions_for(run), "developerInstructions": "",
                "config": {"mcp_servers": {**{name: {"enabled": False}
                                             for name in inherited if name != "dot"},
                                           "dot": dot_server},
                           "skills": {"config": [{"path": path, "enabled": False} for path in host_skills]}},
                **({"model": run.model} if run.model else {}),
            })
            thread_id = thread["thread"]["id"]
            inventory = await request(5, "mcpServerStatus/list", {
                "threadId": thread_id, "limit": 100, "detail": "toolsAndAuthOnly"})
            servers = inventory["data"]
            dot = next((row for row in servers if row["name"] == "dot"), {})
            runtime.store.event("run.toolset", "도구 연결 확인", run.id, {
                "provider": "codex", "tool_count": len(dot.get("tools", {})),
                "host_tools": sum(len(row.get("tools", {})) for row in servers if row["name"] != "dot"),
                "tool_names": sorted(tool["name"] for tool in dot.get("tools", {}).values()),
                "host_skills_disabled": len(host_skills),
            })
            if (inventory.get("nextCursor") or
                    any(row.get("tools") for row in servers if row["name"] != "dot") or
                    {tool["name"] for tool in dot.get("tools", {}).values()} != {tool["name"] for tool in TOOLS}):
                raise RuntimeError("CODEX_TOOLSET_MISMATCH")
            prompt = "\n\n".join(item["role"] + ": " + item["content"] for item in history)
            await request(6, "turn/start", {"threadId": thread_id,
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
