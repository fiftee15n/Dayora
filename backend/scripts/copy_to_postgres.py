"""Copy all data from the local SQLite database into another database (e.g. Neon Postgres).

    python scripts/copy_to_postgres.py "postgresql://user:pass@host/db?sslmode=require"

Run it once, against an empty target. Tables are created if needed; rows are copied in
dependency order; Postgres id sequences are advanced past the copied ids; profile pictures
stored as files under uploads/ are moved into the database (avatars table).
"""

import sys
import uuid
from pathlib import Path

from sqlalchemy import create_engine, func, insert, select, text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import models  # noqa: E402,F401  (registers tables)
from app.config import Settings  # noqa: E402
from app.database import Base  # noqa: E402

SOURCE = "sqlite:///" + str(Path(__file__).resolve().parents[1] / "dayora.db")
MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp"}


def main(target_url: str) -> None:
    target_url = Settings(database_url=target_url).database_url  # normalise postgres:// etc.
    src = create_engine(SOURCE)
    dst = create_engine(target_url)
    Base.metadata.create_all(dst)

    with src.connect() as s, dst.begin() as d:
        for table in Base.metadata.sorted_tables:
            if d.execute(select(func.count()).select_from(table)).scalar():
                raise SystemExit(f"Target table {table.name} isn't empty. Copy only into an empty database.")
        for table in Base.metadata.sorted_tables:
            if table.name not in src.dialect.get_table_names(s):
                continue
            cols = [c for c in table.columns if c.name in {x["name"] for x in src.dialect.get_columns(s, table.name)}]
            rows = [dict(r._mapping) for r in s.execute(select(*cols))]
            if rows:
                d.execute(insert(table), rows)
            print(f"{table.name:<24} {len(rows):>6} rows")

        # Profile pictures that were files on disk -> avatars table.
        uploads = Path(__file__).resolve().parents[1]
        users = Base.metadata.tables["users"]
        avatars = Base.metadata.tables["avatars"]
        for uid, url in d.execute(select(users.c.id, users.c.avatar_url).where(users.c.avatar_url.like("/uploads/%"))):
            f = uploads / url.lstrip("/")
            if f.exists() and f.suffix.lower() in MIME:
                token = uuid.uuid4().hex
                d.execute(insert(avatars).values(user_id=uid, token=token, content_type=MIME[f.suffix.lower()], data=f.read_bytes()))
                d.execute(users.update().where(users.c.id == uid).values(avatar_url=f"/api/avatars/{uid}/{token}"))
                print(f"moved profile picture of user {uid}")
            else:
                d.execute(users.update().where(users.c.id == uid).values(avatar_url=None))

        # New rows must get ids after the copied ones.
        if dst.dialect.name == "postgresql":
            for table in Base.metadata.sorted_tables:
                pk = list(table.primary_key.columns)
                if len(pk) == 1 and pk[0].autoincrement and pk[0].type.python_type is int and pk[0].name == "id":
                    d.execute(
                        text(
                            f"SELECT setval(pg_get_serial_sequence('{table.name}', 'id'), "
                            f"COALESCE((SELECT MAX(id) FROM {table.name}), 0) + 1, false)"
                        )
                    )
    print("Done.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
