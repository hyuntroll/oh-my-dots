import asyncio
import json
import os
import re
import secrets
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
import websockets
from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from pydantic import BaseModel, Field, SecretStr
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from .config import Config
from .providers import analyze_screen, api_key
from .runtime import Runtime
from .store import ComputerSession, Conversation, Event, Message, Run, Setting, Store, Task, serialize
from .tools import TOOLS


class Submit(BaseModel):
    text: str = Field(min_length=1, max_length=16000)
    idempotency_key: str = Field(min_length=1, max_length=100)


class Answer(BaseModel):
    question_id: str = Field(min_length=1, max_length=100)
    text: str = Field(min_length=1, max_length=16000)


class Settings(BaseModel):
    provider: str
    model: str = Field("", max_length=120)
    api_key: SecretStr | None = None


def create_app(config=None):
    config = config or Config()
    store = Store(config.database_url)
    runtime = Runtime(config, store)
    submit_lock = asyncio.Lock()
    handoff_lock = asyncio.Lock()
    login_state = {"state": "idle"}
    login_task = None

    @asynccontextmanager
    async def lifespan(app):
        await runtime.start()
        yield
        await runtime.stop()
        if login_task:
            login_task.cancel()

    app = FastAPI(title="OhMyDots API", lifespan=lifespan)
    app.state.runtime = runtime
    app.state.store = store

    def allowed_origin(headers):
        origin = headers.get("origin")
        return (not origin or origin == config.origin) and headers.get("sec-fetch-site") != "cross-site"

    async def auth(request: Request):
        token = request.cookies.get("dot_session", "")
        if not secrets.compare_digest(token, config.session_token) or not allowed_origin(request.headers):
            raise HTTPException(401, "Unauthorized")

    async def private_auth(request: Request, run_id: str):
        expected = runtime.tool_tokens.get(run_id)
        if not expected or not secrets.compare_digest(
            request.headers.get("authorization", ""), "Bearer " + expected
        ):
            raise HTTPException(401, "Unauthorized")

    def check_session(session_id):
        if session_id != "computer-1":
            raise HTTPException(404, "Computer session not found")

    def save_control(state):
        with store.session() as db:
            row = db.get(ComputerSession, "computer-1")
            row.control_owner, row.epoch = state["owner"], state["epoch"]
            db.commit()
        store.event("control.changed", "제어권: " + state["owner"], payload=state)

    @app.get("/health")
    async def health():
        return {"ready": True}

    @app.get("/api/session")
    async def session(request: Request):
        # Local demo bootstrap. Cross-site browser requests cannot obtain the HttpOnly session cookie.
        if (
            not secrets.compare_digest(request.headers.get("x-dot-bootstrap", ""), config.session_token)
            or request.url.hostname not in ("localhost", "127.0.0.1", "testserver")
            or not allowed_origin(request.headers)
        ):
            raise HTTPException(403, "Local access only")
        response = Response(json.dumps({"authenticated": True}), media_type="application/json")
        response.set_cookie(
            "dot_session",
            config.session_token,
            httponly=True,
            samesite="strict",
            secure=config.origin.startswith("https://"),
            max_age=86400,
        )
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/conversations", dependencies=[Depends(auth)])
    async def conversations():
        with store.session() as db:
            return [
                serialize(c)
                for c in db.scalars(select(Conversation).order_by(Conversation.created_at.desc()))
            ]

    @app.post("/api/conversations", dependencies=[Depends(auth)])
    async def create_conversation():
        with store.session() as db:
            row = Conversation()
            db.add(row)
            db.commit()
            return serialize(row)

    @app.get("/api/conversations/{conversation_id}", dependencies=[Depends(auth)])
    async def conversation(conversation_id: str):
        with store.session() as db:
            row = db.get(Conversation, conversation_id)
            if not row:
                raise HTTPException(404, "Conversation not found")
            return {
                **serialize(row),
                "execution": store.execution(conversation_id),
                "messages": [
                    serialize(m)
                    for m in db.scalars(
                        select(Message)
                        .where(Message.conversation_id == conversation_id)
                        .order_by(Message.sequence)
                    )
                ],
                "runs": [
                    serialize(r)
                    for r in db.scalars(
                        select(Run).where(Run.conversation_id == conversation_id).order_by(Run.created_at)
                    )
                ],
            }

    @app.post("/api/conversations/{conversation_id}/messages", dependencies=[Depends(auth)])
    async def submit(conversation_id: str, body: Submit):
        async with submit_lock:
            with store.session() as db:
                conversation = db.get(Conversation, conversation_id)
                if not conversation:
                    raise HTTPException(404, "Conversation not found")
                existing = db.scalar(
                    select(Run).where(
                        Run.conversation_id == conversation_id, Run.idempotency_key == body.idempotency_key
                    )
                )
                if existing:
                    if db.get(Task, existing.task_id).prompt != body.text:
                        raise HTTPException(409, "Idempotency key reused with different content")
                    return serialize(existing)
                provider = store.get_setting("provider", config.provider)
                model = store.get_setting(provider + "_model", config.model if provider == "openai" else "")
                task = Task(conversation_id=conversation_id, prompt=body.text)
                db.add(task)
                db.flush()
                run = Run(
                    task_id=task.id,
                    conversation_id=conversation_id,
                    idempotency_key=body.idempotency_key,
                    provider=provider,
                    model=model,
                )
                db.add(run)
                db.flush()
                db.add(Message(conversation_id=conversation_id, run_id=run.id, role="user", text=body.text))
                if conversation.title == "새 대화":
                    conversation.title = body.text[:45]
                try:
                    db.commit()
                except IntegrityError:
                    db.rollback()
                    raise HTTPException(409, "Duplicate submission")
                result = serialize(run)
            store.event("run.queued", "작업 대기 중", run.id)
            await runtime.queue.put(run.id)
            return result

    @app.post("/api/runs/{run_id}/cancel", dependencies=[Depends(auth)])
    async def cancel(run_id: str):
        with store.session() as db:
            row = db.get(Run, run_id)
            if not row:
                raise HTTPException(404, "Run not found")
            if row.status in ("COMPLETED", "FAILED", "CANCELLED"):
                return serialize(row)
        try:
            await runtime.cancel(run_id)
        except httpx.HTTPError:
            store.event("shell.cancel_failed", "셸 종료 확인 실패", run_id)
            raise HTTPException(503, "Shell cancellation could not be confirmed")
        return {"status": "CANCELLED"}

    @app.post("/api/runs/{run_id}/answer", dependencies=[Depends(auth)])
    async def answer(run_id: str, body: Answer):
        future = runtime.answers.get(run_id)
        if not future or future.done() or runtime.question_ids.get(run_id) != body.question_id:
            raise HTTPException(409, "Run is not waiting for an answer")
        if not body.text.strip():
            raise HTTPException(422, "Answer must not be blank")
        with store.session() as db:
            row = db.get(Run, run_id)
            db.add(Message(conversation_id=row.conversation_id, run_id=run_id, role="user", text=body.text))
            db.commit()
        future.set_result(body.text)
        return {"accepted": True}

    @app.get("/api/usage", dependencies=[Depends(auth)])
    async def usage():
        return store.usage()

    @app.get("/api/events", dependencies=[Depends(auth)])
    async def events(after: int = 0):
        with store.session() as db:
            return [
                serialize(e)
                for e in db.scalars(
                    select(Event).where(Event.sequence > after).order_by(Event.sequence).limit(200)
                )
            ]

    @app.websocket("/api/events/ws")
    async def event_stream(ws: WebSocket):
        if not secrets.compare_digest(
            ws.cookies.get("dot_session", ""), config.session_token
        ) or not allowed_origin(ws.headers):
            await ws.close(1008)
            return
        try:
            after = max(0, int(ws.query_params.get("after", "0")))
        except ValueError:
            await ws.close(1008)
            return
        await ws.accept()
        try:
            while True:
                with store.session() as db:
                    rows = [
                        serialize(e)
                        for e in db.scalars(
                            select(Event).where(Event.sequence > after).order_by(Event.sequence).limit(200)
                        )
                    ]
                for event in rows:
                    await ws.send_json(event)
                    after = event["sequence"]
                if not rows:
                    await ws.send_json({"type": "heartbeat"})
                await asyncio.sleep(0.4)
        except (WebSocketDisconnect, RuntimeError):
            return

    @app.get("/api/computer-sessions/{session_id}", dependencies=[Depends(auth)])
    async def computer(session_id: str):
        check_session(session_id)
        try:
            state = await runtime.desktop.get("/health")
            return {**state, "id": session_id, "connected": True}
        except httpx.HTTPError:
            return {"id": session_id, "connected": False, "owner": None, "epoch": None, "handoff": False}

    @app.post("/api/computer-sessions/{session_id}/input", dependencies=[Depends(auth)])
    async def input(session_id: str, request: Request):
        check_session(session_id)
        body = await request.json()
        if not isinstance(body, dict):
            raise HTTPException(422, "Input must be an object")
        try:
            return await runtime.desktop.post("/input", {**body, "actor": "USER"})
        except httpx.HTTPStatusError as exc:
            raise HTTPException(exc.response.status_code, "Input rejected")
        except httpx.HTTPError:
            raise HTTPException(503, "컴퓨터 연결이 지연되고 있습니다. 다시 연결해 주세요.")

    @app.post("/api/computer-sessions/{session_id}/release", dependencies=[Depends(auth)])
    async def release(session_id: str, request: Request):
        check_session(session_id)
        body = await request.json()
        try:
            state = await runtime.desktop.get("/control")
            if state["owner"] != "USER" or body.get("epoch") != state["epoch"]:
                raise HTTPException(409, "Control revoked")
            return await runtime.desktop.post("/control/release", {"epoch": state["epoch"]})
        except httpx.HTTPStatusError as exc:
            raise HTTPException(exc.response.status_code, "Release rejected")
        except httpx.HTTPError:
            raise HTTPException(503, "컴퓨터 연결이 지연되고 있습니다. 다시 연결해 주세요.")

    @app.post("/api/computer-sessions/{session_id}/takeover", dependencies=[Depends(auth)])
    async def takeover(session_id: str):
        check_session(session_id)
        async with handoff_lock:
            state = await runtime.desktop.post("/control/takeover")
            runtime.control_returned.clear()
            save_control(state)
            return state

    @app.post("/api/computer-sessions/{session_id}/return", dependencies=[Depends(auth)])
    async def return_control(session_id: str):
        check_session(session_id)
        async with handoff_lock:
            observation = await runtime.desktop.post("/control/prepare-return")
            image = "data:image/png;base64," + observation["image"]
            try:
                provider = store.get_setting("provider", config.provider)
                model = store.get_setting(provider + "_model", config.model if provider == "openai" else "")
                summary = await asyncio.wait_for(analyze_screen(runtime, image, provider, model), 90)
                # Model receives fresh image before GUI ownership can be restored.
                state = await runtime.desktop.post("/control/finish-return", {"epoch": observation["epoch"]})
                store.event("computer.observed", summary, runtime.active_id)
                save_control(state)
                runtime.control_returned.set()
                return state
            except BaseException:
                try:
                    state = await runtime.desktop.post(
                        "/control/abort-return", {"epoch": observation["epoch"]}
                    )
                    save_control(state)
                except httpx.HTTPError:
                    pass
                raise HTTPException(
                    503, "화면 분석에 실패하여 사용자 제어를 유지합니다. 인증 설정을 확인해 주세요."
                )

    @app.get("/api/computer-sessions/{session_id}/screen", dependencies=[Depends(auth)])
    async def screen(session_id: str):
        check_session(session_id)
        return Response(
            await runtime.desktop.get("/screen", raw=True),
            media_type="image/png",
            headers={"Cache-Control": "no-store"},
        )

    @app.websocket("/api/computer-sessions/{session_id}/stream")
    async def stream(ws: WebSocket, session_id: str):
        if (
            session_id != "computer-1"
            or not secrets.compare_digest(ws.cookies.get("dot_session", ""), config.session_token)
            or not allowed_origin(ws.headers)
        ):
            await ws.close(1008)
            return
        await ws.accept()
        try:
            async with websockets.connect(config.vnc_url, subprotocols=["binary"], max_size=2**23) as remote:

                async def upstream():
                    while True:
                        await remote.send(await ws.receive_bytes())

                async def downstream():
                    async for frame in remote:
                        await ws.send_bytes(frame if isinstance(frame, bytes) else frame.encode())

                tasks = [asyncio.create_task(upstream()), asyncio.create_task(downstream())]
                await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
        except (WebSocketDisconnect, OSError, websockets.exceptions.WebSocketException):
            pass
        finally:
            try:
                await ws.close()
            except (RuntimeError, WebSocketDisconnect):
                pass

    @app.post("/internal/runs/{run_id}/tools/{name}", dependencies=[Depends(private_auth)])
    async def internal_tool(run_id: str, name: str, request: Request):
        if name not in {t["name"] for t in TOOLS}:
            raise HTTPException(404, "Unknown tool")
        return await runtime.tools[run_id].invoke(name, await request.json())

    @app.get("/api/settings", dependencies=[Depends(auth)])
    async def settings():
        connected = False
        if shutil.which(config.codex_bin):
            proc = await asyncio.create_subprocess_exec(
                config.codex_bin,
                "login",
                "status",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                out, err = await asyncio.wait_for(proc.communicate(), 5)
                connected = proc.returncode == 0 and b"ChatGPT" in (out + err)
            except TimeoutError:
                proc.kill()
                await proc.wait()
        provider = store.get_setting("provider", config.provider)
        return {
            "provider": provider,
            "model": store.get_setting(provider + "_model", config.model if provider == "openai" else ""),
            "openai_configured": bool(api_key(config)),
            "codex_installed": bool(shutil.which(config.codex_bin)),
            "codex_connected": connected,
            "login": login_state,
        }

    @app.put("/api/settings", dependencies=[Depends(auth)])
    async def change_settings(body: Settings):
        if body.provider not in ("openai", "codex"):
            raise HTTPException(422, "Invalid provider")
        if runtime.active_id:
            raise HTTPException(409, "실행 중인 작업을 마치거나 취소한 뒤 설정을 변경하세요.")
        if body.api_key and body.api_key.get_secret_value().strip():
            target = Path(config.data_dir) / "openai-key"
            fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w") as file:
                file.write(body.api_key.get_secret_value().strip())
            os.chmod(target, 0o600)
        with store.session() as db:
            for key, value in [
                ("provider", body.provider),
                (
                    body.provider + "_model",
                    body.model.strip() or (config.model if body.provider == "openai" else ""),
                ),
            ]:
                row = db.get(Setting, key)
                if row:
                    row.value = value
                else:
                    db.add(Setting(key=key, value=value))
            db.commit()
        return {"saved": True}

    @app.post("/api/settings/codex/login", dependencies=[Depends(auth)])
    async def codex_login():
        nonlocal login_task
        if runtime.active_id:
            raise HTTPException(409, "작업 종료 후 로그인하세요.")
        if not shutil.which(config.codex_bin):
            raise HTTPException(503, "Codex CLI is not installed")
        if login_task and not login_task.done():
            return login_state
        login_state.clear()
        login_state.update({"state": "starting"})

        async def login():
            proc = await asyncio.create_subprocess_exec(
                config.codex_bin,
                "login",
                "--device-auth",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            try:
                async with asyncio.timeout(600):
                    while line := await proc.stdout.readline():
                        text = re.sub(r"\x1b\[[0-9;]*m", "", line.decode(errors="replace")).strip()
                        urls = re.findall(r"https://auth\.openai\.com/[^\s]+", text)
                        codes = re.findall(r"\b[A-Z0-9]{4}-[A-Z0-9]{4,5}\b", text)
                        if urls:
                            login_state["url"] = urls[0]
                        if codes:
                            login_state["code"] = codes[0]
                        if "url" in login_state and "code" in login_state:
                            login_state["state"] = "waiting"
                    await proc.wait()
                    login_state.clear()
                    login_state["state"] = "connected" if proc.returncode == 0 else "failed"
            except BaseException:
                if proc.returncode is None:
                    proc.kill()
                    await proc.wait()
                login_state.clear()
                login_state["state"] = "failed"

        login_task = asyncio.create_task(login())
        return login_state

    @app.get("/api/artifacts", dependencies=[Depends(auth)])
    async def artifacts():
        try:
            return await runtime.shell.get("/artifacts")
        except httpx.HTTPError:
            raise HTTPException(503, "Artifact storage is unavailable")

    @app.get("/api/artifacts/{path:path}", dependencies=[Depends(auth)])
    async def artifact(path: str):
        from urllib.parse import quote

        try:
            return await runtime.shell.get("/artifacts/" + quote(path, safe="/"))
        except httpx.HTTPStatusError as exc:
            detail = {
                404: "Artifact not found",
                413: "Artifact exceeds preview limit",
                415: "UTF-8 text preview only",
            }.get(exc.response.status_code, "Artifact lookup failed")
            raise HTTPException(exc.response.status_code, detail)
        except httpx.HTTPError:
            raise HTTPException(503, "Artifact storage is unavailable")

    return app
