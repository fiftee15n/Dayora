"""Create a demo account with realistic sample data.

Usage:  python seed.py            -> demo@dayora.app / demo1234
        python seed.py --reset    -> delete the demo user first
"""

import random
import sys
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.models import (
    ActivityLog,
    Budget,
    ExpenseCategory,
    Habit,
    HabitLog,
    Note,
    Reminder,
    Task,
    TaskCategory,
    Transaction,
    User,
    utcnow,
)
from app.routers.auth import _seed_defaults
from app.security import hash_password

EMAIL, PASSWORD = "demo@dayora.app", "demo1234"


def local(d: date, hour: int) -> datetime:
    """A local wall-clock time on this machine, converted to naive UTC for storage."""
    return datetime.combine(d, time(hour=hour)).astimezone().astimezone(timezone.utc).replace(tzinfo=None)


def main() -> None:
    random.seed(7)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    existing = db.scalar(select(User).where(User.email == EMAIL))
    if existing:
        if "--reset" not in sys.argv:
            print(f"Demo user already exists ({EMAIL}). Use --reset to recreate.")
            return
        db.delete(existing)
        db.commit()

    user = User(name="Sara Ahmed", email=EMAIL, hashed_password=hash_password(PASSWORD), currency="BDT")
    db.add(user)
    db.flush()
    _seed_defaults(db, user)
    db.flush()

    tcats = {c.name: c for c in db.scalars(select(TaskCategory).where(TaskCategory.user_id == user.id))}
    ecats = {c.name: c for c in db.scalars(select(ExpenseCategory).where(ExpenseCategory.user_id == user.id))}
    today = date.today()
    now = utcnow()

    tasks = [
        ("Finish quarterly report", "Work", "high", 0, False),
        ("Team stand-up notes", "Work", "medium", 0, True),
        ("Buy groceries", "Personal", "medium", 0, False),
        ("Revise React hooks chapter", "Study", "low", 1, False),
        ("Book dentist appointment", "Health", "high", -1, False),
        ("Plan weekend trip", "Personal", "low", 3, False),
        ("Submit assignment", "Study", "high", 2, False),
        ("Clean workspace", "Personal", "low", -3, True),
        ("Code review for PR #42", "Work", "medium", -1, True),
        ("Morning run", "Health", "medium", -2, True),
    ]
    for title, cat, prio, offset, done in tasks:
        due = local(today + timedelta(days=offset), random.choice([10, 14, 17]))
        db.add(
            Task(
                user_id=user.id,
                title=title,
                priority=prio,
                category_id=tcats[cat].id,
                due_date=due,
                completed=done,
                completed_at=due - timedelta(hours=1) if done else None,
            )
        )

    spend = [
        ("Food & Groceries", (8, 45), ["Lunch", "Groceries", "Coffee", "Dinner out"]),
        ("Transportation", (3, 25), ["Fuel", "Taxi", "Metro card"]),
        ("Shopping", (15, 90), ["Shoes", "Books", "Headphones"]),
        ("Entertainment", (10, 30), ["Movie night", "Streaming"]),
        ("Bills & Utilities", (40, 120), ["Electricity", "Internet", "Phone bill"]),
        ("Healthcare", (10, 60), ["Pharmacy", "Checkup"]),
        ("Education", (20, 80), ["Online course", "Notebook"]),
    ]
    for d in range(45):
        day = today - timedelta(days=d)
        for _ in range(random.randint(0, 3)):
            cat, (lo, hi), labels = random.choice(spend)
            db.add(
                Transaction(
                    user_id=user.id,
                    type="expense",
                    amount=round(random.uniform(lo, hi), 2),
                    description=random.choice(labels),
                    payment_method=random.choice(["cash", "card", "card", "bank", "wallet"]),
                    date=day,
                    category_id=ecats[cat].id,
                )
            )
    for m in (0, 1):
        first = (today.replace(day=1) - timedelta(days=31 * m)).replace(day=1)
        db.add(Transaction(user_id=user.id, type="income", amount=3200, description="Monthly salary",
                           payment_method="bank", date=first, category_id=ecats["Salary"].id))
    db.add(Transaction(user_id=user.id, type="income", amount=450, description="Logo design project",
                       payment_method="bank", date=today - timedelta(days=4), category_id=ecats["Freelance"].id))
    db.add(Budget(user_id=user.id, month=today.strftime("%Y-%m"), amount=1500))
    db.add(Budget(user_id=user.id, month=today.strftime("%Y-%m"), amount=350,
                  category_id=ecats["Food & Groceries"].id))

    habits = [
        ("Read for 30 minutes", "book-open", "#6366F1", 0.8),
        ("Exercise", "dumbbell", "#10B981", 0.6),
        ("Drink 8 glasses of water", "droplet", "#0EA5E9", 0.9),
        ("Practice programming", "code", "#8B5CF6", 0.7),
        ("Sleep before 11 pm", "moon", "#F59E0B", 0.5),
    ]
    for name, icon, color, p in habits:
        h = Habit(user_id=user.id, name=name, icon=icon, color=color,
                  created_at=now - timedelta(days=60))
        db.add(h)
        db.flush()
        for d in range(1, 60):
            if random.random() < p:
                db.add(HabitLog(habit_id=h.id, date=today - timedelta(days=d)))
        if random.random() < 0.5:
            db.add(HabitLog(habit_id=h.id, date=today))

    reminders = [
        ("Pay electricity bill", 1, 9, "monthly"),
        ("Mom's birthday", 5, 10, "yearly"),
        ("Team meeting", 0, 15, "weekly"),
        ("Car service", 9, 11, "none"),
        ("Water the plants", 0, 18, "daily"),
    ]
    for title, d, hr, rec in reminders:
        db.add(Reminder(user_id=user.id, title=title, recurrence=rec,
                        remind_at=local(today + timedelta(days=d), hr)))

    notes = [
        ("Weekly goals", "1. Finish the report\n2. Run 3 times\n3. Read 2 chapters", "Goals", True),
        ("Book recommendations", "Atomic Habits\nDeep Work\nThe Pragmatic Programmer", "Reading", False),
        ("Trip packing list", "Charger, passport, sunscreen, camera", "Travel", False),
        ("App ideas", "A habit tracker that rewards streaks with plants growing.", "Ideas", True),
    ]
    for title, content, cat, pinned in notes:
        db.add(Note(user_id=user.id, title=title, content=content, category=cat, pinned=pinned))

    # A little activity history so the timeline isn't empty.
    events = [
        ("created", "account", "Welcome to Dayora! Account created.", 30 * 24),
        ("completed", "task", "Completed task “Clean workspace”", 72),
        ("completed", "habit", "Completed habit “Read for 30 minutes”", 50),
        ("created", "transaction", "Recorded expense 42.10 · Groceries", 30),
        ("completed", "task", "Completed task “Code review for PR #42”", 26),
        ("created", "note", "Created note “Weekly goals”", 20),
        ("completed", "habit", "Completed habit “Exercise”", 6),
        ("completed", "task", "Completed task “Team stand-up notes”", 3),
        ("created", "reminder", "Added reminder “Car service”", 1),
    ]
    for action, entity, text, hours_ago in events:
        db.add(ActivityLog(user_id=user.id, action=action, entity_type=entity, description=text,
                           created_at=now - timedelta(hours=hours_ago)))

    db.commit()
    print(f"Seeded demo account: {EMAIL} / {PASSWORD}")


if __name__ == "__main__":
    main()
