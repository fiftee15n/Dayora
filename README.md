# Dayora — Make Every Day Count

Personal everyday life manager: tasks, expenses & budgets, habits, reminders & calendar,
notes, and activity reports.

| Folder | Stack |
| --- | --- |
| [`backend/`](backend/README.md) | Python · FastAPI · SQLAlchemy · JWT (HTTP-only cookie + Bearer) · bcrypt |
| [`frontend/`](frontend/README.md) | Next.js · TypeScript · Tailwind · shadcn-style UI · Recharts |
| `mobile/` | Expo / React Native Android app *(in progress)* |

## Quick start (Windows)

```bash
# 1. API  → http://localhost:8000/docs
cd backend
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python seed.py                      # demo@dayora.app / demo1234
uvicorn app.main:app --reload --port 8000

# 2. Web  → http://localhost:3000
cd frontend
npm install
copy .env.example .env.local
npm run dev
```
