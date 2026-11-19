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
* `POST /api/auth/login` returns `access_token`; the app sends it as `Authorization: Bearer <token>`.
  (An HTTP-only cookie, `dayora_token`, is also set for browser clients.)
* Clients send `X-TZ-Offset` (minutes east of UTC) so "today" matches the user's local day.
* Passwords hashed with bcrypt; login/register/reset endpoints are rate-limited.
* `POST /api/auth/logout-all` revokes every token for the user. Changing the password does the
  same for every *other* session and returns a fresh token for the current one.
* Password reset: `POST /api/auth/forgot-password` `{email}` emails a 6-digit code (30 minutes,
  5 wrong tries), then `POST /api/auth/reset-password` `{email, code, new_password}`. Without
  `SMTP_HOST` the email is logged, and in development the code is returned as `dev_reset_code`.
* Outside development the API refuses to start unless `JWT_SECRET` is 32+ characters.
  Set `COOKIE_SECURE=true` behind HTTPS (this also enables HSTS).

### Sign-up with an email code (used by the mobile app)
1. `POST /api/auth/signup/start` `{email, password, name?}` stores a pending sign-up and emails a
   6-digit code. No account exists yet. Without SMTP in development the code is also returned as
   `dev_code`.
2. `POST /api/auth/signup/verify` `{email, code}` creates the account and returns the token.

Codes expire after `VERIFICATION_CODE_EXPIRE_MINUTES` (10), allow `VERIFICATION_MAX_ATTEMPTS` (5)
wrong guesses, and `POST /api/auth/signup/resend` `{email}` sends a new one after
`VERIFICATION_RESEND_SECONDS` (60). Codes are stored as keyed hashes. The one-step
`POST /api/auth/register` (one step, no email check) remains for scripts and tests.

**Sending from Gmail:** turn on 2-Step Verification for the Gmail account, create an
[App password](https://myaccount.google.com/apppasswords), then in `.env`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_STARTTLS=true
SMTP_USER=yourname@gmail.com
SMTP_PASSWORD=the-16-character-app-password
SMTP_FROM=Dayora <yourname@gmail.com>
```

### Google sign-in
`POST /api/auth/google` `{id_token}` verifies a Google ID token (signature against Google's keys,
audience, issuer, expiry, verified email). It signs in the user linked to that Google account,
links Google to an existing account with the same email, or creates a new account.
Set `GOOGLE_CLIENT_IDS` to the **Web application** OAuth client ID (the app's `webClientId`).
Without it the endpoint returns 503.

## Endpoints at a glance
| Area | Endpoints |
| --- | --- |
| Auth | `POST /api/auth/register · signup/start · signup/verify · signup/resend · google · login · logout · logout-all · forgot-password · reset-password`, `GET /api/auth/me` |
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
