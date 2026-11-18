from typing import Literal

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from ..deps import DB, CurrentUser, get_owned
from ..models import ExpenseCategory, TaskCategory
from ..schemas import (
    ExpenseCategoryIn,
    ExpenseCategoryOut,
    ExpenseCategoryUpdate,
    TaskCategoryIn,
    TaskCategoryOut,
    TaskCategoryUpdate,
)

router = APIRouter(prefix="/api/categories", tags=["categories"])


def _apply(obj, changes: dict) -> None:
    for key, value in changes.items():
        if value is not None:
            setattr(obj, key, value.strip() if key == "name" else value)


def _commit_unique(db):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A category with that name already exists")


@router.get("/tasks", response_model=list[TaskCategoryOut])
def list_task_categories(user: CurrentUser, db: DB):
    return db.scalars(
        select(TaskCategory).where(TaskCategory.user_id == user.id).order_by(TaskCategory.name)
    ).all()


@router.post("/tasks", response_model=TaskCategoryOut, status_code=201)
def create_task_category(data: TaskCategoryIn, user: CurrentUser, db: DB):
    cat = TaskCategory(user_id=user.id, **(data.model_dump() | {"name": data.name.strip()}))
    db.add(cat)
    _commit_unique(db)
    return cat


@router.patch("/tasks/{cat_id}", response_model=TaskCategoryOut)
def update_task_category(cat_id: int, data: TaskCategoryUpdate, user: CurrentUser, db: DB):
    cat = get_owned(db, TaskCategory, cat_id, user)
    _apply(cat, data.model_dump(exclude_unset=True))
    _commit_unique(db)
    return cat


@router.delete("/tasks/{cat_id}", status_code=204)
def delete_task_category(cat_id: int, user: CurrentUser, db: DB):
    db.delete(get_owned(db, TaskCategory, cat_id, user))
    db.commit()


@router.get("/expenses", response_model=list[ExpenseCategoryOut])
def list_expense_categories(
    user: CurrentUser, db: DB, kind: Literal["income", "expense"] | None = None
):
    q = select(ExpenseCategory).where(ExpenseCategory.user_id == user.id)
    if kind:
        q = q.where(ExpenseCategory.kind == kind)
    return db.scalars(q.order_by(ExpenseCategory.kind, ExpenseCategory.name)).all()


@router.post("/expenses", response_model=ExpenseCategoryOut, status_code=201)
def create_expense_category(data: ExpenseCategoryIn, user: CurrentUser, db: DB):
    cat = ExpenseCategory(user_id=user.id, **(data.model_dump() | {"name": data.name.strip()}))
    db.add(cat)
    _commit_unique(db)
    return cat


@router.patch("/expenses/{cat_id}", response_model=ExpenseCategoryOut)
def update_expense_category(cat_id: int, data: ExpenseCategoryUpdate, user: CurrentUser, db: DB):
    cat = get_owned(db, ExpenseCategory, cat_id, user)
    _apply(cat, data.model_dump(exclude_unset=True))
    _commit_unique(db)
    return cat


@router.delete("/expenses/{cat_id}", status_code=204)
def delete_expense_category(cat_id: int, user: CurrentUser, db: DB):
    db.delete(get_owned(db, ExpenseCategory, cat_id, user))
    db.commit()
