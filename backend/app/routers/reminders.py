from calendar import monthrange
from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
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


MAX_OCCURRENCES = 1000


def _expand(reminders, start_utc: datetime, end_utc: datetime) -> list[ReminderOut]:
    """Project recurring reminders onto every occurrence inside [start_utc, end_utc).

    The stored `remind_at` is the series' next due time; earlier occurrences were already
    completed (or rolled over), so only that time and later ones are shown.
    """
    out: list[ReminderOut] = []
    for r in reminders:
        base = ReminderOut.model_validate(r)
        if r.recurrence == "none" or r.completed:
            if start_utc <= r.remind_at < end_utc:
                out.append(base)
            continue
        at, n = r.remind_at, 0
        while at < end_utc and n < MAX_OCCURRENCES:
            if at >= start_utc:
                out.append(
                    base.model_copy(
                        update={
                            "remind_at": at,
                            "occurrence": at != r.remind_at,
                            "series_remind_at": r.remind_at,
                        }
                    )
                )
            at = next_occurrence(at, r.recurrence)
            n += 1
    out.sort(key=lambda o: o.remind_at)
    return out


@router.get("", response_model=list[ReminderOut])
def list_reminders(
    user: CurrentUser,
    db: DB,
    clock: ClockDep,
    status: Literal["all", "upcoming", "completed", "overdue", "due"] = "all",
    start: date | None = None,
    end: date | None = None,
    expand: bool = Query(
        default=False,
        description="With start & end: include every future occurrence of recurring reminders.",
    ),
    limit: int = Query(default=500, ge=1, le=500),
):
    now = clock.now_utc
    stmt = select(Reminder).where(Reminder.user_id == user.id)
    if status == "upcoming":
        stmt = stmt.where(Reminder.completed.is_(False), Reminder.remind_at >= now)
    elif status == "completed":
        stmt = stmt.where(Reminder.completed.is_(True))
    elif status in {"overdue", "due"}:
        stmt = stmt.where(Reminder.completed.is_(False), Reminder.remind_at < now)

    if expand and start and end:
        if (end - start).days > 400:
            raise HTTPException(status_code=400, detail="Range can be at most about a year")
        start_utc = clock.day_start_utc(start)
        end_utc = clock.day_start_utc(end + timedelta(days=1))
        # Recurring series that started before the window can still land inside it.
        stmt = stmt.where(
            Reminder.remind_at < end_utc,
            (Reminder.remind_at >= start_utc)
            | ((Reminder.recurrence != "none") & Reminder.completed.is_(False)),
        )
        return _expand(db.scalars(stmt).all(), start_utc, end_utc)[:limit]

    if start:
        stmt = stmt.where(Reminder.remind_at >= clock.day_start_utc(start))
    if end:
        stmt = stmt.where(Reminder.remind_at < clock.day_start_utc(end + timedelta(days=1)))
    order = Reminder.remind_at.desc() if status == "completed" else Reminder.remind_at
    return db.scalars(stmt.order_by(order).limit(limit)).all()


@router.get("/{reminder_id}", response_model=ReminderOut)
def get_reminder(reminder_id: int, user: CurrentUser, db: DB):
    return get_owned(db, Reminder, reminder_id, user)


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
