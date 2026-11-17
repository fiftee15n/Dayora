from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Query
from sqlalchemy import case, select

from ..deps import DB, ClockDep, CurrentUser, get_owned, log_activity
from ..models import Task, TaskCategory, utcnow
from ..schemas import TaskIn, TaskOut, TaskUpdate

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

StatusFilter = Literal["all", "pending", "completed", "overdue", "today", "upcoming"]


def _check_category(db, user, category_id: int | None) -> None:
    if category_id is not None:
        get_owned(db, TaskCategory, category_id, user)


@router.get("", response_model=list[TaskOut])
def list_tasks(
    user: CurrentUser,
    db: DB,
    clock: ClockDep,
    status: StatusFilter = "all",
    category_id: int | None = None,
    priority: Literal["low", "medium", "high"] | None = None,
    q: str | None = Query(default=None, max_length=100),
    due_from: date | None = None,
    due_to: date | None = None,
):
    now = clock.now_utc
    today_start = clock.day_start_utc(clock.today)
    stmt = select(Task).where(Task.user_id == user.id)

    if status == "pending":
        stmt = stmt.where(Task.completed.is_(False))
    elif status == "completed":
        stmt = stmt.where(Task.completed.is_(True))
    elif status == "overdue":
        stmt = stmt.where(Task.completed.is_(False), Task.due_date < now)
    elif status == "today":
        stmt = stmt.where(Task.due_date >= today_start, Task.due_date < today_start + timedelta(days=1))
    elif status == "upcoming":
        stmt = stmt.where(Task.completed.is_(False), Task.due_date >= now)

    if category_id is not None:
        stmt = stmt.where(Task.category_id == category_id)
    if priority:
        stmt = stmt.where(Task.priority == priority)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(Task.title.ilike(like) | Task.description.ilike(like))
    if due_from:
        stmt = stmt.where(Task.due_date >= clock.day_start_utc(due_from))
    if due_to:
        stmt = stmt.where(Task.due_date < clock.day_start_utc(due_to + timedelta(days=1)))

    priority_rank = case({"high": 0, "medium": 1, "low": 2}, value=Task.priority, else_=3)
    stmt = stmt.order_by(
        Task.completed,
        Task.due_date.is_(None),
        Task.due_date,
        priority_rank,
        Task.created_at.desc(),
    ).limit(500)
    return db.scalars(stmt).unique().all()


@router.post("", response_model=TaskOut, status_code=201)
def create_task(data: TaskIn, user: CurrentUser, db: DB):
    _check_category(db, user, data.category_id)
    task = Task(user_id=user.id, **data.model_dump())
    db.add(task)
    db.flush()
    log_activity(db, user, "created", "task", f"Created task “{task.title}”", task.id)
    db.commit()
    db.refresh(task)
    return task


@router.get("/{task_id}", response_model=TaskOut)
def get_task(task_id: int, user: CurrentUser, db: DB):
    return get_owned(db, Task, task_id, user)


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(task_id: int, data: TaskUpdate, user: CurrentUser, db: DB):
    task = get_owned(db, Task, task_id, user)
    changes = data.model_dump(exclude_unset=True)
    if "category_id" in changes:
        _check_category(db, user, changes["category_id"])

    if "completed" in changes and changes["completed"] is not None:
        done = changes.pop("completed")
        if done and not task.completed:
            task.completed, task.completed_at = True, utcnow()
            log_activity(db, user, "completed", "task", f"Completed task “{task.title}”", task.id)
        elif not done and task.completed:
            task.completed, task.completed_at = False, None
            log_activity(db, user, "reopened", "task", f"Reopened task “{task.title}”", task.id)
    else:
        changes.pop("completed", None)

    for key, value in changes.items():
        if key in {"title", "priority"} and value is None:
            continue
        setattr(task, key, value)
    if changes:
        log_activity(db, user, "updated", "task", f"Updated task “{task.title}”", task.id)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int, user: CurrentUser, db: DB):
    task = get_owned(db, Task, task_id, user)
    log_activity(db, user, "deleted", "task", f"Deleted task “{task.title}”", task.id)
    db.delete(task)
    db.commit()
