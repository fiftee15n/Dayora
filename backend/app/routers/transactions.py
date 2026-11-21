from calendar import monthrange
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select

from ..deps import DB, ClockDep, CurrentUser, get_owned, log_activity
from ..models import Budget, ExpenseCategory, Loan, LoanEntry, SavingsEntry, Transaction
from ..schemas import (
    BudgetIn,
    BudgetOut,
    Page,
    TransactionIn,
    TransactionOut,
    TransactionUpdate,
)

router = APIRouter(prefix="/api", tags=["finance"])


def _check_category(db, user, category_id: int | None) -> None:
    if category_id is not None:
        get_owned(db, ExpenseCategory, category_id, user)


def _month_range(month: str) -> tuple[date, date]:
    y, m = map(int, month.split("-"))
    return date(y, m, 1), date(y, m, monthrange(y, m)[1])


def _money(v: float) -> str:
    return f"{v:,.2f}"


# ---------------- Transactions ----------------
@router.get("/transactions", response_model=Page[TransactionOut])
def list_transactions(
    user: CurrentUser,
    db: DB,
    type: Literal["income", "expense"] | None = None,
    category_id: int | None = None,
    start: date | None = None,
    end: date | None = None,
    q: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
):
    stmt = select(Transaction).where(Transaction.user_id == user.id)
    if type:
        stmt = stmt.where(Transaction.type == type)
    if category_id is not None:
        stmt = stmt.where(Transaction.category_id == category_id)
    if start:
        stmt = stmt.where(Transaction.date >= start)
    if end:
        stmt = stmt.where(Transaction.date <= end)
    if q:
        stmt = stmt.where(Transaction.description.ilike(f"%{q.strip()}%"))

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(
        stmt.order_by(Transaction.date.desc(), Transaction.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).unique().all()
    return Page[TransactionOut](items=items, total=total, page=page, page_size=page_size)


def _fix_for_month(tx: Transaction) -> None:
    """for_month is for income only, and only when it differs from the month received."""
    if tx.type != "income" or tx.for_month == tx.date.strftime("%Y-%m"):
        tx.for_month = None


@router.post("/transactions", response_model=TransactionOut, status_code=201)
def create_transaction(data: TransactionIn, user: CurrentUser, db: DB):
    _check_category(db, user, data.category_id)
    tx = Transaction(user_id=user.id, **data.model_dump())
    _fix_for_month(tx)
    db.add(tx)
    db.flush()
    label = tx.description or tx.type.title()
    log_activity(
        db, user, "created", "transaction", f"Recorded {tx.type} {_money(tx.amount)} · {label}", tx.id
    )
    db.commit()
    db.refresh(tx)
    return tx


@router.patch("/transactions/{tx_id}", response_model=TransactionOut)
def update_transaction(tx_id: int, data: TransactionUpdate, user: CurrentUser, db: DB):
    tx = get_owned(db, Transaction, tx_id, user)
    changes = data.model_dump(exclude_unset=True)
    # A loan or savings entry recorded through this transaction stays in step with it.
    entry = db.scalar(select(LoanEntry).where(LoanEntry.transaction_id == tx.id)) or db.scalar(
        select(SavingsEntry).where(SavingsEntry.transaction_id == tx.id)
    )
    if entry is not None and changes.get("type") not in (None, tx.type):
        what = "a loan" if isinstance(entry, LoanEntry) else "a savings goal"
        raise HTTPException(status_code=400, detail=f"This is part of {what}, so it can't switch between income and expense.")
    if "category_id" in changes:
        _check_category(db, user, changes["category_id"])
    for key, value in changes.items():
        if value is None and key in {"type", "amount", "date", "payment_method"}:
            continue
        setattr(tx, key, value)
    _fix_for_month(tx)
    if entry is not None:
        # Keep the loan / savings goal in step with its Money record.
        entry.amount = tx.amount
        entry.date = tx.date
    log_activity(db, user, "updated", "transaction", f"Updated {tx.type} {_money(tx.amount)}", tx.id)
    db.commit()
    db.refresh(tx)
    return tx


@router.delete("/transactions/{tx_id}", status_code=204)
def delete_transaction(tx_id: int, user: CurrentUser, db: DB):
    tx = get_owned(db, Transaction, tx_id, user)
    log_activity(db, user, "deleted", "transaction", f"Deleted {tx.type} {_money(tx.amount)}", tx.id)
    # A loan entry recorded through this transaction goes with it; a loan left with no
    # entries at all is removed too.
    entry = db.scalar(select(LoanEntry).where(LoanEntry.transaction_id == tx.id))
    if entry is not None:
        loan = db.get(Loan, entry.loan_id)
        loan.entries.remove(entry)
        if not loan.entries:
            db.delete(loan)
    # Same for savings: the money goes back to the balance and leaves the goal.
    saving = db.scalar(select(SavingsEntry).where(SavingsEntry.transaction_id == tx.id))
    if saving is not None:
        db.delete(saving)
    db.delete(tx)
    db.commit()


@router.get("/transactions/summary")
def transactions_summary(
    user: CurrentUser,
    db: DB,
    clock: ClockDep,
    start: date | None = None,
    end: date | None = None,
):
    """Totals, per-category breakdown and a daily series for charts. Defaults to this month."""
    today = clock.today
    if not start:
        start = today.replace(day=1)
    if not end:
        end = _month_range(start.strftime("%Y-%m"))[1]
    if end < start:
        raise HTTPException(status_code=400, detail="end must be after start")
    if (end - start).days > 366:
        raise HTTPException(status_code=400, detail="Range can be at most one year")

    base = select(Transaction).where(
        Transaction.user_id == user.id, Transaction.date >= start, Transaction.date <= end
    )
    rows = db.scalars(base).unique().all()

    income = sum(t.amount for t in rows if t.type == "income")
    expense = sum(t.amount for t in rows if t.type == "expense")

    by_cat: dict[int | None, dict] = {}
    for t in rows:
        if t.type != "expense":
            continue
        key = t.category_id
        if key not in by_cat:
            by_cat[key] = {
                "category_id": key,
                "name": t.category.name if t.category else "Uncategorized",
                "color": t.category.color if t.category else "#94A3B8",
                "total": 0.0,
            }
        by_cat[key]["total"] += t.amount
    categories = sorted(by_cat.values(), key=lambda c: c["total"], reverse=True)
    for c in categories:
        c["total"] = round(c["total"], 2)
        c["percent"] = round(c["total"] / expense * 100, 1) if expense else 0

    days = {}
    d = start
    while d <= end:
        days[d] = {"date": d.isoformat(), "income": 0.0, "expense": 0.0}
        d += timedelta(days=1)
    for t in rows:
        days[t.date][t.type] += t.amount
    daily = [{**v, "income": round(v["income"], 2), "expense": round(v["expense"], 2)} for v in days.values()]

    payment = {}
    for t in rows:
        if t.type == "expense":
            payment[t.payment_method] = round(payment.get(t.payment_method, 0) + t.amount, 2)

    # Income received in this period but earned for another month ("৳50,000 of it is for October").
    other: dict[str, float] = {}
    for t in rows:
        if t.type == "income" and t.for_month:
            other[t.for_month] = round(other.get(t.for_month, 0) + t.amount, 2)
    income_for_other_months = [{"month": m, "amount": a} for m, a in sorted(other.items())]

    # Income earned for a month in this period but received in another one (October shows
    # "October's salary, received 15 Nov"). Shown for information; it isn't in these totals.
    months = sorted({start.strftime("%Y-%m"), end.strftime("%Y-%m")} | {d.strftime("%Y-%m") for d in days})
    elsewhere = db.scalars(
        select(Transaction)
        .where(
            Transaction.user_id == user.id,
            Transaction.type == "income",
            Transaction.for_month.in_(months),
            (Transaction.date < start) | (Transaction.date > end),
        )
        .order_by(Transaction.date, Transaction.id)
    ).unique().all()
    received_elsewhere = [TransactionOut.model_validate(t).model_dump(mode="json") for t in elsewhere]

    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "income": round(income, 2),
        "expense": round(expense, 2),
        "balance": round(income - expense, 2),
        "count": len(rows),
        "by_category": categories,
        "top_category": categories[0] if categories else None,
        "daily": daily,
        "by_payment_method": payment,
        "income_for_other_months": income_for_other_months,
        "received_elsewhere": received_elsewhere,
        "received_elsewhere_total": round(sum(t.amount for t in elsewhere), 2),
    }


# ---------------- Budgets ----------------
def _budget_out(db, user, b: Budget) -> BudgetOut:
    start, end = _month_range(b.month)
    q = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
        Transaction.user_id == user.id,
        Transaction.type == "expense",
        Transaction.date >= start,
        Transaction.date <= end,
    )
    if b.category_id is not None:
        q = q.where(Transaction.category_id == b.category_id)
    out = BudgetOut.model_validate(b)
    out.spent = round(float(db.scalar(q) or 0), 2)
    return out


@router.get("/budgets", response_model=list[BudgetOut])
def list_budgets(
    user: CurrentUser,
    db: DB,
    clock: ClockDep,
    month: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
):
    month = month or clock.today.strftime("%Y-%m")
    budgets = db.scalars(
        select(Budget).where(Budget.user_id == user.id, Budget.month == month)
    ).unique().all()
    # Overall budget first, then category budgets.
    budgets = sorted(budgets, key=lambda b: (b.category_id is not None, b.id))
    return [_budget_out(db, user, b) for b in budgets]


@router.put("/budgets", response_model=BudgetOut)
def upsert_budget(data: BudgetIn, user: CurrentUser, db: DB):
    """Create or replace the budget for (month, category). category_id=null = overall budget."""
    _check_category(db, user, data.category_id)
    stmt = select(Budget).where(Budget.user_id == user.id, Budget.month == data.month)
    stmt = stmt.where(
        Budget.category_id.is_(None)
        if data.category_id is None
        else Budget.category_id == data.category_id
    )
    b = db.scalar(stmt)
    if b:
        b.amount = data.amount
    else:
        b = Budget(user_id=user.id, **data.model_dump())
        db.add(b)
    log_activity(db, user, "updated", "budget", f"Set {data.month} budget to {_money(data.amount)}")
    db.commit()
    db.refresh(b)
    return _budget_out(db, user, b)


@router.delete("/budgets/{budget_id}", status_code=204)
def delete_budget(budget_id: int, user: CurrentUser, db: DB):
    db.delete(get_owned(db, Budget, budget_id, user))
    db.commit()
