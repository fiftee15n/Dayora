from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import models  # noqa: F401  (register tables)
from .config import settings
from .database import Base, engine, upgrade_schema
from .routers import auth, categories, habits, insights, loans, notes, reminders, tasks, transactions, users


@asynccontextmanager
async def lifespan(_: FastAPI):
    # For production Postgres, prefer Alembic migrations; create_all is fine for SQLite/dev.
    Base.metadata.create_all(bind=engine)
    upgrade_schema()
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Dayora — Make Every Day Count. REST API for tasks, finances, habits, reminders and notes.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-TZ-Offset"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if settings.cookie_secure:
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


for r in (auth, users, categories, tasks, transactions, loans, habits, reminders, notes, insights):
    app.include_router(r.router)

Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok", "app": settings.app_name}
