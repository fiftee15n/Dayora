from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class User(TimestampMixin, Base):
    __tablename__ = "users"
    # Never reuse a deleted user's id on SQLite, so an old token can't map onto a new account.
    __table_args__ = {"sqlite_autoincrement": True}

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    currency: Mapped[str] = mapped_column(String(8), default="BDT")
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    # Google account ID ("sub" claim) once the user has signed in with Google.
    google_sub: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)


class PendingSignup(Base):
    """A sign-up waiting for its email verification code. Becomes a User once verified."""

    __tablename__ = "pending_signups"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    hashed_password: Mapped[str] = mapped_column(String(255))
    code_hash: Mapped[str] = mapped_column(String(128))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    sent_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    attempts: Mapped[int] = mapped_column(Integer, default=0)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used: Mapped[bool] = mapped_column(Boolean, default=False)


class TaskCategory(Base):
    __tablename__ = "task_categories"
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(60))
    color: Mapped[str] = mapped_column(String(16), default="#6366F1")


class Task(TimestampMixin, Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    priority: Mapped[str] = mapped_column(String(10), default="medium")
    due_date: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("task_categories.id", ondelete="SET NULL")
    )

    category: Mapped[TaskCategory | None] = relationship(lazy="joined")


class ExpenseCategory(Base):
    __tablename__ = "expense_categories"
    __table_args__ = (UniqueConstraint("user_id", "name", "kind"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(60))
    kind: Mapped[str] = mapped_column(String(10), default="expense")  # income | expense
    color: Mapped[str] = mapped_column(String(16), default="#8B5CF6")
    icon: Mapped[str] = mapped_column(String(40), default="circle")


class Transaction(TimestampMixin, Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(10))  # income | expense
    amount: Mapped[float] = mapped_column(Float)
    description: Mapped[str | None] = mapped_column(String(255))
    payment_method: Mapped[str] = mapped_column(String(30), default="cash")
    date: Mapped[date] = mapped_column(Date, index=True)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("expense_categories.id", ondelete="SET NULL")
    )
    # Set when added from a saved income source (Quick income), so the app can tick it per month.
    income_source_id: Mapped[int | None] = mapped_column(
        ForeignKey("income_sources.id", ondelete="SET NULL"), index=True
    )

    category: Mapped[ExpenseCategory | None] = relationship(lazy="joined")


class Loan(TimestampMixin, Base):
    """Money borrowed from (direction="borrowed") or lent to (direction="lent") a person.

    The amounts live in LoanEntry rows: "principal" entries add to what is owed (the initial
    amount, or borrowing more later) and "payment" entries pay it back.
    """

    __tablename__ = "loans"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    person: Mapped[str] = mapped_column(String(120))
    direction: Mapped[str] = mapped_column(String(10))  # borrowed | lent
    note: Mapped[str | None] = mapped_column(String(500))
    due_date: Mapped[date | None] = mapped_column(Date)

    entries: Mapped[list["LoanEntry"]] = relationship(
        back_populates="loan",
        cascade="all, delete-orphan",
        order_by=lambda: (LoanEntry.date.desc(), LoanEntry.id.desc()),
        lazy="selectin",
    )


class LoanEntry(Base):
    __tablename__ = "loan_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    loan_id: Mapped[int] = mapped_column(ForeignKey("loans.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(10))  # principal | payment
    amount: Mapped[float] = mapped_column(Float)
    date: Mapped[date] = mapped_column(Date)
    note: Mapped[str | None] = mapped_column(String(255))
    # The matching income/expense in Money (if recorded there). Deleting that transaction
    # removes this entry too, so the loan and the monthly totals never disagree.
    transaction_id: Mapped[int | None] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    loan: Mapped[Loan] = relationship(back_populates="entries")


class IncomeSource(Base):
    """A saved income source (e.g. "Office salary") for one-tap income entries."""

    __tablename__ = "income_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    amount: Mapped[float | None] = mapped_column(Float)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("expense_categories.id", ondelete="SET NULL"))
    payment_method: Mapped[str] = mapped_column(String(30), default="bank")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    category: Mapped[ExpenseCategory | None] = relationship(lazy="joined")


class Budget(Base):
    __tablename__ = "budgets"
    __table_args__ = (UniqueConstraint("user_id", "month", "category_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    month: Mapped[str] = mapped_column(String(7))  # YYYY-MM
    amount: Mapped[float] = mapped_column(Float)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("expense_categories.id", ondelete="CASCADE")
    )

    category: Mapped[ExpenseCategory | None] = relationship(lazy="joined")


class Habit(TimestampMixin, Base):
    __tablename__ = "habits"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    frequency: Mapped[str] = mapped_column(String(10), default="daily")  # daily | weekly
    color: Mapped[str] = mapped_column(String(16), default="#6366F1")
    icon: Mapped[str] = mapped_column(String(40), default="sparkles")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)

    logs: Mapped[list[HabitLog]] = relationship(
        back_populates="habit", cascade="all, delete-orphan", order_by="HabitLog.date"
    )


class HabitLog(Base):
    __tablename__ = "habit_logs"
    __table_args__ = (UniqueConstraint("habit_id", "date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    habit_id: Mapped[int] = mapped_column(ForeignKey("habits.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    habit: Mapped[Habit] = relationship(back_populates="logs")


class Reminder(TimestampMixin, Base):
    __tablename__ = "reminders"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    remind_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    recurrence: Mapped[str] = mapped_column(String(10), default="none")
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)


class Note(TimestampMixin, Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200), default="Untitled")
    content: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str | None] = mapped_column(String(60))
    color: Mapped[str] = mapped_column(String(16), default="default")
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    action: Mapped[str] = mapped_column(String(40))  # created | updated | completed | deleted ...
    entity_type: Mapped[str] = mapped_column(String(30))  # task | transaction | habit | ...
    entity_id: Mapped[int | None] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
