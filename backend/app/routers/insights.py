"""Dashboard, reports and activity history — the read-only 'insights' endpoints."""

from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select

from ..deps import DB, ClockDep, CurrentUser
from ..models import ActivityLog, Budget, Habit, HabitLog, Loan, Reminder, SavingsGoal, Task, Transaction
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


# ---------------------------------------------------------------- monthly report

def _month_span(key: str) -> tuple[date, date]:
    y, m = int(key[:4]), int(key[5:])
    start = date(y, m, 1)
    end = date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)
    return start, end


def _prev_key(key: str) -> str:
    start, _ = _month_span(key)
    return (start - timedelta(days=1)).strftime("%Y-%m")


def _money_totals(db, user, start: date, end: date) -> tuple[float, float, list[Transaction]]:
    rows = db.scalars(
        select(Transaction).where(Transaction.user_id == user.id, Transaction.date >= start, Transaction.date <= end)
    ).unique().all()
    income = round(sum(t.amount for t in rows if t.type == "income"), 2)
    expense = round(sum(t.amount for t in rows if t.type == "expense"), 2)
    return income, expense, rows


def _change(now: float, before: float) -> float | None:
    return round((now - before) / before * 100, 1) if before else None


@router.get("/reports/monthly")
def monthly_report(
    user: CurrentUser,
    db: DB,
    clock: ClockDep,
    month: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="Default: last month"),
):
    """One-page summary of a month: money in and out, daily average, loans and savings.

    Defaults to the month that just ended. The current month is allowed too (marked partial).
    """
    today = clock.today
    key = month or _prev_key(today.strftime("%Y-%m"))
    start, end = _month_span(key)
    if start > today:
        raise HTTPException(status_code=400, detail="That month hasn't started yet.")
    partial = end >= today
    last = min(end, today)
    days = (last - start).days + 1

    income, expense, rows = _money_totals(db, user, start, end)
    p_start, p_end = _month_span(_prev_key(key))
    p_income, p_expense, _ = _money_totals(db, user, p_start, p_end)

    # Spending by category, biggest single expense and the most expensive day.
    by_cat: dict[str, dict] = {}
    per_day: dict[date, float] = {}
    biggest = None
    for t in rows:
        if t.type != "expense":
            continue
        name = t.category.name if t.category else "Uncategorized"
        c = by_cat.setdefault(name, {"name": name, "color": t.category.color if t.category else "#94A3B8", "total": 0.0})
        c["total"] = round(c["total"] + t.amount, 2)
        per_day[t.date] = per_day.get(t.date, 0) + t.amount
        if biggest is None or t.amount > biggest.amount:
            biggest = t
    categories = sorted(by_cat.values(), key=lambda c: c["total"], reverse=True)
    for c in categories:
        c["percent"] = round(c["total"] / expense * 100, 1) if expense else 0
    top_day = max(per_day.items(), key=lambda kv: kv[1], default=None)

    # Income that belonged to another month, both ways (salary paid in arrears).
    for_other = round(sum(t.amount for t in rows if t.type == "income" and t.for_month and t.for_month != key), 2)
    received_later = db.scalars(
        select(Transaction).where(
            Transaction.user_id == user.id, Transaction.type == "income", Transaction.for_month == key,
            (Transaction.date < start) | (Transaction.date > end),
        )
    ).unique().all()

    # Loans as they stood at the end of the month.
    owed_to_me, i_owe = [], []
    lent_out = borrowed_in = repaid_to_me = repaid_by_me = 0.0
    for loan in db.scalars(select(Loan).where(Loan.user_id == user.id)).unique().all():
        upto = [e for e in loan.entries if e.date <= last]
        remaining = round(sum(e.amount if e.kind == "principal" else -e.amount for e in upto), 2)
        for e in loan.entries:
            if start <= e.date <= end:
                if loan.direction == "lent":
                    if e.kind == "principal":
                        lent_out += e.amount
                    else:
                        repaid_to_me += e.amount
                else:
                    if e.kind == "principal":
                        borrowed_in += e.amount
                    else:
                        repaid_by_me += e.amount
        if remaining > 0.005:
            row = {"id": loan.id, "person": loan.person, "amount": remaining}
            (owed_to_me if loan.direction == "lent" else i_owe).append(row)
    owed_to_me.sort(key=lambda r: -r["amount"])
    i_owe.sort(key=lambda r: -r["amount"])

    # Savings: what was put aside this month, goals completed this month, and goals still running.
    put_aside = taken_out = 0.0
    completed, in_progress = [], []
    for g in db.scalars(select(SavingsGoal).where(SavingsGoal.user_id == user.id).order_by(SavingsGoal.id)).all():
        closing = ("Left over", "Spent beyond savings")
        for e in g.entries:
            if start <= e.date <= end and e.note not in closing:
                if e.kind == "deposit":
                    put_aside += e.amount
                else:
                    taken_out += e.amount
        if g.completed_on and start <= g.completed_on <= end:
            completed.append({"id": g.id, "name": g.name, "spent": g.spent or 0, "leftover": g.leftover or 0,
                              "target": g.target, "completed_on": g.completed_on.isoformat()})
        elif not g.completed_on or g.completed_on > last:
            saved = round(sum((e.amount if e.kind == "deposit" else -e.amount) for e in g.entries
                              if e.date <= last and e.note not in closing), 2)
            # Existed by then (created, or has savings dated, on or before the month's end).
            if g.created_at.date() <= last or any(e.date <= last for e in g.entries):
                in_progress.append({"id": g.id, "name": g.name, "saved": saved, "target": g.target,
                                    "progress": round(min(100.0, saved / g.target * 100), 1) if g.target else None})

    return {
        "month": key,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "partial": partial,
        "days": days,
        "has_data": bool(rows) or bool(owed_to_me or i_owe or completed or in_progress),
        "income": income,
        "expense": expense,
        "balance": round(income - expense, 2),
        "avg_daily_expense": round(expense / days, 2) if days else 0,
        "transactions": len(rows),
        "previous": {
            "month": _prev_key(key),
            "income": p_income,
            "expense": p_expense,
            "income_change": _change(income, p_income),
            "expense_change": _change(expense, p_expense),
        },
        "top_categories": categories[:5],
        "biggest_expense": {
            "amount": biggest.amount,
            "description": biggest.description or (biggest.category.name if biggest.category else "Expense"),
            "date": biggest.date.isoformat(),
        } if biggest else None,
        "top_spending_day": {"date": top_day[0].isoformat(), "amount": round(top_day[1], 2)} if top_day else None,
        "income_for_other_months": for_other,
        "received_later": round(sum(t.amount for t in received_later), 2),
        "loans": {
            "owed_to_me": round(sum(r["amount"] for r in owed_to_me), 2),
            "i_owe": round(sum(r["amount"] for r in i_owe), 2),
            "owed_to_me_people": owed_to_me[:5],
            "i_owe_people": i_owe[:5],
            "lent_this_month": round(lent_out, 2),
            "borrowed_this_month": round(borrowed_in, 2),
            "repaid_to_me_this_month": round(repaid_to_me, 2),
            "repaid_by_me_this_month": round(repaid_by_me, 2),
        },
        "savings": {
            "put_aside": round(put_aside, 2),
            "taken_out": round(taken_out, 2),
            "net": round(put_aside - taken_out, 2),
            "completed": completed,
            "in_progress": in_progress,
        },
    }
