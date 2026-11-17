from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from ..deps import DB, ClockDep, CurrentUser, get_owned, log_activity
from ..models import Habit, HabitLog
from ..schemas import HabitIn, HabitOut, HabitToggleIn, HabitUpdate

router = APIRouter(prefix="/api/habits", tags=["habits"])


def _monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _run_lengths(units: list[date], step: timedelta) -> int:
    """Longest run of consecutive units (sorted, unique)."""
    best = run = 0
    prev = None
    for u in units:
        run = run + 1 if prev is not None and u - prev == step else 1
        best = max(best, run)
        prev = u
    return best


def habit_stats(habit: Habit, today: date) -> HabitOut:
    logged = sorted({log.date for log in habit.logs})
    out = HabitOut.model_validate(habit)
    created = habit.created_at.date()

    if habit.frequency == "weekly":
        weeks = sorted({_monday(d) for d in logged})
        week_set = set(weeks)
        this_week = _monday(today)
        out.done_this_week = this_week in week_set
        cursor = this_week if out.done_this_week else this_week - timedelta(weeks=1)
        streak = 0
        while cursor in week_set:
            streak += 1
            cursor -= timedelta(weeks=1)
        out.current_streak = streak
        out.best_streak = _run_lengths(weeks, timedelta(weeks=1))
        window_start = max(this_week - timedelta(weeks=11), _monday(created))
        total_weeks = (this_week - window_start).days // 7 + 1
        hit = sum(1 for w in weeks if window_start <= w <= this_week)
        out.completion_rate = round(hit / total_weeks * 100, 1) if total_weeks else 0
    else:
        day_set = set(logged)
        cursor = today if today in day_set else today - timedelta(days=1)
        streak = 0
        while cursor in day_set:
            streak += 1
            cursor -= timedelta(days=1)
        out.current_streak = streak
        out.best_streak = _run_lengths(logged, timedelta(days=1))
        window_start = max(today - timedelta(days=29), min(created, today))
        total_days = (today - window_start).days + 1
        hit = sum(1 for d in logged if window_start <= d <= today)
        out.completion_rate = round(min(hit / total_days, 1) * 100, 1) if total_days else 0

    out.done_today = today in set(logged)
    if habit.frequency == "daily":
        out.done_this_week = any(_monday(today) <= d <= today for d in logged)
    cutoff = today - timedelta(days=120)
    out.recent_logs = [d for d in logged if d >= cutoff]
    return out


@router.get("", response_model=list[HabitOut])
def list_habits(user: CurrentUser, db: DB, clock: ClockDep, include_archived: bool = False):
    stmt = select(Habit).where(Habit.user_id == user.id)
    if not include_archived:
        stmt = stmt.where(Habit.archived.is_(False))
    habits = db.scalars(stmt.order_by(Habit.created_at)).all()
    return [habit_stats(h, clock.today) for h in habits]


@router.get("/overview")
def habits_overview(user: CurrentUser, db: DB, clock: ClockDep, days: int = Query(90, ge=7, le=366)):
    """Aggregated calendar heat-map and today's progress across all active habits."""
    today = clock.today
    habits = db.scalars(
        select(Habit).where(Habit.user_id == user.id, Habit.archived.is_(False))
    ).all()
    start = today - timedelta(days=days - 1)
    counts: dict[str, int] = {}
    for h in habits:
        for log in h.logs:
            if start <= log.date <= today:
                key = log.date.isoformat()
                counts[key] = counts.get(key, 0) + 1
    stats = [habit_stats(h, today) for h in habits]
    daily = [s for s in stats if s.frequency == "daily"]
    weekly = [s for s in stats if s.frequency == "weekly"]
    due = len(daily) + len(weekly)
    done = sum(s.done_today for s in daily) + sum(s.done_this_week for s in weekly)
    return {
        "total": len(habits),
        "due_today": due,
        "done_today": done,
        "progress": round(done / due * 100, 1) if due else 0,
        "best_streak": max((s.best_streak for s in stats), default=0),
        "average_completion": round(sum(s.completion_rate for s in stats) / len(stats), 1)
        if stats
        else 0,
        "calendar": [
            {"date": (start + timedelta(days=i)).isoformat(),
             "count": counts.get((start + timedelta(days=i)).isoformat(), 0)}
            for i in range(days)
        ],
    }


@router.post("", response_model=HabitOut, status_code=201)
def create_habit(data: HabitIn, user: CurrentUser, db: DB, clock: ClockDep):
    habit = Habit(user_id=user.id, **data.model_dump())
    db.add(habit)
    db.flush()
    log_activity(db, user, "created", "habit", f"Started a new habit “{habit.name}”", habit.id)
    db.commit()
    db.refresh(habit)
    return habit_stats(habit, clock.today)


@router.patch("/{habit_id}", response_model=HabitOut)
def update_habit(habit_id: int, data: HabitUpdate, user: CurrentUser, db: DB, clock: ClockDep):
    habit = get_owned(db, Habit, habit_id, user)
    for key, value in data.model_dump(exclude_unset=True).items():
        if value is None and key != "description":
            continue
        setattr(habit, key, value)
    db.commit()
    db.refresh(habit)
    return habit_stats(habit, clock.today)


@router.delete("/{habit_id}", status_code=204)
def delete_habit(habit_id: int, user: CurrentUser, db: DB):
    habit = get_owned(db, Habit, habit_id, user)
    log_activity(db, user, "deleted", "habit", f"Deleted habit “{habit.name}”", habit.id)
    db.delete(habit)
    db.commit()


@router.post("/{habit_id}/toggle", response_model=HabitOut)
def toggle_habit(
    habit_id: int, user: CurrentUser, db: DB, clock: ClockDep, data: HabitToggleIn | None = None
):
    """Mark a habit done for a date (default: the user's today), or undo it if already done."""
    habit = get_owned(db, Habit, habit_id, user)
    day = (data.date if data and data.date else None) or clock.today
    if day > clock.today:
        raise HTTPException(status_code=400, detail="You can't complete a habit in the future")
    existing = db.scalar(select(HabitLog).where(HabitLog.habit_id == habit.id, HabitLog.date == day))
    if existing:
        db.delete(existing)
        log_activity(db, user, "undone", "habit", f"Unchecked “{habit.name}” for {day}", habit.id)
    else:
        db.add(HabitLog(habit_id=habit.id, date=day))
        log_activity(db, user, "completed", "habit", f"Completed habit “{habit.name}”", habit.id)
    db.commit()
    db.refresh(habit)
    return habit_stats(habit, clock.today)


@router.get("/{habit_id}/logs", response_model=list[date])
def habit_logs(
    habit_id: int, user: CurrentUser, db: DB, start: date | None = None, end: date | None = None
):
    habit = get_owned(db, Habit, habit_id, user)
    stmt = select(HabitLog.date).where(HabitLog.habit_id == habit.id)
    if start:
        stmt = stmt.where(HabitLog.date >= start)
    if end:
        stmt = stmt.where(HabitLog.date <= end)
    return db.scalars(stmt.order_by(HabitLog.date)).all()
