from calendar import monthrange
from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter
from sqlalchemy import select

from ..deps import DB, ClockDep, CurrentUser, get_owned, log_activity
from ..models import Reminder, utcnow
from ..schemas import ReminderIn, ReminderOut, ReminderUpdate

router = APIRouter(prefix="/api/reminders", tags=["reminders"])


def next_occurrence(dt: datetime, recurrence: str) -> datetime | None:
    if recurrence == "daily":
        return dt + timedelta(days=1)
    if recurrence == "weekly":
        return dt + timedelta(weeks=1)
    if recurrence == "monthly":
        y, m = (dt.year + 1, 1) if dt.month == 12 else (dt.year, dt.month + 1)
        return dt.replace(year=y, month=m, day=min(dt.day, monthrange(y, m)[1]))
    if recurrence == "yearly":
        y = dt.year + 1
        return dt.replace(year=y, day=min(dt.day, monthrange(y, dt.month)[1]))
    return None


@router.get("", response_model=list[ReminderOut])
def list_reminders(
    user: CurrentUser,
    db: DB,
    clock: ClockDep,
    status: Literal["all", "upcoming", "completed", "overdue", "due"] = "all",
    start: date | None = None,
    end: date | None = None,
    limit: int = 500,
):
    now = clock.now_utc
    stmt = select(Reminder).where(Reminder.user_id == user.id)
    if status == "upcoming":
        stmt = stmt.where(Reminder.completed.is_(False), Reminder.remind_at >= now)
    elif status == "completed":
        stmt = stmt.where(Reminder.completed.is_(True))
    elif status in {"overdue", "due"}:
        stmt = stmt.where(Reminder.completed.is_(False), Reminder.remind_at < now)
    if start:
        stmt = stmt.where(Reminder.remind_at >= clock.day_start_utc(start))
    if end:
        stmt = stmt.where(Reminder.remind_at < clock.day_start_utc(end + timedelta(days=1)))
    order = Reminder.remind_at.desc() if status == "completed" else Reminder.remind_at
    return db.scalars(stmt.order_by(order).limit(min(limit, 500))).all()


@router.post("", response_model=ReminderOut, status_code=201)
def create_reminder(data: ReminderIn, user: CurrentUser, db: DB):
    r = Reminder(user_id=user.id, **data.model_dump())
    db.add(r)
    db.flush()
    log_activity(db, user, "created", "reminder", f"Added reminder “{r.title}”", r.id)
    db.commit()
    db.refresh(r)
    return r


@router.patch("/{reminder_id}", response_model=ReminderOut)
def update_reminder(reminder_id: int, data: ReminderUpdate, user: CurrentUser, db: DB):
    r = get_owned(db, Reminder, reminder_id, user)
    changes = data.model_dump(exclude_unset=True)
    done = changes.pop("completed", None)
    for key, value in changes.items():
        if value is None and key != "description":
            continue
        setattr(r, key, value)
    if done is True:
        return complete_reminder(reminder_id, user, db)
    if done is False:
        r.completed, r.completed_at = False, None
    db.commit()
    db.refresh(r)
    return r


@router.post("/{reminder_id}/complete", response_model=ReminderOut)
def complete_reminder(reminder_id: int, user: CurrentUser, db: DB):
    """Complete a reminder. Recurring reminders roll forward to their next occurrence."""
    r = get_owned(db, Reminder, reminder_id, user)
    log_activity(db, user, "completed", "reminder", f"Completed reminder “{r.title}”", r.id)
    nxt = next_occurrence(r.remind_at, r.recurrence)
    if nxt:
        now = utcnow()
        while nxt <= now:  # skip occurrences that already passed
            nxt = next_occurrence(nxt, r.recurrence)
        r.remind_at = nxt
        r.completed, r.completed_at = False, None
    else:
        r.completed, r.completed_at = True, utcnow()
    db.commit()
    db.refresh(r)
    return r


@router.delete("/{reminder_id}", status_code=204)
def delete_reminder(reminder_id: int, user: CurrentUser, db: DB):
    r = get_owned(db, Reminder, reminder_id, user)
    log_activity(db, user, "deleted", "reminder", f"Deleted reminder “{r.title}”", r.id)
    db.delete(r)
    db.commit()
