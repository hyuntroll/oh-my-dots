import asyncio
import json
import secrets
import time

from sqlalchemy import or_, select

from .integrations import Integrations
from .providers import TaskFailure, run_codex, run_openai
from .store import Event, Message, Run
from .tools import Adapter, Tools


class Runtime:
    def __init__(self, config, store):
        self.config = config
        self.store = store
        self.integrations = Integrations(config)
        self.desktop = Adapter(config.computer_url, config.computer_token)
        self.shell = Adapter(config.shell_url, config.shell_token)
        self.queue = asyncio.Queue()
        self.active_id = None
        self.active_task = None
        self.tool_tokens = {}
        self.tools = {}
        self.answers = {}
        self.question_ids = {}
        self.control_returned = asyncio.Event()
        self.control_returned.set()
        self.waiting = set()
        self.pump = None

    async def start(self):
        recovered = self.store.recover()
        for run_id in recovered:
            try:
                await self.shell.post("/cancel/" + run_id)
            except Exception:
                self.store.event("shell.cancel_failed", "재시작 후 셸 종료 확인 실패", run_id)
        try:
            state = await self.desktop.get("/control")
            if state["owner"] != "AGENT" or state["handoff"]:
                self.control_returned.clear()
        except Exception:
            self.control_returned.clear()
        self.pump = asyncio.create_task(self.worker())

    async def stop(self):
        if self.active_id:
            await self.cancel(self.active_id)
        if self.pump:
            self.pump.cancel()
            await asyncio.gather(self.pump, return_exceptions=True)

    def check_run(self, run_id):
        with self.store.session() as db:
            run = db.get(Run, run_id)
            if not run or run.status in ("COMPLETED", "FAILED", "CANCELLED"):
                raise asyncio.CancelledError()

    async def abort(self, run_id, error):
        self.store.status(run_id, "FAILED", error=error)
        if self.active_id == run_id and self.active_task:
            self.active_task.cancel()

    async def cancel(self, run_id):
        self.store.status(run_id, "CANCELLED")
        try:
            await self.shell.post("/cancel/" + run_id)
        finally:
            if self.active_id == run_id and self.active_task:
                self.active_task.cancel()
            future = self.answers.get(run_id)
            if future and not future.done():
                future.cancel()
            self.waiting.discard(run_id)

    async def wait_control(self, run_id):
        self.check_run(run_id)
        self.store.status(run_id, "WAITING_USER", "CONTROL")
        self.waiting.add(run_id)
        try:
            await self.control_returned.wait()
            self.check_run(run_id)
        finally:
            self.waiting.discard(run_id)
        self.store.status(run_id, "RUNNING")

    async def ask_user(self, run_id, question, options=None, recommended_index=0):
        self.check_run(run_id)
        options = [] if options is None else options
        if (not isinstance(options, list) or (options and not 2 <= len(options) <= 4)
                or any(not isinstance(option, str) or not option.strip() or len(option) > 120 for option in options)
                or len(set(options)) != len(options)):
            raise ValueError("Provide 2-4 distinct, nonempty options of at most 120 characters")
        if options and (type(recommended_index) is not int or not 0 <= recommended_index < len(options)):
            raise ValueError("recommended_index must refer to an option")
        question_id = secrets.token_urlsafe(16)
        self.question_ids[run_id] = question_id
        future = asyncio.get_running_loop().create_future()
        self.answers[run_id] = future
        self.waiting.add(run_id)
        self.store.event("run.question", question, run_id, {
            "question_id": question_id, "options": options,
            "recommended_index": recommended_index if options else None,
        })
        with self.store.session() as db:
            run = db.get(Run, run_id)
            db.add(
                Message(conversation_id=run.conversation_id, run_id=run_id, role="assistant", text=question)
            )
            db.commit()
        self.store.status(run_id, "WAITING_USER", "ANSWER")
        try:
            answer = await future
            self.check_run(run_id)
            self.store.status(run_id, "RUNNING")
            return answer
        finally:
            self.answers.pop(run_id, None)
            self.question_ids.pop(run_id, None)
            self.waiting.discard(run_id)

    async def worker(self):
        while True:
            run_id = await self.queue.get()
            try:
                with self.store.session() as db:
                    run = db.get(Run, run_id)
                    if run.status != "PENDING":
                        continue
                self.active_id = run_id
                self.active_task = asyncio.create_task(self.execute(run_id))
                # Cancellation of a Run must not kill the FIFO worker.
                await asyncio.gather(self.active_task, return_exceptions=True)
            finally:
                self.active_id = None
                self.active_task = None
                self.queue.task_done()

    async def execute(self, run_id):
        self.tool_tokens[run_id] = secrets.token_urlsafe(32)
        tools = self.tools[run_id] = Tools(self, run_id)
        self.store.status(run_id, "RUNNING")
        with self.store.session() as db:
            run = db.get(Run, run_id)
            identity = db.scalar(select(Event).where(Event.run_id == run_id, Event.type == "run.queued").order_by(Event.sequence).limit(1))
            run.dot_name = json.loads(identity.payload).get("dot_name", "OhMyDots") if identity else "OhMyDots"
            cutoff = db.scalar(
                select(Message.sequence)
                .where(Message.run_id == run_id, Message.role == "user")
                .order_by(Message.sequence)
                .limit(1)
            )
            rows = list(
                db.scalars(
                    select(Message)
                    .where(
                        Message.conversation_id == run.conversation_id,
                        or_(
                            Message.sequence <= cutoff,
                            Message.run_id.in_(
                                select(Run.id).where(
                                    Run.conversation_id == run.conversation_id,
                                    Run.created_at < run.created_at,
                                )
                            ),
                        ),
                    )
                    .order_by(Message.sequence.desc())
                    .limit(24)
                )
            )
            history = [{"role": r.role, "content": r.text} for r in reversed(rows)]
        self.store.event("run.activity", "요청을 확인하고 있어요", run_id)
        provider = run_openai if run.provider == "openai" else run_codex
        invocation = asyncio.create_task(provider(self, run, history, tools))
        elapsed = 0.0
        last = time.monotonic()
        try:
            while not invocation.done():
                await asyncio.sleep(0.25)
                now = time.monotonic()
                if run_id not in self.waiting:
                    elapsed += now - last
                last = now
                if elapsed > self.config.run_seconds:
                    raise RuntimeError("RUN_TIMEOUT")
            answer = await invocation
            if tools.written - tools.verified:
                raise RuntimeError("ARTIFACT_NOT_VERIFIED")
            self.check_run(run_id)
            with self.store.session() as db:
                db.add(
                    Message(conversation_id=run.conversation_id, run_id=run_id, role="assistant", text=answer)
                )
                db.commit()
            self.store.status(run_id, "COMPLETED", result=answer)
        except asyncio.CancelledError:
            self.store.status(run_id, "CANCELLED")
            raise
        except Exception as exc:
            error = str(exc) if isinstance(exc, RuntimeError) else type(exc).__name__
            with self.store.session() as db:
                db.add(
                    Message(
                        conversation_id=run.conversation_id,
                        run_id=run_id,
                        role="assistant",
                        text=exc.message
                        if isinstance(exc, TaskFailure)
                        else "작업을 완료하지 못했습니다. 상태와 활동 기록을 확인하고 재시도해 주세요.",
                    )
                )
                db.commit()
            self.store.status(run_id, "FAILED", error=error[:100])
        finally:
            invocation.cancel()
            await asyncio.gather(invocation, return_exceptions=True)
            with self.store.session() as db:
                failed = db.get(Run, run_id).status != "COMPLETED"
            if failed:
                try:
                    await self.shell.post("/cancel/" + run_id)
                except Exception:
                    self.store.event("shell.cancel_failed", "셸 종료 확인 실패", run_id)
            self.tool_tokens.pop(run_id, None)
            self.tools.pop(run_id, None)
