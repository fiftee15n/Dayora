# Dayora API (FastAPI)

REST API for Dayora — tasks, expenses & budgets, habits, reminders, notes, dashboard and reports.

## Run

```bash
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env            # then set JWT_SECRET
python seed.py                    # optional demo data: demo@dayora.app / demo1234
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Interactive docs: http://localhost:8000/docs

## Auth
* Web: `POST /api/auth/login` sets an **HTTP-only cookie** (`dayora_token`).
* Mobile: the same response includes `access_token`; send it as `Authorization: Bearer <token>`.
* Clients send `X-TZ-Offset` (minutes east of UTC) so "today" matches the user's local day.
* Passwords hashed with bcrypt; login/register/reset endpoints are rate-limited.
* `POST /api/auth/logout-all` revokes every token for the user.

## Database
SQLite by default. For PostgreSQL / Neon: `pip install "psycopg[binary]"` and set
`DATABASE_URL=postgresql+psycopg://user:pass@host/dayora`.

## Tests
```bash
pytest -q
```
