"""Loans (money borrowed from / lent to people) and saved income sources.

Loan money flows into the normal Money totals: borrowing is income and repaying it is an
expense; lending is an expense and being repaid is income. Each LoanEntry is linked to the
Transaction it created, so editing or deleting either side keeps the other in step.
"""

from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import select

from ..deps import DB, ClockDep, CurrentUser, get_owned, log_activity
from ..models import ExpenseCategory, IncomeSource, Loan, LoanEntry, Transaction
from ..schemas import (
    IncomeSourceAddIn,
    IncomeSourceIn,
    IncomeSourceOut,
    IncomeSourceUpdate,
    LoanDetailOut,
    LoanEntryIn,
    LoanIn,
    LoanListOut,
    LoanOut,
    LoanTotals,
    LoanUpdate,
    TransactionOut,
)

router = APIRouter(prefix="/api", tags=["loans"])

LOAN_CATEGORY = "Loans"
EPS = 0.005  # money is stored as floats; ignore sub-paisa rounding


def _money(v: float) -> str:
    return f"{v:,.2f}"


def _loan_category(db, user, kind: str) -> ExpenseCategory:
    """The "Loans" income/expense category, created the first time it's needed."""
    cat = db.scalar(
        select(ExpenseCategory).where(
            ExpenseCategory.user_id == user.id, ExpenseCategory.name == LOAN_CATEGORY, ExpenseCategory.kind == kind
        )
    )
    if cat is None:
        cat = ExpenseCategory(user_id=user.id, name=LOAN_CATEGORY, kind=kind, color="#737373", icon="handshake")
        db.add(cat)
        db.flush()
    return cat


def _tx_type(direction: str, kind: str) -> str:
    """Borrowing brings money in; repaying it sends money out. Lending is the reverse."""
    money_in = (direction == "borrowed") == (kind == "principal")
    return "income" if money_in else "expense"


def _tx_description(loan: Loan, kind: str) -> str:
    p = loan.person
    if loan.direction == "borrowed":
        return f"Borrowed from {p}" if kind == "principal" else f"Repaid {p}"
    return f"Lent to {p}" if kind == "principal" else f"{p} paid back"


def _add_entry(db, user, loan: Loan, kind: str, amount: float, on: date, note, record: bool, method: str) -> LoanEntry:
    tx_id = None
    if record:
        tx_type = _tx_type(loan.direction, kind)
        tx = Transaction(
            user_id=user.id,
            type=tx_type,
            amount=amount,
            description=_tx_description(loan, kind) + (f" · {note}" if note else ""),
            payment_method=method,
            date=on,
            category_id=_loan_category(db, user, tx_type).id,
        )
        db.add(tx)
        db.flush()
        tx_id = tx.id
    entry = LoanEntry(kind=kind, amount=amount, date=on, note=note, transaction_id=tx_id)
    db.add(entry)
    loan.entries.append(entry)
    db.flush()
    return entry


def _sums(loan: Loan) -> tuple[float, float]:
    principal = sum(e.amount for e in loan.entries if e.kind == "principal")
    paid = sum(e.amount for e in loan.entries if e.kind == "payment")
    return principal, paid


def _out(loan: Loan, detail: bool = False):
    principal, paid = _sums(loan)
    remaining = max(0.0, round(principal - paid, 2))
    data = dict(
        id=loan.id,
        person=loan.person,
        direction=loan.direction,
        note=loan.note,
        due_date=loan.due_date,
        created_at=loan.created_at,
        principal=round(principal, 2),
        paid=round(paid, 2),
        remaining=remaining,
        settled=remaining <= EPS and principal > 0,
        last_date=max((e.date for e in loan.entries), default=None),
        entries_count=len(loan.entries),
    )
    if detail:
        return LoanDetailOut(**data, entries=loan.entries)
    return LoanOut(**data)


# ---------------------------------------------------------------- loans


@router.get("/loans", response_model=LoanListOut)
def list_loans(
    user: CurrentUser,
    db: DB,
    direction: Literal["borrowed", "lent"] | None = None,
    status: Literal["open", "settled", "all"] = "all",
):
    loans = db.scalars(select(Loan).where(Loan.user_id == user.id)).all()
    all_out = [_out(l) for l in loans]
    totals = LoanTotals(
        i_owe=round(sum(l.remaining for l in all_out if l.direction == "borrowed"), 2),
        owed_to_me=round(sum(l.remaining for l in all_out if l.direction == "lent"), 2),
        open_borrowed=sum(1 for l in all_out if l.direction == "borrowed" and not l.settled),
        open_lent=sum(1 for l in all_out if l.direction == "lent" and not l.settled),
    )
    items = [l for l in all_out if direction is None or l.direction == direction]
    if status == "open":
        items = [l for l in items if not l.settled]
    elif status == "settled":
        items = [l for l in items if l.settled]
    # Open loans first, then by most recent activity.
    items.sort(key=lambda l: (l.settled, -(l.last_date or date.min).toordinal(), -l.id))
    return LoanListOut(items=items, totals=totals)


@router.post("/loans", response_model=LoanDetailOut, status_code=201)
def create_loan(data: LoanIn, user: CurrentUser, db: DB):
    loan = Loan(user_id=user.id, person=data.person.strip(), direction=data.direction, note=data.note, due_date=data.due_date)
    db.add(loan)
    db.flush()
    _add_entry(db, user, loan, "principal", data.amount, data.date, None, data.record_in_money, data.payment_method)
    verb = "Borrowed" if data.direction == "borrowed" else "Lent"
    prep = "from" if data.direction == "borrowed" else "to"
    log_activity(db, user, "created", "loan", f"{verb} {_money(data.amount)} {prep} {loan.person}", loan.id)
    db.commit()
    db.refresh(loan)
    return _out(loan, detail=True)


@router.get("/loans/{loan_id}", response_model=LoanDetailOut)
def get_loan(loan_id: int, user: CurrentUser, db: DB):
    return _out(get_owned(db, Loan, loan_id, user), detail=True)


@router.patch("/loans/{loan_id}", response_model=LoanDetailOut)
def update_loan(loan_id: int, data: LoanUpdate, user: CurrentUser, db: DB):
    loan = get_owned(db, Loan, loan_id, user)
    changes = data.model_dump(exclude_unset=True)
    if "person" in changes and changes["person"]:
        loan.person = changes["person"].strip()
    if "note" in changes:
        loan.note = changes["note"]
    if "due_date" in changes:
        loan.due_date = changes["due_date"]
    db.commit()
    db.refresh(loan)
    return _out(loan, detail=True)


@router.delete("/loans/{loan_id}", status_code=204)
def delete_loan(loan_id: int, user: CurrentUser, db: DB, keep_transactions: bool = False):
    """Delete the loan. Its income/expense records in Money go too, unless keep_transactions."""
    loan = get_owned(db, Loan, loan_id, user)
    tx_ids = [e.transaction_id for e in loan.entries if e.transaction_id]
    log_activity(db, user, "deleted", "loan", f"Deleted loan with {loan.person}", loan.id)
    db.delete(loan)
    db.flush()
    if not keep_transactions:
        for tx_id in tx_ids:
            tx = db.get(Transaction, tx_id)
            if tx is not None and tx.user_id == user.id:
                db.delete(tx)
    db.commit()


@router.post("/loans/{loan_id}/entries", response_model=LoanDetailOut, status_code=201)
def add_loan_entry(loan_id: int, data: LoanEntryIn, user: CurrentUser, db: DB):
    """Record a repayment ("payment") or more money borrowed/lent ("principal")."""
    loan = get_owned(db, Loan, loan_id, user)
    if data.kind == "payment":
        principal, paid = _sums(loan)
        remaining = principal - paid
        if data.amount > remaining + EPS:
            raise HTTPException(
                status_code=400,
                detail=f"That's more than the {_money(max(0.0, remaining))} still owed.",
            )
    _add_entry(db, user, loan, data.kind, data.amount, data.date, data.note, data.record_in_money, data.payment_method)
    if data.kind == "payment":
        text = (
            f"Repaid {_money(data.amount)} to {loan.person}"
            if loan.direction == "borrowed"
            else f"{loan.person} repaid {_money(data.amount)}"
        )
    else:
        text = (
            f"Borrowed {_money(data.amount)} more from {loan.person}"
            if loan.direction == "borrowed"
            else f"Lent {_money(data.amount)} more to {loan.person}"
        )
    log_activity(db, user, "updated", "loan", text, loan.id)
    db.commit()
    db.refresh(loan)
    return _out(loan, detail=True)


@router.delete("/loans/{loan_id}/entries/{entry_id}", response_model=LoanDetailOut)
def delete_loan_entry(loan_id: int, entry_id: int, user: CurrentUser, db: DB):
    loan = get_owned(db, Loan, loan_id, user)
    entry = next((e for e in loan.entries if e.id == entry_id), None)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.kind == "principal" and sum(1 for e in loan.entries if e.kind == "principal") == 1:
        raise HTTPException(status_code=400, detail="This is the original amount. Delete the whole loan instead.")
    tx = db.get(Transaction, entry.transaction_id) if entry.transaction_id else None
    loan.entries.remove(entry)
    db.flush()
    if tx is not None and tx.user_id == user.id:
        db.delete(tx)
    db.commit()
    db.refresh(loan)
    return _out(loan, detail=True)


# ---------------------------------------------------------------- income sources


def _check_income_category(db, user, category_id: int | None) -> None:
    if category_id is not None:
        cat = get_owned(db, ExpenseCategory, category_id, user)
        if cat.kind != "income":
            raise HTTPException(status_code=400, detail="Pick an income category")


def _month_bounds(d: date) -> tuple[date, date]:
    start = d.replace(day=1)
    nxt = date(start.year + (start.month == 12), start.month % 12 + 1, 1)
    return start, nxt


def _this_month_tx(db, src: IncomeSource, today: date) -> Transaction | None:
    start, nxt = _month_bounds(today)
    return db.scalar(
        select(Transaction)
        .where(Transaction.income_source_id == src.id, Transaction.date >= start, Transaction.date < nxt)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .limit(1)
    )


def _previous_month(d: date) -> str:
    first = d.replace(day=1)
    return (first - timedelta(days=1)).strftime("%Y-%m")


def _source_out(db, src: IncomeSource, today: date) -> IncomeSourceOut:
    out = IncomeSourceOut.model_validate(src)
    tx = _this_month_tx(db, src, today)
    if tx is not None:
        out.this_month_transaction_id = tx.id
        out.this_month_amount = tx.amount
        out.this_month_date = tx.date
        out.this_month_for_month = tx.for_month
    return out


@router.get("/income-sources", response_model=list[IncomeSourceOut])
def list_income_sources(
    user: CurrentUser,
    db: DB,
    clock: ClockDep,
    month: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
):
    """Sources with their tick for `month` ("2026-02"; default this month)."""
    on = date(int(month[:4]), int(month[5:]), 1) if month else clock.today
    sources = db.scalars(
        select(IncomeSource).where(IncomeSource.user_id == user.id).order_by(IncomeSource.id)
    ).unique().all()
    return [_source_out(db, s, on) for s in sources]


@router.post("/income-sources", response_model=IncomeSourceOut, status_code=201)
def create_income_source(data: IncomeSourceIn, user: CurrentUser, db: DB, clock: ClockDep):
    _check_income_category(db, user, data.category_id)
    src = IncomeSource(user_id=user.id, **{**data.model_dump(), "name": data.name.strip()})
    db.add(src)
    db.commit()
    db.refresh(src)
    return _source_out(db, src, clock.today)


@router.patch("/income-sources/{source_id}", response_model=IncomeSourceOut)
def update_income_source(source_id: int, data: IncomeSourceUpdate, user: CurrentUser, db: DB, clock: ClockDep):
    src = get_owned(db, IncomeSource, source_id, user)
    changes = data.model_dump(exclude_unset=True)
    if "category_id" in changes:
        _check_income_category(db, user, changes["category_id"])
    for key, value in changes.items():
        if key == "name":
            if value:
                src.name = value.strip()
        elif key == "payment_method":
            if value:
                src.payment_method = value
        else:
            setattr(src, key, value)  # amount / category may be cleared with null
    db.commit()
    db.refresh(src)
    return _source_out(db, src, clock.today)


@router.delete("/income-sources/{source_id}", status_code=204)
def delete_income_source(source_id: int, user: CurrentUser, db: DB):
    db.delete(get_owned(db, IncomeSource, source_id, user))
    db.commit()
    return Response(status_code=204)


@router.post("/income-sources/{source_id}/add", response_model=TransactionOut, status_code=201)
def add_income_from_source(source_id: int, data: IncomeSourceAddIn, user: CurrentUser, db: DB, clock: ClockDep):
    """One tap: record this month's income from a saved source, dated today unless given.

    Each source is added at most once per month (it's a monthly tick in the app).
    """
    src = get_owned(db, IncomeSource, source_id, user)
    amount = data.amount or src.amount
    if not amount:
        raise HTTPException(status_code=400, detail="Enter an amount for this income")
    on = data.date or clock.today
    if _this_month_tx(db, src, on) is not None:
        raise HTTPException(status_code=409, detail=f"{src.name} is already added for {on.strftime('%B')}.")
    # A month chosen in the app wins (null = the month received); otherwise the source's default.
    if "for_month" in data.model_fields_set:
        for_month = data.for_month
    else:
        for_month = _previous_month(on) if src.for_previous_month else None
    if for_month == on.strftime("%Y-%m"):
        for_month = None
    tx = Transaction(
        user_id=user.id,
        type="income",
        amount=amount,
        description=src.name,
        payment_method=src.payment_method,
        date=on,
        category_id=src.category_id,
        income_source_id=src.id,
        for_month=for_month,
    )
    db.add(tx)
    db.flush()
    log_activity(db, user, "created", "transaction", f"Recorded income {_money(amount)} · {src.name}", tx.id)
    db.commit()
    db.refresh(tx)
    return tx
