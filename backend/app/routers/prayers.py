"""Namaz tracker: mark each of the five daily prayers as prayed (on time) or qaza (made up later)."""

from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import select

from ..deps import DB, ClockDep, CurrentUser
from ..models import PrayerLog

router = APIRouter(prefix="/api/prayers", tags=["prayers"])

PRAYERS = ("fajr", "dhuhr", "asr", "maghrib", "isha")
Prayer = Literal["fajr", "dhuhr", "asr", "maghrib", "isha"]
Status = Literal["prayed", "qaza"]


class PrayerLogOut(BaseModel):
    date: date
    prayer: str
    status: str


class PrayerMarkIn(BaseModel):
    status: Status = "prayed"


class PrayerStats(BaseModel):
    today: date
    today_done: int  # 0..5, prayed or qaza
    streak: int  # consecutive days (ending today or yesterday) with all five marked
    best_streak: int
    month_done: int  # prayers marked this month
    month_possible: int  # 5 x days elapsed this month
    month_on_time: int
    month_qaza: int


def _check_date(d: date, today: date) -> None:
    if d > today:
        raise HTTPException(status_code=400, detail="You can't mark a prayer for a future day")
    if d < today - timedelta(days=366):
        raise HTTPException(status_code=400, detail="That date is too far back")


@router.get("", response_model=list[PrayerLogOut])
def list_prayers(
    user: CurrentUser,
    db: DB,
    clock: ClockDep,
    start: date | None = None,
    end: date | None = None,
):
    """Marked prayers in a date range (default: today)."""
    end = end or clock.today
    start = start or end
    if (end - start).days > 400:
        raise HTTPException(status_code=400, detail="Range can be at most 400 days")
    rows = db.scalars(
        select(PrayerLog)
        .where(PrayerLog.user_id == user.id, PrayerLog.date >= start, PrayerLog.date <= end)
        .order_by(PrayerLog.date)
    ).all()
    return [PrayerLogOut(date=r.date, prayer=r.prayer, status=r.status) for r in rows]


@router.put("/{day}/{prayer}", response_model=PrayerLogOut)
def mark_prayer(day: date, prayer: Prayer, data: PrayerMarkIn, user: CurrentUser, db: DB, clock: ClockDep):
    _check_date(day, clock.today)
    row = db.scalar(select(PrayerLog).where(PrayerLog.user_id == user.id, PrayerLog.date == day, PrayerLog.prayer == prayer))
    if row is None:
        row = PrayerLog(user_id=user.id, date=day, prayer=prayer, status=data.status)
        db.add(row)
    else:
        row.status = data.status
    db.commit()
    return PrayerLogOut(date=row.date, prayer=row.prayer, status=row.status)


@router.delete("/{day}/{prayer}", status_code=204)
def unmark_prayer(day: date, prayer: Prayer, user: CurrentUser, db: DB):
    row = db.scalar(select(PrayerLog).where(PrayerLog.user_id == user.id, PrayerLog.date == day, PrayerLog.prayer == prayer))
    if row is not None:
        db.delete(row)
        db.commit()
    return Response(status_code=204)


@router.get("/stats", response_model=PrayerStats)
def prayer_stats(user: CurrentUser, db: DB, clock: ClockDep, lookback: int = Query(default=365, ge=7, le=730)):
    today = clock.today
    rows = db.scalars(
        select(PrayerLog).where(PrayerLog.user_id == user.id, PrayerLog.date >= today - timedelta(days=lookback))
    ).all()
    per_day: dict[date, int] = {}
    for r in rows:
        per_day[r.date] = per_day.get(r.date, 0) + 1
    full = {d for d, n in per_day.items() if n >= len(PRAYERS)}

    # Current streak: today counts if complete; an incomplete today doesn't break it yet.
    streak = 0
    d = today if today in full else today - timedelta(days=1)
    while d in full:
        streak += 1
        d -= timedelta(days=1)

    best = run = 0
    prev: date | None = None
    for d in sorted(full):
        run = run + 1 if prev is not None and d - prev == timedelta(days=1) else 1
        best = max(best, run)
        prev = d

    month_start = today.replace(day=1)
    month_rows = [r for r in rows if r.date >= month_start]
    return PrayerStats(
        today=today,
        today_done=per_day.get(today, 0),
        streak=streak,
        best_streak=max(best, streak),
        month_done=len(month_rows),
        month_possible=len(PRAYERS) * ((today - month_start).days + 1),
        month_on_time=sum(1 for r in month_rows if r.status == "prayed"),
        month_qaza=sum(1 for r in month_rows if r.status == "qaza"),
    )
