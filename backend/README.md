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
* `POST /api/auth/logout-all` revokes every token for the user. Changing the password does the
  same for every *other* session and returns a fresh token for the current one.
* Password reset emails are sent over SMTP (`SMTP_*` in `.env`). Without `SMTP_HOST` the email is
  logged, and in development the token is also returned as `dev_reset_token`.
* Outside development the API refuses to start unless `JWT_SECRET` is 32+ characters.
  Set `COOKIE_SECURE=true` behind HTTPS (this also enables HSTS).

## Endpoints at a glance
| Area | Endpoints |
| --- | --- |
| Auth | `POST /api/auth/register · login · logout · logout-all · forgot-password · reset-password`, `GET /api/auth/me` |
| Account | `PATCH/DELETE /api/users/me`, `POST /api/users/me/password`, `POST/DELETE /api/users/me/avatar`, `GET /api/users/me/export` |
| Categories | `GET/POST /api/categories/tasks`, `PATCH/DELETE /api/categories/tasks/{id}` (same for `/expenses`) |
| Tasks | `GET/POST /api/tasks`, `GET/PATCH/DELETE /api/tasks/{id}` |
| Finance | `/api/transactions` (CRUD, paged), `/api/transactions/summary`, `GET/PUT /api/budgets`, `DELETE /api/budgets/{id}` |
| Habits | `GET/POST /api/habits`, `GET /api/habits/overview`, `PATCH/DELETE /api/habits/{id}`, `POST /api/habits/{id}/toggle`, `GET /api/habits/{id}/logs` |
| Reminders | `GET/POST /api/reminders` (`?start&end&expand=true` projects recurring ones), `GET/PATCH/DELETE /api/reminders/{id}`, `POST /api/reminders/{id}/complete` |
| Notes | `GET/POST /api/notes`, `GET /api/notes/categories`, `GET/PATCH/DELETE /api/notes/{id}` |
| Insights | `GET /api/dashboard`, `GET /api/reports?period=week|month&offset=`, `GET /api/activity` |

## Database
SQLite by default. For PostgreSQL / Neon: `pip install "psycopg[binary]"` and set
`DATABASE_URL=postgresql+psycopg://user:pass@host/dayora`.

## Tests
```bash
pytest -q
```
