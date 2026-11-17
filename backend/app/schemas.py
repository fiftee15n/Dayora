from datetime import date as Date
from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    PlainSerializer,
    field_validator,
)


def _to_naive_utc(v: datetime) -> datetime:
    """Store everything as naive UTC; naive input is assumed to already be UTC."""
    if v.tzinfo is not None:
        v = v.astimezone(timezone.utc).replace(tzinfo=None)
    return v


def _iso_utc(v: datetime) -> str:
    return v.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


UTCDateTime = Annotated[
    datetime, AfterValidator(_to_naive_utc), PlainSerializer(_iso_utc, return_type=str, when_used="json")
]

Priority = Literal["low", "medium", "high"]
TxType = Literal["income", "expense"]
Frequency = Literal["daily", "weekly"]
Recurrence = Literal["none", "daily", "weekly", "monthly", "yearly"]
HEX = r"^#[0-9A-Fa-f]{6}$"


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Auth / Users ----------
class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def strong_enough(cls, v: str) -> str:
        if not any(c.isalpha() for c in v) or not any(c.isdigit() for c in v):
            raise ValueError("Password must contain letters and numbers")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(ORM):
    id: int
    name: str
    email: EmailStr
    avatar_url: str | None
    currency: str
    created_at: UTCDateTime


class AuthOut(BaseModel):
    user: UserOut
    access_token: str
    token_type: str = "bearer"


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    email: EmailStr | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=8)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=10)
    new_password: str = Field(min_length=8, max_length=128)


# ---------- Categories ----------
class TaskCategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    color: str = Field(default="#6366F1", pattern=HEX)


class TaskCategoryOut(ORM):
    id: int
    name: str
    color: str


class ExpenseCategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    kind: TxType = "expense"
    color: str = Field(default="#8B5CF6", pattern=HEX)
    icon: str = Field(default="circle", max_length=40)


class ExpenseCategoryOut(ORM):
    id: int
    name: str
    kind: str
    color: str
    icon: str


# ---------- Tasks ----------
class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    priority: Priority = "medium"
    due_date: UTCDateTime | None = None
    category_id: int | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    priority: Priority | None = None
    due_date: UTCDateTime | None = None
    category_id: int | None = None
    completed: bool | None = None


class TaskOut(ORM):
    id: int
    title: str
    description: str | None
    priority: str
    due_date: UTCDateTime | None
    completed: bool
    completed_at: UTCDateTime | None
    category_id: int | None
    category: TaskCategoryOut | None
    created_at: UTCDateTime
    updated_at: UTCDateTime


# ---------- Transactions & Budgets ----------
class TransactionIn(BaseModel):
    type: TxType
    amount: float = Field(gt=0, le=1_000_000_000)
    description: str | None = Field(default=None, max_length=255)
    payment_method: str = Field(default="cash", max_length=30)
    date: Date
    category_id: int | None = None


class TransactionUpdate(BaseModel):
    type: TxType | None = None
    amount: float | None = Field(default=None, gt=0, le=1_000_000_000)
    description: str | None = Field(default=None, max_length=255)
    payment_method: str | None = Field(default=None, max_length=30)
    date: Date | None = None
    category_id: int | None = None


class TransactionOut(ORM):
    id: int
    type: str
    amount: float
    description: str | None
    payment_method: str
    date: Date
    category_id: int | None
    category: ExpenseCategoryOut | None
    created_at: UTCDateTime


class BudgetIn(BaseModel):
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    amount: float = Field(gt=0)
    category_id: int | None = None


class BudgetOut(ORM):
    id: int
    month: str
    amount: float
    category_id: int | None
    category: ExpenseCategoryOut | None
    spent: float = 0


# ---------- Habits ----------
class HabitIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    frequency: Frequency = "daily"
    color: str = Field(default="#6366F1", pattern=HEX)
    icon: str = Field(default="sparkles", max_length=40)


class HabitUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    frequency: Frequency | None = None
    color: str | None = Field(default=None, pattern=HEX)
    icon: str | None = Field(default=None, max_length=40)
    archived: bool | None = None


class HabitOut(ORM):
    id: int
    name: str
    description: str | None
    frequency: str
    color: str
    icon: str
    archived: bool
    created_at: UTCDateTime
    done_today: bool = False
    done_this_week: bool = False
    current_streak: int = 0
    best_streak: int = 0
    completion_rate: float = 0  # last 30 days / last 12 weeks, 0-100
    recent_logs: list[Date] = []


class HabitToggleIn(BaseModel):
    date: Date | None = None


# ---------- Reminders ----------
class ReminderIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    remind_at: UTCDateTime
    recurrence: Recurrence = "none"


class ReminderUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    remind_at: UTCDateTime | None = None
    recurrence: Recurrence | None = None
    completed: bool | None = None


class ReminderOut(ORM):
    id: int
    title: str
    description: str | None
    remind_at: UTCDateTime
    recurrence: str
    completed: bool
    completed_at: UTCDateTime | None
    created_at: UTCDateTime


# ---------- Notes ----------
class NoteIn(BaseModel):
    title: str = Field(default="Untitled", max_length=200)
    content: str = Field(default="", max_length=100_000)
    category: str | None = Field(default=None, max_length=60)
    color: str = Field(default="default", max_length=16)
    pinned: bool = False


class NoteUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    content: str | None = Field(default=None, max_length=100_000)
    category: str | None = Field(default=None, max_length=60)
    color: str | None = Field(default=None, max_length=16)
    pinned: bool | None = None
    archived: bool | None = None


class NoteOut(ORM):
    id: int
    title: str
    content: str
    category: str | None
    color: str
    pinned: bool
    archived: bool
    created_at: UTCDateTime
    updated_at: UTCDateTime


# ---------- Activity ----------
class ActivityOut(ORM):
    id: int
    action: str
    entity_type: str
    entity_id: int | None
    description: str
    created_at: UTCDateTime


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int
