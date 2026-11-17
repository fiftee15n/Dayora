"""Dashboard, reports and activity history — the read-only 'insights' endpoints."""

from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from ..deps import DB, ClockDep, CurrentUser
from ..models import ActivityLog, Budget, Habit, HabitLog, Reminder, Task, Transaction
from ..schemas import ActivityOut, Page, ReminderOut, TaskOut
from .habits import habit_stats

router = APIRouter(prefix="/api", tags=["insights"])


def _series(db, user, clock, start: date, end: date) -> list[dict]:
    """Per-day activity between start and end (inclusive), in the user's local dates."""
    days = {}
    d = start
    while d <= end:
        days[d] = {
            "date": d.isoformat(),
            "tasks_completed": 0,
            "income": 0.0,
            "expense": 0.0,
            "habit_checkins": 0,
        }
        d += timedelta(days=1)

    start_utc = clock.day_start_utc(start)
    end_utc = clock.day_start_utc(end + timedelta(days=1))
    for (completed_at,) in db.execute(
        select(Task.completed_at).where(
            Task.user_id == user.id,
            Task.completed.is_(True),
            Task.completed_at >= start_utc,
            Task.completed_at < end_utc,
        )
    ):
        ld = clock.local_date(completed_at)
        if ld in days:
            days[ld]["tasks_completed"] += 1

    for tx_date, tx_type, total in db.execute(
        select(Transaction.date, Transaction.type, func.sum(Transaction.amount))
        .where(Transaction.user_id == user.id, Transaction.date >= start, Transaction.date <= end)
        .group_by(Transaction.date, Transaction.type)
    ):
        days[tx_date][tx_type] = round(float(total), 2)

    for log_date, count in db.execute(
        select(HabitLog.date, func.count())
        .join(Habit)
        .where(Habit.user_id == user.id, HabitLog.date >= start, HabitLog.date <= end)
        .group_by(HabitLog.date)
    ):
        days[log_date]["habit_checkins"] = count

    return list(days.values())


@router.get("/dashboard")
def dashboard(user: CurrentUser, db: DB, clock: ClockDep):
    today = clock.today
    now = clock.now_utc
    day_start, day_end = clock.day_start_utc(today), clock.day_start_utc(today + timedelta(days=1))
    month_start = today.replace(day=1)

    def count(*conds) -> int:
        return db.scalar(select(func.count(Task.id)).where(Task.user_id == user.id, *conds)) or 0

    tasks = {
        "total": count(),
        "completed": count(Task.completed.is_(True)),
        "pending": count(Task.completed.is_(False)),
        "overdue": count(Task.completed.is_(False), Task.due_date < now),
        "due_today": count(Task.due_date >= day_start, Task.due_date < day_end),
        "due_today_completed": count(
            Task.due_date >= day_start, Task.due_date < day_end, Task.completed.is_(True)
        ),
        "completed_today": count(Task.completed_at >= day_start, Task.completed_at < day_end),
    }
    today_tasks = db.scalars(
        select(Task)
        .where(
            Task.user_id == user.id,
            (Task.due_date < day_end) & (Task.completed.is_(False))
            | ((Task.completed_at >= day_start) & (Task.completed_at < day_end)),
        )
        .order_by(Task.completed, Task.due_date)
        .limit(8)
    ).unique().all()

    def tx_sum(tx_type: str, start: date, end: date) -> float:
        return round(
            float(
                db.scalar(
                    select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                        Transaction.user_id == user.id,
                        Transaction.type == tx_type,
                        Transaction.date >= start,
                        Transaction.date <= end,
                    )
                )
                or 0
            ),
            2,
        )

    month_expense = tx_sum("expense", month_start, today)
    budget = db.scalar(
        select(Budget).where(
            Budget.user_id == user.id,
            Budget.month == today.strftime("%Y-%m"),
            Budget.category_id.is_(None),
        )
    )
    finance = {
        "currency": user.currency,
        "today_income": tx_sum("income", today, today),
        "today_expense": tx_sum("expense", today, today),
        "month_income": tx_sum("income", month_start, today),
        "month_expense": month_expense,
        "budget": {"amount": budget.amount, "spent": month_expense} if budget else None,
    }
    finance["month_balance"] = round(finance["month_income"] - month_expense, 2)

    reminders = db.scalars(
        select(Reminder)
        .where(
            Reminder.user_id == user.id,
            Reminder.completed.is_(False),
            Reminder.remind_at >= day_start,
        )
        .order_by(Reminder.remind_at)
        .limit(5)
    ).all()

    habits = [
        habit_stats(h, today)
        for h in db.scalars(
            select(Habit).where(Habit.user_id == user.id, Habit.archived.is_(False))
        ).all()
    ]
    done = sum(h.done_today if h.frequency == "daily" else h.done_this_week for h in habits)

    activity = db.scalars(
        select(ActivityLog)
        .where(ActivityLog.user_id == user.id)
        .order_by(ActivityLog.created_at.desc())
        .limit(6)
    ).all()

    week = _series(db, user, clock, today - timedelta(days=6), today)
    month = _series(db, user, clock, month_start, today)

    return {
        "user": {"name": user.name, "avatar_url": user.avatar_url},
        "today": today.isoformat(),
        "tasks": tasks,
        "today_tasks": [TaskOut.model_validate(t).model_dump(mode="json") for t in today_tasks],
        "finance": finance,
        "upcoming_reminders": [ReminderOut.model_validate(r).model_dump(mode="json") for r in reminders],
        "habits": {
            "total": len(habits),
            "done": done,
            "progress": round(done / len(habits) * 100, 1) if habits else 0,
            "items": [h.model_dump(mode="json", exclude={"recent_logs"}) for h in habits[:6]],
        },
        "week": week,
        "month_summary": {
            "tasks_completed": sum(d["tasks_completed"] for d in month),
            "habit_checkins": sum(d["habit_checkins"] for d in month),
            "income": finance["month_income"],
            "expense": month_expense,
        },
        "recent_activity": [ActivityOut.model_validate(a).model_dump(mode="json") for a in activity],
    }


@router.get("/reports")
def reports(
    user: CurrentUser,
    db: DB,
    clock: ClockDep,
    period: Literal["week", "month"] = "week",
    offset: int = Query(default=0, ge=0, le=60, description="0 = current period, 1 = previous..."),
):
    today = clock.today
    if period == "week":
        start = today - timedelta(days=today.weekday()) - timedelta(weeks=offset)
        end = start + timedelta(days=6)
    else:
        y, m = today.year, today.month - offset
        while m <= 0:
            y, m = y - 1, m + 12
        start = date(y, m, 1)
        end = (date(y + (m == 12), m % 12 + 1, 1)) - timedelta(days=1)

    series = _series(db, user, clock, start, min(end, today) if start <= today else end)
    start_utc, end_utc = clock.day_start_utc(start), clock.day_start_utc(end + timedelta(days=1))

    tasks_created = db.scalar(
        select(func.count(Task.id)).where(
            Task.user_id == user.id, Task.created_at >= start_utc, Task.created_at < end_utc
        )
    )
    reminders_done = db.scalar(
        select(func.count(ActivityLog.id)).where(
            ActivityLog.user_id == user.id,
            ActivityLog.entity_type == "reminder",
            ActivityLog.action == "completed",
            ActivityLog.created_at >= start_utc,
            ActivityLog.created_at < end_utc,
        )
    )
    active_habits = db.scalar(
        select(func.count(Habit.id)).where(
            Habit.user_id == user.id, Habit.archived.is_(False), Habit.frequency == "daily"
        )
    ) or 0

    totals = {
        k: round(sum(d[k] for d in series), 2)
        for k in ("tasks_completed", "income", "expense", "habit_checkins")
    }
    possible = active_habits * len(series)
    best = max(series, key=lambda d: d["tasks_completed"] + d["habit_checkins"], default=None)

    by_cat: dict[str, dict] = {}
    for tx in db.scalars(
        select(Transaction).where(
            Transaction.user_id == user.id,
            Transaction.type == "expense",
            Transaction.date >= start,
            Transaction.date <= end,
        )
    ).unique():
        name = tx.category.name if tx.category else "Uncategorized"
        entry = by_cat.setdefault(
            name, {"name": name, "color": tx.category.color if tx.category else "#94A3B8", "total": 0.0}
        )
        entry["total"] = round(entry["total"] + tx.amount, 2)

    return {
        "period": period,
        "start": start.isoformat(),
        "end": end.isoformat(),
        **totals,
        "balance": round(totals["income"] - totals["expense"], 2),
        "tasks_created": tasks_created or 0,
        "reminders_completed": reminders_done or 0,
        "habit_rate": round(min(totals["habit_checkins"] / possible, 1) * 100, 1) if possible else 0,
        "most_productive_day": best["date"]
        if best and (best["tasks_completed"] + best["habit_checkins"]) > 0
        else None,
        "series": series,
        "top_categories": sorted(by_cat.values(), key=lambda c: c["total"], reverse=True)[:5],
    }


@router.get("/activity", response_model=Page[ActivityOut])
def activity(
    user: CurrentUser,
    db: DB,
    entity_type: str | None = Query(default=None, max_length=30),
    action: str | None = Query(default=None, max_length=40),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
):
    stmt = select(ActivityLog).where(ActivityLog.user_id == user.id)
    if entity_type:
        stmt = stmt.where(ActivityLog.entity_type == entity_type)
    if action:
        stmt = stmt.where(ActivityLog.action == action)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(
        stmt.order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return Page[ActivityOut](items=items, total=total, page=page, page_size=page_size)
