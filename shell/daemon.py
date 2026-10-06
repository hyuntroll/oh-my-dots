"""Shell runs in a separate container with no GUI sockets or provider credentials."""

import asyncio
import os
import secrets
import signal
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from pydantic import BaseModel, Field

TOKEN = os.environ.get("SHELL_TOKEN", "")
if not TOKEN:
    raise RuntimeError("SHELL_TOKEN is required")
ROOT = Path(os.environ.get("WORKSPACE", "/workspace")).resolve()
LIMIT = 65536
processes = {}
cancelled = set()
lock = asyncio.Lock()


async def auth(request: Request):
    if not secrets.compare_digest(request.headers.get("authorization", ""), f"Bearer {TOKEN}"):
        raise HTTPException(401, "Unauthorized")


app = FastAPI(dependencies=[Depends(auth)])


class Exec(BaseModel):
    run_id: str = Field(min_length=1, max_length=64)
    command: str = Field(min_length=1, max_length=8000)
    cwd: str = "/workspace"
    timeout: float = Field(120, gt=0, le=120)


async def kill_group(proc):
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    await proc.wait()


async def drain(stream):
    data = bytearray()
    truncated = False
    while chunk := await stream.read(8192):
        remaining = LIMIT - len(data)
        data.extend(chunk[: max(0, remaining)])
        truncated |= len(chunk) > remaining
    return data.decode(errors="replace"), truncated


@app.get("/health")
async def health():
    return {"ready": True}


@app.post("/exec")
async def execute(body: Exec):
    cwd = Path(body.cwd).resolve()
    if not cwd.is_relative_to(ROOT) or not cwd.is_dir():
        raise HTTPException(422, "cwd must exist inside /workspace")
    async with lock:
        if body.run_id in cancelled:
            raise HTTPException(409, "Run cancelled")
        if body.run_id in processes:
            raise HTTPException(409, "Run already has a shell process")
        proc = await asyncio.create_subprocess_exec(
            "/bin/sh",
            "-c",
            body.command,
            cwd=cwd,
            env={"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": "/tmp", "LANG": "C.UTF-8"},
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            start_new_session=True,
        )
        processes[body.run_id] = proc
    stdout = asyncio.create_task(drain(proc.stdout))
    stderr = asyncio.create_task(drain(proc.stderr))
    timed_out = False
    try:
        try:
            await asyncio.wait_for(proc.wait(), body.timeout)
            # A command may leave descendants holding stdout open.
            await asyncio.wait_for(asyncio.gather(asyncio.shield(stdout), asyncio.shield(stderr)), 2)
        except TimeoutError:
            timed_out = True
            await kill_group(proc)
        out, out_cut = await asyncio.wait_for(stdout, 3)
        err, err_cut = await asyncio.wait_for(stderr, 3)
        return {
            "exit_code": proc.returncode,
            "stdout": out,
            "stderr": err,
            "stdout_truncated": out_cut,
            "stderr_truncated": err_cut,
            "timed_out": timed_out,
            "cancelled": body.run_id in cancelled,
        }
    except BaseException:
        await kill_group(proc)
        stdout.cancel()
        stderr.cancel()
        raise
    finally:
        # Prevent orphan background processes from outliving this tool call.
        await kill_group(proc)
        async with lock:
            processes.pop(body.run_id, None)


@app.post("/cancel/{run_id}")
async def cancel(run_id: str):
    async with lock:
        cancelled.add(run_id)
        proc = processes.get(run_id)
        if proc:
            await kill_group(proc)
    return {"cancelled": True}


@app.get("/artifacts")
async def list_artifacts():
    root = ROOT / "artifacts"
    return [
        {"path": str(p.relative_to(root)), "size": p.stat().st_size}
        for p in root.rglob("*")
        if p.is_file() and not p.is_symlink()
    ][:200]


@app.get("/artifacts/{path:path}")
async def read_artifact(path: str):
    root = (ROOT / "artifacts").resolve()
    target = (root / path).resolve()
    if not target.is_relative_to(root) or not target.is_file():
        raise HTTPException(404, "Artifact not found")
    if target.stat().st_size > LIMIT:
        raise HTTPException(413, "Artifact exceeds preview limit")
    try:
        text = target.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise HTTPException(415, "UTF-8 text preview only")
    return {"path": path, "text": text, "verified": True}
