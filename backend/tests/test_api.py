from datetime import date, datetime, timedelta, timezone

from tests.conftest import register


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


# ---------------- Auth ----------------
def test_register_sets_httponly_cookie_and_me_works(client):
    r = client.post(
        "/api/auth/register", json={"name": "Ali", "email": "Ali@Example.com", "password": "abc12345"}
    )
    assert r.status_code == 201
    assert "httponly" in r.headers["set-cookie"].lower()
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "ali@example.com"


def test_duplicate_email_and_bad_login(client):
    register(client)
    r = client.post(
        "/api/auth/register", json={"name": "X", "email": "sara@example.com", "password": "secret123"}
    )
    assert r.status_code == 409
    r = client.post("/api/auth/login", json={"email": "sara@example.com", "password": "wrong"})
    assert r.status_code == 401


def test_weak_password_rejected(client):
    r = client.post("/api/auth/register", json={"name": "A", "email": "a@b.co", "password": "abcdefgh"})
    assert r.status_code == 422


def test_unauthenticated_requests_blocked(client):
    assert client.get("/api/tasks").status_code == 401
    client.headers["Authorization"] = "Bearer not-a-token"
    assert client.get("/api/tasks").status_code == 401


def test_logout_clears_cookie(client):
    register(client)
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401


def test_password_reset_flow(client):
    register(client)
    r = client.post("/api/auth/forgot-password", json={"email": "sara@example.com"})
    code = r.json()["dev_reset_code"]
    assert len(code) == 6 and code.isdigit()
    body = {"email": "sara@example.com", "code": code}
    r = client.post("/api/auth/reset-password", json={**body, "new_password": "newpass99"})
    assert r.status_code == 200
    # old sessions invalidated, code single-use, new password works
    assert client.get("/api/auth/me").status_code == 401
    assert client.post("/api/auth/reset-password", json={**body, "new_password": "another99"}).status_code == 400
    assert client.post(
        "/api/auth/login", json={"email": "sara@example.com", "password": "newpass99"}
    ).status_code == 200


def test_users_cannot_access_each_others_data(client):
    a = register(client, "a@example.com", "A")["access_token"]
    b = register(client, "b@example.com", "B")["access_token"]
    client.cookies.clear()
    task = client.post(
        "/api/tasks", json={"title": "Private"}, headers={"Authorization": f"Bearer {a}"}
    ).json()
    hb = {"Authorization": f"Bearer {b}"}
    assert client.get(f"/api/tasks/{task['id']}", headers=hb).status_code == 404
    assert client.patch(f"/api/tasks/{task['id']}", json={"title": "x"}, headers=hb).status_code == 404
    assert client.delete(f"/api/tasks/{task['id']}", headers=hb).status_code == 404
    assert client.get("/api/tasks", headers=hb).json() == []


def test_profile_update_and_avatar(auth):
    r = auth.patch("/api/users/me", json={"name": "Sara K", "currency": "pkr"})
    assert r.json()["name"] == "Sara K" and r.json()["currency"] == "PKR"
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
    r = auth.post("/api/users/me/avatar", files={"file": ("a.png", png, "image/png")})
    assert r.status_code == 200 and r.json()["avatar_url"].startswith("/uploads/avatars/")
    r = auth.post("/api/users/me/avatar", files={"file": ("a.png", b"not an image", "image/png")})
    assert r.status_code == 415


# ---------------- Tasks ----------------
def test_task_crud_filters_and_completion(auth):
    cats = auth.get("/api/categories/tasks").json()
    assert {c["name"] for c in cats} >= {"Work", "Personal"}
    work = next(c for c in cats if c["name"] == "Work")
    now = datetime.now(timezone.utc)

    t1 = auth.post(
        "/api/tasks",
        json={"title": "Report", "priority": "high", "category_id": work["id"], "due_date": iso(now + timedelta(hours=2))},
    ).json()
    auth.post("/api/tasks", json={"title": "Old thing", "due_date": iso(now - timedelta(days=2))})
    auth.post("/api/tasks", json={"title": "Someday"})

    assert t1["due_date"].endswith("Z")
    assert t1["category"]["name"] == "Work"
    assert len(auth.get("/api/tasks?status=overdue").json()) == 1
    assert len(auth.get(f"/api/tasks?category_id={work['id']}").json()) == 1
    assert len(auth.get("/api/tasks?q=port").json()) == 1

    done = auth.patch(f"/api/tasks/{t1['id']}", json={"completed": True}).json()
    assert done["completed"] and done["completed_at"]
    assert len(auth.get("/api/tasks?status=completed").json()) == 1
    assert len(auth.get("/api/tasks?status=pending").json()) == 2

    # clear due date with explicit null
    cleared = auth.patch(f"/api/tasks/{t1['id']}", json={"due_date": None}).json()
    assert cleared["due_date"] is None
    assert auth.delete(f"/api/tasks/{t1['id']}").status_code == 204


def test_task_rejects_foreign_category(client):
    a = register(client, "a@example.com")["access_token"]
    b = register(client, "b@example.com")["access_token"]
    client.cookies.clear()
    b_cat = client.get("/api/categories/tasks", headers={"Authorization": f"Bearer {b}"}).json()[0]
    r = client.post(
        "/api/tasks",
        json={"title": "x", "category_id": b_cat["id"]},
        headers={"Authorization": f"Bearer {a}"},
    )
    assert r.status_code == 404


# ---------------- Finance ----------------
def test_transactions_summary_and_budget(auth):
    cats = auth.get("/api/categories/expenses?kind=expense").json()
    food = next(c for c in cats if c["name"].startswith("Food"))
    today = date.today()
    auth.post("/api/transactions", json={"type": "income", "amount": 1000, "date": today.isoformat()})
    auth.post(
        "/api/transactions",
        json={"type": "expense", "amount": 120.5, "date": today.isoformat(), "category_id": food["id"], "payment_method": "card"},
    )
    auth.post("/api/transactions", json={"type": "expense", "amount": 30, "date": today.isoformat()})

    page = auth.get("/api/transactions").json()
    assert page["total"] == 3
    s = auth.get("/api/transactions/summary").json()
    assert s["income"] == 1000 and s["expense"] == 150.5 and s["balance"] == 849.5
    assert s["top_category"]["name"] == food["name"]
    assert s["by_payment_method"]["card"] == 120.5

    month = today.strftime("%Y-%m")
    b = auth.put("/api/budgets", json={"month": month, "amount": 500}).json()
    assert b["spent"] == 150.5
    b2 = auth.put("/api/budgets", json={"month": month, "amount": 600}).json()
    assert b2["id"] == b["id"] and b2["amount"] == 600
    cb = auth.put("/api/budgets", json={"month": month, "amount": 200, "category_id": food["id"]}).json()
    assert cb["spent"] == 120.5
    assert len(auth.get(f"/api/budgets?month={month}").json()) == 2

    assert auth.post("/api/transactions", json={"type": "expense", "amount": -5, "date": today.isoformat()}).status_code == 422


# ---------------- Habits ----------------
def test_habit_toggle_streaks(auth):
    h = auth.post("/api/habits", json={"name": "Read 30 min"}).json()
    today = date.today()
    for i in range(3):
        auth.post(f"/api/habits/{h['id']}/toggle", json={"date": (today - timedelta(days=i)).isoformat()})
    h = auth.get("/api/habits").json()[0]
    assert h["done_today"] and h["current_streak"] == 3 and h["best_streak"] == 3

    h = auth.post(f"/api/habits/{h['id']}/toggle", json={"date": today.isoformat()}).json()
    assert not h["done_today"] and h["current_streak"] == 2  # yesterday's streak still counts

    future = (today + timedelta(days=2)).isoformat()
    assert auth.post(f"/api/habits/{h['id']}/toggle", json={"date": future}).status_code == 400

    ov = auth.get("/api/habits/overview").json()
    assert ov["total"] == 1 and len(ov["calendar"]) == 90


def test_weekly_habit(auth):
    h = auth.post("/api/habits", json={"name": "Long run", "frequency": "weekly"}).json()
    h = auth.post(f"/api/habits/{h['id']}/toggle").json()
    assert h["done_this_week"] and h["current_streak"] == 1


# ---------------- Reminders ----------------
def test_recurring_reminder_rolls_forward(auth):
    at = datetime.now(timezone.utc) + timedelta(hours=1)
    r = auth.post("/api/reminders", json={"title": "Pay rent", "remind_at": iso(at), "recurrence": "monthly"}).json()
    r2 = auth.post(f"/api/reminders/{r['id']}/complete").json()
    assert not r2["completed"] and r2["remind_at"] > r["remind_at"]

    once = auth.post("/api/reminders", json={"title": "Dentist", "remind_at": iso(at)}).json()
    done = auth.post(f"/api/reminders/{once['id']}/complete").json()
    assert done["completed"]
    assert len(auth.get("/api/reminders?status=upcoming").json()) == 1
    assert len(auth.get("/api/reminders?status=completed").json()) == 1


# ---------------- Notes ----------------
def test_notes_search_pin_archive(auth):
    n1 = auth.post("/api/notes", json={"title": "Wifi password", "content": "hunter2", "category": "Home"}).json()
    auth.post("/api/notes", json={"title": "Ideas", "content": "build an app"})
    auth.patch(f"/api/notes/{n1['id']}", json={"pinned": True})
    notes = auth.get("/api/notes").json()
    assert notes[0]["id"] == n1["id"]
    assert len(auth.get("/api/notes?q=app").json()) == 1
    assert auth.get("/api/notes/categories").json() == ["Home"]
    auth.patch(f"/api/notes/{n1['id']}", json={"archived": True})
    assert len(auth.get("/api/notes").json()) == 1
    assert len(auth.get("/api/notes?archived=true").json()) == 1


# ---------------- Insights ----------------
def test_dashboard_reports_activity(auth):
    now = datetime.now(timezone.utc)
    t = auth.post("/api/tasks", json={"title": "Today", "due_date": iso(now + timedelta(minutes=30))}).json()
    auth.patch(f"/api/tasks/{t['id']}", json={"completed": True})
    auth.post("/api/transactions", json={"type": "expense", "amount": 12, "date": date.today().isoformat()})
    h = auth.post("/api/habits", json={"name": "Water"}).json()
    auth.post(f"/api/habits/{h['id']}/toggle")

    d = auth.get("/api/dashboard").json()
    assert d["tasks"]["completed_today"] == 1
    assert d["finance"]["today_expense"] == 12
    assert d["habits"]["progress"] == 100
    assert len(d["week"]) == 7
    assert d["recent_activity"]

    for period in ("week", "month"):
        rep = auth.get(f"/api/reports?period={period}").json()
        assert rep["tasks_completed"] == 1 and rep["expense"] == 12
    assert auth.get("/api/reports?period=month&offset=1").status_code == 200

    act = auth.get("/api/activity?entity_type=task").json()
    assert act["total"] >= 2


def test_timezone_offset_header(auth):
    # A user at UTC+14 is already "tomorrow" relative to UTC most of the day.
    r = auth.get("/api/dashboard", headers={"X-TZ-Offset": "840"}).json()
    expected = (datetime.now(timezone.utc) + timedelta(hours=14)).date().isoformat()
    assert r["today"] == expected


def test_deleted_account_token_cannot_access_new_account(client):
    old = register(client, "gone@example.com")["access_token"]
    client.cookies.clear()
    assert client.delete("/api/users/me", headers={"Authorization": f"Bearer {old}"}).status_code == 204
    register(client, "new@example.com")
    client.cookies.clear()
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {old}"}).status_code == 401
