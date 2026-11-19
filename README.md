# Dayora — Make Every Day Count

Personal everyday life manager for Android: tasks, money (budgets, loans, quick income),
habits, Namaz, reminders & calendar, notes, and reports.

| Folder | Stack |
| --- | --- |
| [`backend/`](backend/README.md) | Python · FastAPI · SQLAlchemy · JWT · bcrypt · SQLite |
| [`mobile/`](mobile/README.md) | Expo / React Native Android app |

## Quick start (Windows)

```bash
# 1. API  → http://<your-pc-ip>:8000/docs
cd backend
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python seed.py                      # optional demo data: demo@dayora.app / demo1234
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 2. App (development build)
cd mobile
npm install
npx expo start --dev-client -c
```

Install the debug APK (see `mobile/README.md`), open it, and connect to the address Expo prints.
