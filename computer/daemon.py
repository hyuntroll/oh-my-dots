"""Private GUI adapter. Ownership checks and X11 input share one lock."""

import asyncio
import base64
import io
import os
import re
import secrets
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

try:
    from .appearance import Appearance, write_appearance
except ImportError:
    from appearance import Appearance, write_appearance

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

WIDTH, HEIGHT = 1280, 960
TOKEN = os.environ.get("COMPUTER_TOKEN", "")
if not TOKEN:
    raise RuntimeError("COMPUTER_TOKEN is required")


async def authorize(request: Request):
    if not secrets.compare_digest(request.headers.get("authorization", ""), f"Bearer {TOKEN}"):
        raise HTTPException(401, "Unauthorized")


async def command(*args):
    proc = await asyncio.create_subprocess_exec(
        *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), 3)
    except BaseException:
        proc.kill()
        await proc.wait()
        raise
    if proc.returncode:
        raise HTTPException(502, "Desktop command failed")
    return stdout.decode(errors="replace")


async def capture():
    def grab():
        import mss
        from PIL import Image

        with mss.mss() as screen:
            shot = screen.grab(screen.monitors[1])
            output = io.BytesIO()
            Image.frombytes("RGB", shot.size, shot.rgb).save(output, "PNG")
            return output.getvalue()

    return await asyncio.to_thread(grab)


class Input(BaseModel):
    actor: Literal["AGENT", "USER"]
    epoch: int
    action: Literal[
        "move",
        "click",
        "double_click",
        "down",
        "up",
        "scroll",
        "type",
        "key",
        "keydown",
        "keyup",
        "hotkey",
        "launch",
        "focus",
    ]
    x: int = Field(0, ge=0, lt=WIDTH)
    y: int = Field(0, ge=0, lt=HEIGHT)
    button: int = Field(1, ge=1, le=3)
    delta: int = Field(0, ge=-20, le=20)
    text: str = Field("", max_length=4000)
    key: str = Field("", max_length=80)
    app: Literal["chromium", "terminal", "files"] = "chromium"
    service: Literal["gmail", "calendar", "drive", "slack"] | None = None
    window_id: str = ""


class Owner(BaseModel):
    owner: Literal["AGENT", "USER"]


class Return(BaseModel):
    epoch: int


class Gate:
    def __init__(self):
        self.lock = asyncio.Lock()
        self.owner = "AGENT"
        # A restarted GUI must reject inputs issued against the previous boot.
        self.epoch = secrets.randbits(52)
        self.handoff = False
        self.handoff_since = 0
        self.keys = set()
        self.buttons = set()

    def status(self):
        return {
            "owner": self.owner,
            "epoch": self.epoch,
            "handoff": self.handoff,
            "width": WIDTH,
            "height": HEIGHT,
        }

    async def release(self):
        for key in list(self.keys):
            await command("xdotool", "keyup", key)
        for button in list(self.buttons):
            await command("xdotool", "mouseup", str(button))
        self.keys.clear()
        self.buttons.clear()

    async def takeover(self):
        self.handoff = True
        self.handoff_since = time.monotonic()
        async with self.lock:
            try:
                await self.release()
                self.owner = "USER"
                self.epoch += 1
            finally:
                self.handoff = False
        return self.status()

    async def prepare_return(self):
        self.handoff = True
        self.handoff_since = time.monotonic()
        async with self.lock:
            try:
                await self.release()
                self.epoch += 1
                png = await capture()
                return {**self.status(), "image": base64.b64encode(png).decode()}
            except BaseException:
                self.owner = "USER"
                self.handoff = False
                raise

    async def finish_return(self, epoch, success):
        async with self.lock:
            if epoch != self.epoch or not self.handoff:
                raise HTTPException(409, "Stale handoff")
            self.owner = "AGENT" if success else "USER"
            self.handoff = False
            self.epoch += 1
        return self.status()

    async def apply(self, body: Input):
        async with self.lock:
            if self.handoff or body.actor != self.owner or body.epoch != self.epoch:
                raise HTTPException(409, "Control revoked or stale input")
            action = body.action
            if action in ("move", "click", "double_click", "down", "up", "scroll"):
                await command("xdotool", "mousemove", str(body.x), str(body.y))
            if action in ("click", "double_click"):
                await command(
                    "xdotool",
                    "click",
                    "--repeat",
                    "2" if action == "double_click" else "1",
                    "--delay",
                    "80",
                    str(body.button),
                )
            elif action in ("down", "up"):
                await command("xdotool", "mousedown" if action == "down" else "mouseup", str(body.button))
                (self.buttons.add if action == "down" else self.buttons.discard)(body.button)
            elif action == "scroll" and body.delta:
                await command(
                    "xdotool",
                    "click",
                    "--repeat",
                    str(abs(body.delta)),
                    "--delay",
                    "10",
                    "4" if body.delta < 0 else "5",
                )
            elif action == "type":
                await command("xdotool", "type", "--clearmodifiers", "--delay", "0", "--", body.text)
            elif action in ("key", "hotkey", "keydown", "keyup"):
                if not re.fullmatch(r"[A-Za-z0-9_+]+", body.key):
                    raise HTTPException(422, "Invalid X11 key")
                await command("xdotool", {"hotkey": "key"}.get(action, action), body.key)
                if action == "keydown":
                    self.keys.add(body.key)
                if action == "keyup":
                    self.keys.discard(body.key)
            elif action == "launch":
                apps = {
                    "chromium": ["dot-browser"],
                    "terminal": ["xfce4-terminal"],
                    "files": ["thunar", "/workspace/artifacts"],
                }
                if body.service:
                    if body.app != "chromium":
                        raise HTTPException(422, "Services require Chromium")
                    urls = {"gmail": "https://mail.google.com/", "calendar": "https://calendar.google.com/",
                            "drive": "https://drive.google.com/", "slack": "https://slack.com/signin"}
                    apps["chromium"].append(urls[body.service])
                await asyncio.create_subprocess_exec(
                    *apps[body.app],
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                    start_new_session=True,
                )
            elif action == "focus":
                if not re.fullmatch(r"0x[0-9a-fA-F]+", body.window_id):
                    raise HTTPException(422, "Invalid window id")
                await command("wmctrl", "-ia", body.window_id)
        return self.status()


gate = Gate()


@asynccontextmanager
async def lifespan(app):
    # A crashed return handshake must not leave the user locked out indefinitely.
    async def watchdog():
        while True:
            await asyncio.sleep(45)
            if gate.handoff and time.monotonic() - gate.handoff_since > 120:
                async with gate.lock:
                    gate.owner = "USER"
                    gate.handoff = False
                    gate.epoch += 1

    task = asyncio.create_task(watchdog())
    yield
    task.cancel()


app = FastAPI(dependencies=[Depends(authorize)], lifespan=lifespan)


@app.get("/health")
async def health():
    await command("xdotool", "getdisplaygeometry")
    return {"ready": True, **gate.status()}


@app.get("/screen")
async def screenshot():
    return Response(await capture(), media_type="image/png", headers={"Cache-Control": "no-store"})


@app.get("/windows")
async def windows():
    return {"windows": (await command("wmctrl", "-lp")).splitlines()}


@app.get("/control")
async def control():
    return gate.status()


@app.post("/input")
async def apply(body: Input):
    return await gate.apply(body)


@app.post("/control/takeover")
async def takeover():
    return await gate.takeover()


@app.post("/control/prepare-return")
async def prepare_return():
    return await gate.prepare_return()


@app.post("/control/finish-return")
async def finish_return(body: Return):
    return await gate.finish_return(body.epoch, True)


@app.post("/control/abort-return")
async def abort_return(body: Return):
    return await gate.finish_return(body.epoch, False)


@app.post("/control/release")
async def release(body: Return):
    async with gate.lock:
        if body.epoch != gate.epoch:
            raise HTTPException(409, "Stale input")
        await gate.release()
    return gate.status()


appearance_lock = asyncio.Lock()

@app.post("/appearance")
async def appearance(body: Appearance):
    async with appearance_lock:
        write_appearance(body.accent, Path.home(), body.name)
        await command("xsetroot", "-solid", body.accent)
        await command("openbox", "--reconfigure")
    return {"accent": body.accent}
