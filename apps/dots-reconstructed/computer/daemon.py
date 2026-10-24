"""Independent local desktop adapter. This is not OpenAI's cloud computer service."""
import asyncio
import io
import os
import re
import secrets
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

WIDTH, HEIGHT = 1280, 960
TOKEN = os.environ.get("COMPUTER_TOKEN", "")
if not TOKEN:
    raise RuntimeError("COMPUTER_TOKEN is required")


async def authorize(request: Request):
    if not secrets.compare_digest(request.headers.get("authorization", ""), "Bearer " + TOKEN):
        raise HTTPException(401, "Unauthorized")


async def command(*args):
    process = await asyncio.create_subprocess_exec(*args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        stdout, _ = await asyncio.wait_for(process.communicate(), 4)
    except BaseException:
        process.kill()
        await process.wait()
        raise
    if process.returncode:
        raise HTTPException(502, "Desktop command failed")
    return stdout


def capture_sync():
    import mss
    from PIL import Image
    with mss.mss() as screen:
        shot = screen.grab(screen.monitors[1])
        out = io.BytesIO()
        Image.frombytes("RGB", shot.size, shot.rgb).save(out, "PNG")
        return out.getvalue()


async def capture():
    return await asyncio.to_thread(capture_sync)


class Control(BaseModel):
    owner: Literal["AGENT", "USER"]
    epoch: int | None = None


class Input(BaseModel):
    actor: Literal["AGENT", "USER"]
    epoch: int
    action: Literal["move", "click", "double_click", "down", "up", "scroll", "type", "key", "keydown", "keyup", "launch"]
    x: int = Field(0, ge=0, lt=WIDTH)
    y: int = Field(0, ge=0, lt=HEIGHT)
    button: int = Field(1, ge=1, le=3)
    delta: int = Field(0, ge=-20, le=20)
    text: str = Field("", max_length=8000)
    key: str = Field("", max_length=100)
    app: Literal["browser", "terminal", "files"] = "browser"


class Desktop:
    def __init__(self):
        self.lock = asyncio.Lock()
        self.owner = "AGENT"
        self.epoch = secrets.randbits(48)
        self.keys, self.buttons = set(), set()

    def status(self):
        return dict(connected=True, width=WIDTH, height=HEIGHT, owner=self.owner, epoch=self.epoch)

    async def release(self):
        for key in list(self.keys):
            await command("xdotool", "keyup", key)
        for button in list(self.buttons):
            await command("xdotool", "mouseup", str(button))
        self.keys.clear()
        self.buttons.clear()

    async def transfer(self, body):
        async with self.lock:
            if body.epoch is not None and body.epoch != self.epoch:
                raise HTTPException(409, "Computer ownership changed; refresh before transferring control")
            await self.release()
            self.owner = body.owner
            self.epoch += 1
            return self.status()

    async def apply(self, body):
        async with self.lock:
            if body.actor != self.owner or body.epoch != self.epoch:
                raise HTTPException(409, "Control revoked or stale input")
            action = body.action
            if action in ("move", "click", "double_click", "down", "up", "scroll"):
                await command("xdotool", "mousemove", str(body.x), str(body.y))
            if action in ("click", "double_click"):
                await command("xdotool", "click", "--repeat", "2" if action == "double_click" else "1", str(body.button))
            elif action == "down":
                await command("xdotool", "mousedown", str(body.button)); self.buttons.add(body.button)
            elif action == "up":
                await command("xdotool", "mouseup", str(body.button)); self.buttons.discard(body.button)
            elif action == "scroll" and body.delta:
                await command("xdotool", "click", "--repeat", str(abs(body.delta)), "4" if body.delta > 0 else "5")
            elif action == "type":
                await command("xdotool", "type", "--clearmodifiers", "--delay", "0", "--", body.text)
            elif action in ("key", "keydown", "keyup"):
                if not re.fullmatch(r"[A-Za-z0-9_+]+", body.key) or body.key.startswith("-"):
                    raise HTTPException(422, "Invalid key")
                await command("xdotool", action, body.key)
                if action == "keydown": self.keys.add(body.key)
                if action == "keyup": self.keys.discard(body.key)
            elif action == "launch":
                launch = {"browser": ["chromium", "--no-sandbox", "--no-first-run"], "terminal": ["xfce4-terminal", "--disable-server"], "files": ["thunar", "/workspace"]}[body.app]
                process = await asyncio.create_subprocess_exec(*launch, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
                asyncio.create_task(process.wait())
            return self.status()


desktop = Desktop()


@asynccontextmanager
async def lifespan(_app):
    yield
    async with desktop.lock:
        await desktop.release()


app = FastAPI(dependencies=[Depends(authorize)], lifespan=lifespan)


@app.get("/health")
@app.get("/status")
async def status():
    # A responding API alone does not prove that the X desktop is usable.
    await command("xdotool", "getdisplaygeometry")
    return desktop.status()


@app.get("/screenshot")
async def screenshot():
    return Response(await capture(), media_type="image/png", headers={"Cache-Control": "no-store"})


@app.get("/stream")
async def stream(request: Request):
    async def frames():
        while not await request.is_disconnected():
            png = await capture()
            yield b"--frame\r\nContent-Type: image/png\r\nContent-Length: " + str(len(png)).encode() + b"\r\n\r\n" + png + b"\r\n"
            await asyncio.sleep(0.3)
    return StreamingResponse(frames(), media_type="multipart/x-mixed-replace; boundary=frame", headers={"Cache-Control": "no-store"})


@app.post("/control")
async def control(body: Control):
    return await desktop.transfer(body)


@app.post("/input")
async def input_action(body: Input):
    return await desktop.apply(body)
