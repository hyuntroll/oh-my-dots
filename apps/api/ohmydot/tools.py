import asyncio
import base64
import json
import time
import uuid

import httpx

from .tool_registry import ToolInputError, validate_input


class Tools:
    def __init__(self, runtime, run_id):
        self.runtime = runtime
        self.run_id = run_id
        self.calls = 0
        self.failures = 0
        self.verified = set()
        self.written = set()
        self.last_failure = None
        self.active_seconds = 0

    async def invoke(self, name, args):
        self.runtime.check_run(self.run_id)
        self.calls += 1
        if self.calls > self.runtime.config.max_tools:
            await self.runtime.abort(self.run_id, "TOOL_LIMIT_EXCEEDED")
            raise asyncio.CancelledError()
        descriptions = {
            "desktop_screenshot": "현재 화면을 살펴보고 있어요",
            "desktop_input": "컴퓨터를 조작하고 있어요",
            "desktop_windows": "열린 창을 확인하고 있어요",
            "shell_exec": "명령을 실행하고 있어요",
            "artifact_write": "결과 파일을 작성하고 있어요",
            "artifact_read": "파일 내용을 확인하고 있어요",
            "ask_user": "답변을 기다리고 있어요",
        }
        call_id = str(uuid.uuid4())
        # Persist only display metadata, never screenshots or GUI text input.
        fields = {"shell_exec": ("command", "cwd"), "artifact_read": ("path",),
                  "artifact_write": ("path",), "desktop_input": ("action", "app",)}
        validation_error = None
        try:
            validate_input(name, args)
        except ToolInputError as exc:
            validation_error = exc
        metadata = {"call_id": call_id}
        for key in fields.get(name, ()) if validation_error is None else ():
            if isinstance(args.get(key), str):
                metadata[key] = args[key][:8192]
                if len(args[key]) > 8192:
                    metadata[key + "_truncated"] = True
        self.runtime.store.event("tool.started", name, self.run_id, metadata)
        self.runtime.store.event("run.activity", descriptions.get(name, "도구를 실행하고 있어요"),
                                 self.run_id, {"tool": name})
        started = time.monotonic()
        terminal_recorded = False
        try:
            if validation_error is not None:
                raise validation_error
            result = await self._invoke(name, args)
            self.runtime.check_run(self.run_id)
            if result.get("exit_code", 0) != 0 or result.get("timed_out", False):
                fingerprint = (name, json.dumps(args, sort_keys=True))
                self.failures = self.failures + 1 if fingerprint == self.last_failure else 1
                self.last_failure = fingerprint
            else:
                self.failures = 0
                self.last_failure = None
            details = {
                key: result[key]
                for key in ("exit_code", "timed_out", "stdout_truncated", "stderr_truncated")
                if key in result
            }
            details.update(call_id=call_id, duration_ms=round((time.monotonic() - started) * 1000))
            if name in ("shell_exec", "artifact_read"):
                for key in ("stdout", "stderr"):
                    if isinstance(result.get(key), str):
                        details[key] = result[key][:8192]
                        details[key + "_truncated"] = bool(result.get(key + "_truncated")) or len(result[key]) > 8192
            self.runtime.store.event("tool.completed", name, self.run_id, details)
            terminal_recorded = True
            if self.failures >= 3:
                await self.runtime.abort(self.run_id, "REPEATED_TOOL_FAILURE")
                raise asyncio.CancelledError()
            self.runtime.store.event("run.activity", "실행 결과를 확인하고 있어요", self.run_id)
            return result
        except asyncio.CancelledError:
            if not terminal_recorded:
                self.runtime.store.event("tool.cancelled", name, self.run_id,
                                         {"call_id": call_id, "duration_ms": round((time.monotonic() - started) * 1000)})
            raise
        except Exception as exc:
            fingerprint = (name, json.dumps(args, sort_keys=True))
            self.failures = self.failures + 1 if fingerprint == self.last_failure else 1
            self.last_failure = fingerprint
            self.runtime.store.event("tool.failed", name, self.run_id, {"call_id": call_id, "duration_ms": round((time.monotonic() - started) * 1000),
                                      "error": type(exc).__name__})
            if self.failures >= 3:
                await self.runtime.abort(self.run_id, "REPEATED_TOOL_FAILURE")
                raise asyncio.CancelledError() from exc
            return {"error": str(exc)[:400]}
        finally:
            self.active_seconds += time.monotonic() - started

    async def _invoke(self, name, args):
        if name == "desktop_screenshot":
            return {"image_url": await self.runtime.desktop.image()}
        if name == "desktop_windows":
            return await self.runtime.desktop.get("/windows")
        if name == "desktop_input":
            state = await self.runtime.desktop.get("/control")
            if state["owner"] != "AGENT" or state["handoff"]:
                await self.runtime.wait_control(self.run_id)
                # Drop stale coordinates instead of executing a queued GUI action.
                return {
                    "image_url": await self.runtime.desktop.image(),
                    "notice": "Control returned. Previous action was discarded. Replan from this new screen.",
                }
            payload = {**args, "actor": "AGENT", "epoch": state["epoch"]}
            try:
                await self.runtime.desktop.post("/input", payload)
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code != 409:
                    raise
                await self.runtime.wait_control(self.run_id)
                return {
                    "image_url": await self.runtime.desktop.image(),
                    "notice": "Control changed; action discarded. Observe and replan.",
                }
            await asyncio.sleep(0.2)
            return {"image_url": await self.runtime.desktop.image()}
        if name == "shell_exec":
            result = await self.runtime.shell.post("/exec", {**args, "run_id": self.run_id}, timeout=130)
            if result["exit_code"] != 0 or result["timed_out"]:
                self.runtime.store.event(
                    "shell.failed",
                    "셸 명령 실패",
                    self.run_id,
                    {"exit_code": result["exit_code"], "timed_out": result["timed_out"]},
                )
            return result
        if name in ("artifact_write", "artifact_read"):
            path = args["path"]
            # Quote literal paths and text as Python literals; no shell interpolation.
            code = (
                'from pathlib import Path; root=Path("/workspace/artifacts").resolve(); '
                f"p=(root/{path!r}).resolve(); "
                'assert p.is_relative_to(root) and p != root, "Artifact path outside root"; '
            )
            if name == "artifact_write":
                text = args["text"]
                if len(text.encode()) > 65536:
                    raise ValueError("Artifact exceeds 64 KiB")
                code += f'p.parent.mkdir(parents=True,exist_ok=True); p.write_text({text!r},encoding="utf-8"); print(str(p))'
            else:
                code += 'assert p.stat().st_size <= 65536, "Artifact exceeds 64 KiB"; print(p.read_text(encoding="utf-8"))'
            import shlex

            result = await self.runtime.shell.post(
                "/exec",
                {"run_id": self.run_id, "command": "python3 -c " + shlex.quote(code), "cwd": "/workspace"},
            )
            if result["exit_code"]:
                raise ValueError("Artifact operation failed")
            if name == "artifact_write":
                self.written.add(path)
                self.verified.discard(path)
            else:
                self.verified.add(path)
            return result
        if name == "ask_user":
            return {"answer": await self.runtime.ask_user(self.run_id, args["question"],
                                                          args.get("options"), args.get("recommended_index", 0))}
        raise ValueError("Unknown tool")


class Adapter:
    def __init__(self, url, token):
        self.url = url.rstrip("/")
        self.headers = {"Authorization": "Bearer " + token}

    async def get(self, path, raw=False):
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(self.url + path, headers=self.headers)
            r.raise_for_status()
            return r.content if raw else r.json()

    async def post(self, path, body=None, timeout=8):
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(self.url + path, json=body or {}, headers=self.headers)
            r.raise_for_status()
            return r.json()

    async def image(self):
        png = await self.get("/screen", raw=True)
        return "data:image/png;base64," + base64.b64encode(png).decode()
