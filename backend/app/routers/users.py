import secrets
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
    Avatar,
    Budget,
    ExpenseCategory,
    Habit,
    IncomeSource,
    Loan,
    Note,
    PrayerLog,
    SavingsGoal,
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
    IncomeSourceOut,
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
avatar_router = APIRouter(tags=["users"])

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

    _remove_avatar_file(user)
    token = uuid.uuid4().hex
    row = db.get(Avatar, user.id)
    if row is None:
        row = Avatar(user_id=user.id, token=token, content_type=_MIME[ext], data=content)
        db.add(row)
    else:
        row.token, row.content_type, row.data = token, _MIME[ext], content
    user.avatar_url = f"/api/avatars/{user.id}/{token}"
    db.commit()
    return user


@router.delete("/me/avatar", response_model=UserOut)
def remove_avatar(user: CurrentUser, db: DB):
    _remove_avatar_file(user)
    row = db.get(Avatar, user.id)
    if row is not None:
        db.delete(row)
    user.avatar_url = None
    db.commit()
    return user


_MIME = {".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp"}


@avatar_router.get("/api/avatars/{user_id}/{token}", include_in_schema=False)
def get_avatar(user_id: int, token: str, db: DB):
    """Public (unguessable token in the URL) so <Image> can load it without auth headers."""
    row = db.get(Avatar, user_id)
    if row is None or not secrets.compare_digest(row.token, token):
        raise HTTPException(status_code=404, detail="Not found")
    return Response(content=row.data, media_type=row.content_type, headers={"Cache-Control": "public, max-age=31536000, immutable"})


def _remove_avatar_file(user: User) -> None:
    """Remove a picture from the older on-disk storage, if this account still has one."""
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
        "loans": [
            {
                "id": l.id,
                "person": l.person,
                "direction": l.direction,
                "note": l.note,
                "due_date": l.due_date.isoformat() if l.due_date else None,
                "entries": [
                    {"kind": e.kind, "amount": e.amount, "date": e.date.isoformat(), "note": e.note}
                    for e in l.entries
                ],
            }
            for l in db.scalars(select(Loan).where(Loan.user_id == user.id).order_by(Loan.id))
        ],
        "income_sources": rows(IncomeSource, IncomeSourceOut),
        "savings": [
            {
                "id": g.id,
                "name": g.name,
                "target": g.target,
                "note": g.note,
                "entries": [
                    {"kind": e.kind, "amount": e.amount, "date": e.date.isoformat(), "note": e.note}
                    for e in g.entries
                ],
            }
            for g in db.scalars(select(SavingsGoal).where(SavingsGoal.user_id == user.id).order_by(SavingsGoal.id))
        ],
        "prayers": [
            {"date": p.date.isoformat(), "prayer": p.prayer, "status": p.status}
            for p in db.scalars(select(PrayerLog).where(PrayerLog.user_id == user.id).order_by(PrayerLog.date))
        ],
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
