import asyncio
import base64
import hashlib
import io
import json
import struct
import time
import uuid

import httpx
from PIL import Image, ImageChops

from .skills import list_skills, read_skill
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
        self.desktop_actions = 0
        self.last_desktop_action_call = 0
        self.last_observation_call = 0
        self.screen_hash = None
        self.screen_size = None
        self.screen_pixels = None
        self.unchanged_action = None
        self.unchanged_count = 0
        self.last_error = None
        self.last_user_answer = None

    async def capability_state(self):
        state = {"computer": {"available": None, "registered": True,
                              "capabilities": ["screenshot", "mouse_click", "mouse_move", "keyboard", "scroll"]}}
        try:
            control = await self.runtime.desktop.get("/control")
            state["computer"].update(available=True, control_owner=control["owner"],
                                      takeover=bool(control["handoff"]))
        except Exception as exc:
            state["computer"].update(available=False, connection_error=type(exc).__name__, retryable=True)
        self.runtime.store.event("run.capabilities", "컴퓨터 연결 상태 확인", self.run_id, state)
        return state

    async def observe(self, target=None):
        image_url = await self.runtime.desktop.image()
        # Compare actual PNG pixels in memory; never store the screenshot in events.
        digest = hashlib.sha256(image_url.encode()).hexdigest()
        changed = None if self.screen_hash is None else digest != self.screen_hash
        self.screen_hash = digest
        self.last_observation_call = self.calls
        result = {"image_url": image_url, "screen_changed": changed, "observation_id": self.calls}
        raw = base64.b64decode(image_url.split(",", 1)[1]) if image_url.startswith("data:image/png;base64,") else b""
        if raw.startswith(b"\x89PNG\r\n\x1a\n") and len(raw) >= 24:
            self.screen_size = struct.unpack(">II", raw[16:24])
            result.update(screen_width=self.screen_size[0], screen_height=self.screen_size[1])
            try:
                current = Image.open(io.BytesIO(raw)).convert("RGB")
                if self.screen_pixels is not None and self.screen_pixels.size == current.size:
                    diff = ImageChops.difference(self.screen_pixels, current)
                    result["screen_changed"] = diff.getbbox() is not None
                    if target is not None:
                        x, y = target
                        # Compare the clicked region; a timer elsewhere is not evidence that a click worked.
                        region = diff.crop((max(0, x - 16), max(0, y - 16),
                                            min(current.width, x + 17), min(current.height, y + 17)))
                        result["target_changed"] = region.getbbox() is not None
                self.screen_pixels = current
            except OSError:
                pass  # Legacy adapters may only provide dimensions/hash comparison.
        if result.get("target_changed", result["screen_changed"]) is False:
            result["notice"] = "Capture is unchanged. Inspect focus, overlays and target coordinates; re-ground before retry."
        return result

    async def invoke(self, name, args):
        self.runtime.check_run(self.run_id)
        self.calls += 1
        if self.calls > self.runtime.config.max_tools:
            await self.runtime.abort(self.run_id, "TOOL_LIMIT_EXCEEDED")
            raise asyncio.CancelledError()
        descriptions = {
            "skills_list": "작업에 맞는 스킬을 찾고 있어요",
            "capabilities_resolve": "연결된 앱의 실행 경로를 확인하고 있어요",
            "integration_read": "연결된 앱에서 자료를 읽고 있어요",
            "skill_read": "작업 절차를 읽고 있어요",
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
        fields = {"skill_read": ("skill_id",), "shell_exec": ("command", "cwd"), "artifact_read": ("path",),
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
            if "error" in result or result.get("exit_code", 0) != 0 or result.get("timed_out", False):
                fingerprint = (name, json.dumps(args, sort_keys=True))
                self.failures = self.failures + 1 if fingerprint == self.last_failure else 1
                self.last_failure = fingerprint
                self.last_error = str(result.get("error") or result.get("stderr") or "Tool execution failed")[:400]
            else:
                self.failures = 0
                self.last_failure = None
                self.last_error = None
            details = {
                key: result[key]
                for key in ("exit_code", "timed_out", "stdout_truncated", "stderr_truncated", "screen_changed", "target_changed", "observation_id")
                if key in result
            }
            details.update(call_id=call_id, duration_ms=round((time.monotonic() - started) * 1000))
            if name == "skill_read":
                details.update(skill_id=result["id"], skill_title=result["title"],
                               skill_version=result["version"], skill_sha256=result["sha256"])
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
            self.last_error = str(exc)[:400]
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
        if name == "capabilities_resolve":
            return self.runtime.integrations.resolve(**args)
        if name == "integration_read":
            return await self.runtime.integrations.read(**args)
        if name == "skills_list":
            return {"skills": list_skills()}
        if name == "skill_read":
            return read_skill(args["skill_id"])
        if name == "desktop_screenshot":
            return await self.observe()
        if name == "desktop_windows":
            return await self.runtime.desktop.get("/windows")
        if name == "desktop_input":
            state = await self.runtime.desktop.get("/control")
            if state["owner"] != "AGENT" or state["handoff"]:
                await self.runtime.wait_control(self.run_id)
                # Drop stale coordinates instead of executing a queued GUI action.
                return {
                    **await self.observe(),
                    "notice": "Control returned. Previous action was discarded. Replan from this new screen.",
                }
            coordinate_action = args["action"] in ("click", "double_click", "move")
            if coordinate_action:
                if not self.screen_size:
                    raise ValueError("Observe desktop_screenshot before coordinate input")
                if not (0 <= args.get("x", -1) < self.screen_size[0] and
                        0 <= args.get("y", -1) < self.screen_size[1]):
                    raise ValueError("Coordinates outside the observed screen; re-observe and re-ground")
                fingerprint = json.dumps(args, sort_keys=True)
                if fingerprint == self.unchanged_action and self.unchanged_count >= 2:
                    raise ValueError("Two identical actions produced unchanged captures. Choose a different target or recovery action.")
            payload = {**args, "actor": "AGENT", "epoch": state["epoch"]}
            try:
                await self.runtime.desktop.post("/input", payload)
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code != 409:
                    raise
                await self.runtime.wait_control(self.run_id)
                return {
                    **await self.observe(),
                    "notice": "Control changed; action discarded. Observe and replan.",
                }
            self.desktop_actions += 1
            self.last_desktop_action_call = self.calls
            self.last_observation_call = 0
            await asyncio.sleep(0.2)
            result = await self.observe((args["x"], args["y"]) if coordinate_action else None)
            if coordinate_action and result.get("target_changed", result["screen_changed"]) is False:
                self.unchanged_count = self.unchanged_count + 1 if fingerprint == self.unchanged_action else 1
                self.unchanged_action = fingerprint
            else:
                self.unchanged_action, self.unchanged_count = None, 0
            return result
        if name == "shell_exec":
            result = await self.runtime.shell.post("/exec", {**args, "run_id": self.run_id}, timeout=args.get("timeout", 120) + 10)
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
            self.last_user_answer = await self.runtime.ask_user(self.run_id, args["question"],
                                                               args.get("options"), args.get("recommended_index", 0))
            return {"answer": self.last_user_answer}
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
