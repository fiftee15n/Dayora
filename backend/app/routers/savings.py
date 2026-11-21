"""Savings goals: put money aside for a purpose and track it against an approximate target.

Completing a goal records what was actually spent on it: anything left over goes back to the
balance (income), and anything spent beyond the savings is recorded as a further expense.

Putting money in is recorded as an expense in a "Savings" category (it leaves your spendable
balance); taking it out is income. Each entry is linked to its transaction, so editing or
deleting either side keeps the other in step (see routers/transactions.py).
"""

from datetime import date

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from ..deps import DB, ClockDep, CurrentUser, get_owned, log_activity
from ..models import ExpenseCategory, SavingsEntry, SavingsGoal, Transaction
from ..schemas import (
    SavingsCompleteIn,
    SavingsEntryIn,
    SavingsGoalDetailOut,
    SavingsGoalIn,
    SavingsGoalOut,
    SavingsGoalUpdate,
    SavingsListOut,
    SavingsTotals,
)

router = APIRouter(prefix="/api/savings", tags=["savings"])

CATEGORY = "Savings"
EPS = 0.005


def _money(v: float) -> str:
    return f"{v:,.2f}"


def _category(db, user, kind: str) -> ExpenseCategory:
    cat = db.scalar(
        select(ExpenseCategory).where(
            ExpenseCategory.user_id == user.id, ExpenseCategory.name == CATEGORY, ExpenseCategory.kind == kind
        )
    )
    if cat is None:
        cat = ExpenseCategory(user_id=user.id, name=CATEGORY, kind=kind, color="#0A0A0A", icon="piggy-bank")
        db.add(cat)
        db.flush()
    return cat


def _record(db, user, goal: SavingsGoal, kind: str, amount: float, day: date, note: str | None,
            label: str, in_money: bool, method: str) -> SavingsEntry:
    """Add an entry to the goal and (optionally) its expense/income record in Money."""
    tx_id = None
    if in_money:
        tx_type = "expense" if kind == "deposit" else "income"
        tx = Transaction(
            user_id=user.id,
            type=tx_type,
            amount=amount,
            description=label + (f" · {note}" if note else ""),
            payment_method=method,
            date=day,
            category_id=_category(db, user, tx_type).id,
        )
        db.add(tx)
        db.flush()
        tx_id = tx.id
    entry = SavingsEntry(kind=kind, amount=amount, date=day, note=note, transaction_id=tx_id)
    db.add(entry)
    goal.entries.append(entry)
    return entry


def _open(goal: SavingsGoal) -> None:
    if goal.completed_on:
        raise HTTPException(status_code=400, detail="This goal is completed.")


def _saved(goal: SavingsGoal) -> float:
    return round(sum(e.amount if e.kind == "deposit" else -e.amount for e in goal.entries), 2)


def _out(goal: SavingsGoal, today: date, detail: bool = False):
    saved = _saved(goal)
    month_start = today.replace(day=1)
    this_month = round(
        sum((e.amount if e.kind == "deposit" else -e.amount) for e in goal.entries if e.date >= month_start), 2
    )
    target = goal.target
    data = dict(
        id=goal.id,
        name=goal.name,
        target=target,
        note=goal.note,
        created_at=goal.created_at,
        saved=saved,
        remaining=round(max(0.0, target - saved), 2) if target else None,
        progress=round(min(100.0, saved / target * 100), 1) if target else None,
        reached=bool(goal.completed_on) or (bool(target) and saved + EPS >= target),
        this_month=this_month,
        last_date=max((e.date for e in goal.entries), default=None),
        entries_count=len(goal.entries),
        completed_on=goal.completed_on,
        spent=goal.spent,
        leftover=goal.leftover,
    )
    return SavingsGoalDetailOut(**data, entries=goal.entries) if detail else SavingsGoalOut(**data)


@router.get("", response_model=SavingsListOut)
def list_goals(user: CurrentUser, db: DB, clock: ClockDep):
    goals = db.scalars(select(SavingsGoal).where(SavingsGoal.user_id == user.id).order_by(SavingsGoal.id)).all()
    items = [_out(g, clock.today) for g in goals]
    # Goals in progress first, then reached ones, then completed ones (newest first).
    items.sort(key=lambda g: (g.completed_on is not None, g.reached, -(g.completed_on or date.min).toordinal(), g.id))
    # Completed goals' money has been spent, so totals count only goals still being saved for.
    active = [g for g in items if g.completed_on is None]
    totals = SavingsTotals(
        saved=round(sum(g.saved for g in active), 2),
        target=round(sum(g.target or 0 for g in active), 2),
        this_month=round(sum(g.this_month for g in active), 2),
    )
    return SavingsListOut(items=items, totals=totals)


@router.post("", response_model=SavingsGoalDetailOut, status_code=201)
def create_goal(data: SavingsGoalIn, user: CurrentUser, db: DB, clock: ClockDep):
    goal = SavingsGoal(user_id=user.id, name=data.name.strip(), target=data.target, note=data.note)
    db.add(goal)
    db.flush()
    log_activity(db, user, "created", "savings", f"New savings goal: {goal.name}", goal.id)
    db.commit()
    db.refresh(goal)
    return _out(goal, clock.today, detail=True)


@router.get("/{goal_id}", response_model=SavingsGoalDetailOut)
def get_goal(goal_id: int, user: CurrentUser, db: DB, clock: ClockDep):
    return _out(get_owned(db, SavingsGoal, goal_id, user), clock.today, detail=True)


@router.patch("/{goal_id}", response_model=SavingsGoalDetailOut)
def update_goal(goal_id: int, data: SavingsGoalUpdate, user: CurrentUser, db: DB, clock: ClockDep):
    goal = get_owned(db, SavingsGoal, goal_id, user)
    changes = data.model_dump(exclude_unset=True)
    if changes.get("name"):
        goal.name = changes["name"].strip()
    if "target" in changes:
        goal.target = changes["target"]  # may be cleared with null
    if "note" in changes:
        goal.note = changes["note"]
    db.commit()
    db.refresh(goal)
    return _out(goal, clock.today, detail=True)


@router.delete("/{goal_id}", status_code=204)
def delete_goal(goal_id: int, user: CurrentUser, db: DB, keep_transactions: bool = False):
    """Delete the goal. Its records in Money go too (the money returns to your balance), unless
    keep_transactions or the goal is completed (that money was really spent)."""
    goal = get_owned(db, SavingsGoal, goal_id, user)
    keep_transactions = keep_transactions or goal.completed_on is not None
    tx_ids = [e.transaction_id for e in goal.entries if e.transaction_id]
    log_activity(db, user, "deleted", "savings", f"Deleted savings goal {goal.name}", goal.id)
    db.delete(goal)
    db.flush()
    if not keep_transactions:
        for tx_id in tx_ids:
            tx = db.get(Transaction, tx_id)
            if tx is not None and tx.user_id == user.id:
                db.delete(tx)
    db.commit()


@router.post("/{goal_id}/entries", response_model=SavingsGoalDetailOut, status_code=201)
def add_entry(goal_id: int, data: SavingsEntryIn, user: CurrentUser, db: DB, clock: ClockDep):
    """Put money in ("deposit") or take some out ("withdraw")."""
    goal = get_owned(db, SavingsGoal, goal_id, user)
    _open(goal)
    if data.kind == "withdraw" and data.amount > _saved(goal) + EPS:
        raise HTTPException(status_code=400, detail=f"Only {_money(max(0.0, _saved(goal)))} is saved in this goal.")
    label = f"Saved for {goal.name}" if data.kind == "deposit" else f"Took out of {goal.name} savings"
    _record(db, user, goal, data.kind, data.amount, data.date, data.note, label, data.record_in_money, data.payment_method)
    verb = "Saved" if data.kind == "deposit" else "Took out"
    prep = "for" if data.kind == "deposit" else "of"
    log_activity(db, user, "updated", "savings", f"{verb} {_money(data.amount)} {prep} {goal.name}", goal.id)
    db.commit()
    db.refresh(goal)
    return _out(goal, clock.today, detail=True)


@router.delete("/{goal_id}/entries/{entry_id}", response_model=SavingsGoalDetailOut)
def delete_entry(goal_id: int, entry_id: int, user: CurrentUser, db: DB, clock: ClockDep):
    goal = get_owned(db, SavingsGoal, goal_id, user)
    _open(goal)
    entry = next((e for e in goal.entries if e.id == entry_id), None)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.kind == "deposit" and _saved(goal) - entry.amount < -EPS:
        raise HTTPException(status_code=400, detail="Delete the withdrawals after it first.")
    tx = db.get(Transaction, entry.transaction_id) if entry.transaction_id else None
    goal.entries.remove(entry)
    db.flush()
    if tx is not None and tx.user_id == user.id:
        db.delete(tx)
    db.commit()
    db.refresh(goal)
    return _out(goal, clock.today, detail=True)


CLOSING_NOTES = ("Left over", "Spent beyond savings")


@router.post("/{goal_id}/complete", response_model=SavingsGoalDetailOut)
def complete_goal(goal_id: int, data: SavingsCompleteIn, user: CurrentUser, db: DB, clock: ClockDep):
    """Finish a goal with what was actually spent on it. Saved 5,000 and spent 4,000: the
    1,000 left over goes back to the balance. Spent 6,000: the extra 1,000 is an expense."""
    goal = get_owned(db, SavingsGoal, goal_id, user)
    _open(goal)
    saved = max(0.0, _saved(goal))
    leftover = round(saved - data.spent, 2)
    if leftover > EPS:
        _record(db, user, goal, "withdraw", leftover, data.date, CLOSING_NOTES[0],
                f"Left over from {goal.name} savings", data.record_in_money, data.payment_method)
    elif leftover < -EPS:
        _record(db, user, goal, "deposit", -leftover, data.date, CLOSING_NOTES[1],
                f"Spent on {goal.name}", data.record_in_money, data.payment_method)
    goal.completed_on = data.date
    goal.spent = round(data.spent, 2)
    goal.leftover = leftover
    log_activity(db, user, "completed", "savings", f"Completed {goal.name}: spent {_money(data.spent)}", goal.id)
    db.commit()
    db.refresh(goal)
    return _out(goal, clock.today, detail=True)


@router.post("/{goal_id}/reopen", response_model=SavingsGoalDetailOut)
def reopen_goal(goal_id: int, user: CurrentUser, db: DB, clock: ClockDep):
    """Undo completing: the left-over / extra entry it added (and its Money record) is removed."""
    goal = get_owned(db, SavingsGoal, goal_id, user)
    if not goal.completed_on:
        raise HTTPException(status_code=400, detail="This goal isn't completed.")
    if abs(goal.leftover or 0) > EPS:
        closing = next((e for e in goal.entries if e.note in CLOSING_NOTES and e.date == goal.completed_on), None)
        if closing is not None:
            tx = db.get(Transaction, closing.transaction_id) if closing.transaction_id else None
            goal.entries.remove(closing)
            db.flush()
            if tx is not None and tx.user_id == user.id:
                db.delete(tx)
    goal.completed_on = goal.spent = goal.leftover = None
    db.commit()
    db.refresh(goal)
    return _out(goal, clock.today, detail=True)
