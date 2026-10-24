import json
import time
import uuid

from sqlalchemy import (
    BigInteger,
    Boolean,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    and_,
    create_engine,
    func,
    inspect,
    or_,
    select,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column


def uid():
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class Dot(Base):
    __tablename__ = "dots"
    id: Mapped[str] = mapped_column(String, primary_key=True, default="dot-1")
    name: Mapped[str] = mapped_column(String, default="OhMyDots")
    # ACTIVE keeps the dot usable, PAUSED stops new work until resumed, ARCHIVED hides
    # a deleted dot without destroying its archived conversations.
    status: Mapped[str] = mapped_column(String, default="ACTIVE")
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    last_active_at: Mapped[float | None] = mapped_column(Float, nullable=True)


class Memory(Base):
    """A short standing fact a dot was asked to remember, scoped to that dot."""
    __tablename__ = "memories"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    dot_id: Mapped[str] = mapped_column(ForeignKey("dots.id"), default="dot-1")
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)


class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    dot_id: Mapped[str] = mapped_column(ForeignKey("dots.id"), default="dot-1")
    title: Mapped[str] = mapped_column(String, default="새 대화")
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    archived_at: Mapped[float | None] = mapped_column(Float, nullable=True)


class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    dot_id: Mapped[str] = mapped_column(ForeignKey("dots.id"), default="dot-1")
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id"))
    prompt: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, default="PENDING")


class Run(Base):
    __tablename__ = "runs"
    __table_args__ = (UniqueConstraint("conversation_id", "idempotency_key"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"))
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id"))
    idempotency_key: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="PENDING")
    wait_reason: Mapped[str | None] = mapped_column(String, nullable=True)
    provider: Mapped[str] = mapped_column(String)
    model: Mapped[str] = mapped_column(String)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    started_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    finished_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    result: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(String, nullable=True)


class ComputerSession(Base):
    __tablename__ = "computer_sessions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default="computer-1")
    dot_id: Mapped[str] = mapped_column(ForeignKey("dots.id"), default="dot-1")
    control_owner: Mapped[str] = mapped_column(String, default="AGENT")
    epoch: Mapped[int] = mapped_column(BigInteger, default=0)


class Message(Base):
    __tablename__ = "messages"
    sequence: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id"))
    run_id: Mapped[str | None] = mapped_column(ForeignKey("runs.id"), nullable=True)
    role: Mapped[str] = mapped_column(String)
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)


class Event(Base):
    __tablename__ = "events"
    sequence: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String, default=uid, unique=True)
    run_id: Mapped[str | None] = mapped_column(String, nullable=True)
    type: Mapped[str] = mapped_column(String)
    summary: Mapped[str] = mapped_column(Text)
    payload: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[float] = mapped_column(Float, default=time.time)


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[str] = mapped_column(String)


def serialize(row):
    result = {col.name: getattr(row, col.name) for col in row.__table__.columns}
    if isinstance(row, Event):
        result["payload"] = json.loads(result["payload"])
    return result


def migrate(engine):
    """Add columns introduced after the first release.

    ``Base.metadata.create_all`` only creates missing tables, so an existing
    database needs explicit ADD COLUMN statements for later additions.
    """
    columns = {name: {column["name"] for column in inspect(engine).get_columns(name)}
               for name in Base.metadata.tables}
    boolean = "FALSE" if engine.dialect.name == "postgresql" else "0"
    additions = [
        ("dots", "status", "VARCHAR DEFAULT 'ACTIVE' NOT NULL"),
        ("dots", "pinned", "BOOLEAN DEFAULT " + boolean + " NOT NULL"),
        ("dots", "position", "INTEGER"),
        ("dots", "created_at", "FLOAT"),
        ("dots", "last_active_at", "FLOAT"),
        ("conversations", "archived_at", "FLOAT"),
    ]
    with engine.begin() as connection:
        for table, column, ddl in additions:
            if column not in columns.get(table, {column}):
                connection.execute(text("ALTER TABLE " + table + " ADD COLUMN " + column + " " + ddl))
        connection.execute(text("UPDATE dots SET created_at = :now WHERE created_at IS NULL"), {"now": time.time()})


class Store:
    def __init__(self, url):
        kwargs = {"connect_args": {"check_same_thread": False}} if url.startswith("sqlite") else {}
        self.engine = create_engine(url, **kwargs)
        Base.metadata.create_all(self.engine)
        migrate(self.engine)
        with self.session() as db:
            if not db.get(Dot, "dot-1"):
                db.add(Dot(id="dot-1", name="OhMyDots"))
                db.flush()
            if not db.get(ComputerSession, "computer-1"):
                db.add(ComputerSession(id="computer-1"))
            db.commit()

    def session(self):
        return Session(self.engine, expire_on_commit=False)

    def event(self, kind, summary, run_id=None, payload=None):
        with self.session() as db:
            event = Event(type=kind, summary=summary, run_id=run_id, payload=json.dumps(payload or {}))
            db.add(event)
            db.commit()
            return serialize(event)

    def status(self, run_id, state, reason=None, result=None, error=None):
        with self.session() as db:
            run = db.get(Run, run_id)
            if run.status in ("COMPLETED", "FAILED", "CANCELLED"):
                return
            run.status = state
            run.wait_reason = reason
            run.result = result
            run.error = error
            if state == "RUNNING" and run.started_at is None:
                run.started_at = time.time()
            if state in ("COMPLETED", "FAILED", "CANCELLED"):
                run.finished_at = time.time()
            db.get(Task, run.task_id).status = state
            db.commit()
        self.event("run.changed", state, run_id, {"status": state, "wait_reason": reason, "error": error})

    def execution(self, conversation_id):
        with self.session() as db:
            run_ids = select(Run.id).where(Run.conversation_id == conversation_id)
            latest = select(func.max(Event.sequence)).where(
                Event.run_id.in_(run_ids),
                Event.type.in_(["run.activity", "message.updated", "run.usage", "run.question"]),
            ).group_by(Event.run_id, Event.type)
            return [serialize(event) for event in db.scalars(
                select(Event).where(or_(Event.sequence.in_(latest), and_(
                    Event.run_id.in_(run_ids),
                    Event.type.in_(["tool.started", "tool.completed", "tool.failed", "tool.cancelled"]),
                ))).order_by(Event.sequence)
            )]

    def usage(self):
        # Providers report cumulative totals per run. Replayed/intermediate updates
        # must not be added together; use only the latest report for each run.
        with self.session() as db:
            rows = db.execute(select(Event, Run.provider).join(Run, Run.id == Event.run_id)
                              .where(Event.type == "run.usage").order_by(Event.sequence.desc()))
            seen = set()
            providers = {}
            for event, provider in rows:
                if event.run_id in seen:
                    continue
                seen.add(event.run_id)
                payload = json.loads(event.payload)
                total = providers.setdefault(provider, {"provider": provider, "runs": 0,
                    "input_tokens": 0, "output_tokens": 0, "cached_input_tokens": 0})
                total["runs"] += 1
                for key in ("input_tokens", "output_tokens", "cached_input_tokens"):
                    value = payload.get(key, 0)
                    if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
                        total[key] += value
            return {"providers": list(providers.values()), "recorded_runs": len(seen)}

    def get_setting(self, key, default):
        with self.session() as db:
            item = db.get(Setting, key)
            return item.value if item else default

    def touch_dot(self, dot_id):
        """Record the last time a dot did visible work."""
        with self.session() as db:
            dot = db.get(Dot, dot_id)
            if dot:
                dot.last_active_at = time.time()
                db.commit()

    def memories(self, dot_id):
        with self.session() as db:
            return [serialize(row) for row in db.scalars(
                select(Memory).where(Memory.dot_id == dot_id).order_by(Memory.created_at))]

    def archive_conversations(self, dot_id):
        """Hide a removed dot's conversations without deleting their messages."""
        with self.session() as db:
            rows = list(db.scalars(select(Conversation).where(
                Conversation.dot_id == dot_id, Conversation.archived_at.is_(None))))
            for row in rows:
                row.archived_at = time.time()
            db.commit()
            return len(rows)

    def recover(self):
        with self.session() as db:
            # Pending runs also require an explicit retry after a server restart.
            ids = list(
                db.scalars(select(Run.id).where(Run.status.in_(["PENDING", "RUNNING", "WAITING_USER"])))
            )
        for run_id in ids:
            self.status(run_id, "FAILED", error="SERVER_RESTARTED")
        return ids
