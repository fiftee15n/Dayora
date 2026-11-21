from collections.abc import Generator

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from .config import settings

_is_sqlite = settings.database_url.startswith("sqlite")

engine = create_engine(
    settings.database_url,
    # SQLite: allow use across threads. Postgres via Neon's pooler (PgBouncer): don't use
    # server-side prepared statements, which a transaction pooler can't keep track of.
    connect_args={"check_same_thread": False} if _is_sqlite else {"prepare_threshold": None},
    pool_pre_ping=not _is_sqlite,
    # Serverless instances come and go: don't hold connections open between requests.
    **({"poolclass": NullPool} if settings.serverless and not _is_sqlite else {}),
)

if _is_sqlite:

    @event.listens_for(engine, "connect")
    def _enable_sqlite_fk(dbapi_conn, _):  # pragma: no cover - driver hook
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def upgrade_schema() -> None:
    """Add columns introduced after a database was first created (create_all only adds tables)."""
    insp = inspect(engine)
    tables = insp.get_table_names()
    if "users" not in tables:
        return
    columns = {c["name"] for c in insp.get_columns("users")}
    tx_columns = {c["name"] for c in insp.get_columns("transactions")} if "transactions" in tables else set()
    reset_columns = (
        {c["name"] for c in insp.get_columns("password_reset_tokens")} if "password_reset_tokens" in tables else set()
    )
    with engine.begin() as conn:
        if "google_sub" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN google_sub VARCHAR(64)"))
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_sub ON users (google_sub)"))
        if tx_columns and "income_source_id" not in tx_columns:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN income_source_id INTEGER"))
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_transactions_income_source_id ON transactions (income_source_id)")
            )
        if reset_columns and "attempts" not in reset_columns:
            conn.execute(text("ALTER TABLE password_reset_tokens ADD COLUMN attempts INTEGER DEFAULT 0"))
        if tx_columns and "for_month" not in tx_columns:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN for_month VARCHAR(7)"))
        source_columns = {c["name"] for c in insp.get_columns("income_sources")} if "income_sources" in tables else set()
        if source_columns and "for_previous_month" not in source_columns:
            conn.execute(text("ALTER TABLE income_sources ADD COLUMN for_previous_month BOOLEAN DEFAULT FALSE"))
        savings_columns = {c["name"] for c in insp.get_columns("savings_goals")} if "savings_goals" in tables else set()
        if savings_columns and "completed_on" not in savings_columns:
            conn.execute(text("ALTER TABLE savings_goals ADD COLUMN completed_on DATE"))
            conn.execute(text("ALTER TABLE savings_goals ADD COLUMN spent FLOAT"))
            conn.execute(text("ALTER TABLE savings_goals ADD COLUMN leftover FLOAT"))


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
