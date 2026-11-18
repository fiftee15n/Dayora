import uuid
from datetime import date as Date
from pathlib import Path

from fastapi import APIRouter, HTTPException, Response, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy import select

from ..config import settings
from ..deps import DB, CurrentUser, log_activity
from ..models import (
    ActivityLog,
    Budget,
    ExpenseCategory,
    Habit,
    Note,
    Reminder,
    Task,
    TaskCategory,
    Transaction,
    User,
    utcnow,
)
from ..schemas import (
    ActivityOut,
    AuthOut,
    BudgetOut,
    ExpenseCategoryOut,
    NoteOut,
    PasswordChange,
    ProfileUpdate,
    ReminderOut,
    TaskCategoryOut,
    TaskOut,
    TransactionOut,
    UserOut,
)
from ..security import hash_password, verify_password
from .auth import _issue

router = APIRouter(prefix="/api/users", tags=["users"])

_IMAGE_SIGNATURES = {
    b"\x89PNG\r\n\x1a\n": ".png",
    b"\xff\xd8\xff": ".jpg",
    b"GIF87a": ".gif",
    b"GIF89a": ".gif",
}


def _detect_ext(head: bytes) -> str | None:
    for sig, ext in _IMAGE_SIGNATURES.items():
        if head.startswith(sig):
            return ext
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return ".webp"
    return None


@router.patch("/me", response_model=UserOut)
def update_profile(data: ProfileUpdate, user: CurrentUser, db: DB):
    if data.email and data.email.lower() != user.email:
        if db.scalar(select(User).where(User.email == data.email.lower())):
            raise HTTPException(status_code=409, detail="Email already in use")
        user.email = data.email.lower()
    if data.name is not None:
        user.name = data.name.strip()
    if data.currency is not None:
        user.currency = data.currency.upper()
    log_activity(db, user, "updated", "account", "Profile updated")
    db.commit()
    return user


@router.post("/me/password", response_model=AuthOut)
def change_password(data: PasswordChange, response: Response, user: CurrentUser, db: DB):
    """Change the password and sign out every other session. This session gets a fresh token."""
    if not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if data.current_password == data.new_password:
        raise HTTPException(status_code=400, detail="New password must be different")
    user.hashed_password = hash_password(data.new_password)
    user.token_version += 1
    log_activity(db, user, "updated", "account", "Password changed")
    db.commit()
    return _issue(response, user)


@router.post("/me/avatar", response_model=UserOut)
async def upload_avatar(file: UploadFile, user: CurrentUser, db: DB):
    content = await file.read(settings.max_avatar_bytes + 1)
    if len(content) > settings.max_avatar_bytes:
        raise HTTPException(status_code=413, detail="Image must be 2 MB or smaller")
    ext = _detect_ext(content[:16])
    if not ext:
        raise HTTPException(status_code=415, detail="Please upload a PNG, JPEG, GIF or WebP image")

    folder = Path(settings.upload_dir) / "avatars"
    folder.mkdir(parents=True, exist_ok=True)
    name = f"{user.id}_{uuid.uuid4().hex}{ext}"
    (folder / name).write_bytes(content)

    _remove_avatar_file(user)
    user.avatar_url = f"/uploads/avatars/{name}"
    db.commit()
    return user


@router.delete("/me/avatar", response_model=UserOut)
def remove_avatar(user: CurrentUser, db: DB):
    _remove_avatar_file(user)
    user.avatar_url = None
    db.commit()
    return user


def _remove_avatar_file(user: User) -> None:
    if user.avatar_url and user.avatar_url.startswith("/uploads/avatars/"):
        (Path(settings.upload_dir) / "avatars" / Path(user.avatar_url).name).unlink(missing_ok=True)


@router.get("/me/export")
def export_data(user: CurrentUser, db: DB):
    """Download everything stored for this account as a single JSON file."""

    def rows(model, schema, *order):
        stmt = select(model).where(model.user_id == user.id).order_by(*order or (model.id,))
        return [schema.model_validate(r).model_dump(mode="json") for r in db.scalars(stmt).unique()]

    habits = db.scalars(select(Habit).where(Habit.user_id == user.id).order_by(Habit.id)).all()
    payload = {
        "exported_at": utcnow().isoformat() + "Z",
        "profile": UserOut.model_validate(user).model_dump(mode="json"),
        "task_categories": rows(TaskCategory, TaskCategoryOut),
        "expense_categories": rows(ExpenseCategory, ExpenseCategoryOut),
        "tasks": rows(Task, TaskOut),
        "transactions": rows(Transaction, TransactionOut, Transaction.date, Transaction.id),
        "budgets": rows(Budget, BudgetOut, Budget.month, Budget.id),
        "habits": [
            {
                "id": h.id,
                "name": h.name,
                "description": h.description,
                "frequency": h.frequency,
                "color": h.color,
                "icon": h.icon,
                "archived": h.archived,
                "created_at": h.created_at.isoformat() + "Z",
                "logs": [log.date.isoformat() for log in h.logs],
            }
            for h in habits
        ],
        "reminders": rows(Reminder, ReminderOut, Reminder.remind_at),
        "notes": rows(Note, NoteOut),
        "activity": rows(ActivityLog, ActivityOut, ActivityLog.created_at),
    }
    filename = f"dayora-export-{Date.today().isoformat()}.json"
    return JSONResponse(
        payload, headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.delete("/me", status_code=204)
def delete_account(response: Response, user: CurrentUser, db: DB):
    _remove_avatar_file(user)
    db.delete(user)
    db.commit()
    response.delete_cookie(settings.cookie_name, path="/")
