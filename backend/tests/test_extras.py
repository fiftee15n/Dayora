from datetime import datetime, timedelta, timezone
from pathlib import Path

from app import mailer
from app.config import settings
from tests.conftest import register

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def test_forgot_password_emails_a_code(client, monkeypatch):
    sent = []
    monkeypatch.setattr("app.routers.auth.send_password_reset_code", lambda *a: sent.append(a) or True)
    register(client)
    r = client.post("/api/auth/forgot-password", json={"email": "sara@example.com"})
    code = r.json()["dev_reset_code"]
    assert len(sent) == 1
    to, name, emailed, minutes = sent[0]
    assert to == "sara@example.com" and name == "Sara" and emailed == code

    # A newer request invalidates the older code.
    code2 = client.post("/api/auth/forgot-password", json={"email": "sara@example.com"}).json()["dev_reset_code"]
    if code2 != code:
        assert client.post(
            "/api/auth/reset-password", json={"email": "sara@example.com", "code": code, "new_password": "newpass99"}
        ).status_code == 400
    assert client.post(
        "/api/auth/reset-password", json={"email": "sara@example.com", "code": code2, "new_password": "newpass99"}
    ).status_code == 200


def test_unknown_email_reveals_nothing(client, monkeypatch):
    sent = []
    monkeypatch.setattr("app.routers.auth.send_password_reset_code", lambda *a: sent.append(a))
    r = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    assert r.status_code == 200 and "dev_reset_code" not in r.json() and not sent
    r = client.post("/api/auth/reset-password", json={"email": "nobody@example.com", "code": "123456", "new_password": "newpass99"})
    assert r.status_code == 400


def test_reset_requires_strong_password(client):
    register(client)
    code = client.post("/api/auth/forgot-password", json={"email": "sara@example.com"}).json()["dev_reset_code"]
    r = client.post("/api/auth/reset-password", json={"email": "sara@example.com", "code": code, "new_password": "aaaaaaaa"})
    assert r.status_code == 422


def test_reset_code_locks_after_wrong_guesses(client):
    register(client)
    code = client.post("/api/auth/forgot-password", json={"email": "sara@example.com"}).json()["dev_reset_code"]
    wrong = "000000" if code != "000000" else "111111"
    body = {"email": "sara@example.com", "new_password": "newpass99"}
    for _ in range(settings.verification_max_attempts):
        assert client.post("/api/auth/reset-password", json={**body, "code": wrong}).status_code == 400
    # Even the right code is refused now.
    r = client.post("/api/auth/reset-password", json={**body, "code": code})
    assert r.status_code == 400 and "Too many" in r.json()["detail"]


def test_mailer_without_smtp_does_not_raise():
    assert mailer.send_email("x@example.com", "Hi", "Body") is False


def test_change_password_signs_out_other_sessions(client):
    data = register(client)
    old_token = data["access_token"]
    client.cookies.clear()
    client.headers["Authorization"] = f"Bearer {old_token}"

    bad = client.post(
        "/api/users/me/password", json={"current_password": "nope", "new_password": "fresh1234"}
    )
    assert bad.status_code == 400
    r = client.post(
        "/api/users/me/password", json={"current_password": "secret123", "new_password": "fresh1234"}
    )
    assert r.status_code == 200
    new_token = r.json()["access_token"]

    assert client.get("/api/auth/me").status_code == 401  # old token revoked
    client.headers["Authorization"] = f"Bearer {new_token}"
    assert client.get("/api/auth/me").status_code == 200
    login = client.post("/api/auth/login", json={"email": "sara@example.com", "password": "fresh1234"})
    assert login.status_code == 200


def test_category_update(auth):
    cat = auth.post("/api/categories/tasks", json={"name": "Side", "color": "#112233"}).json()
    r = auth.patch(f"/api/categories/tasks/{cat['id']}", json={"name": " Side project "})
    assert r.status_code == 200 and r.json() == {**cat, "name": "Side project"}
    # Renaming onto an existing name conflicts.
    assert auth.patch(f"/api/categories/tasks/{cat['id']}", json={"name": "Work"}).status_code == 409

    exp = auth.get("/api/categories/expenses?kind=expense").json()[0]
    r = auth.patch(f"/api/categories/expenses/{exp['id']}", json={"color": "#000000", "icon": "x"})
    assert r.json()["color"] == "#000000" and r.json()["kind"] == "expense"


def test_category_update_is_owner_only(client):
    a = register(client, "a@example.com", "A")
    b = register(client, "b@example.com", "B")
    client.cookies.clear()
    client.headers["Authorization"] = f"Bearer {a['access_token']}"
    cat_id = client.get("/api/categories/tasks").json()[0]["id"]
    client.headers["Authorization"] = f"Bearer {b['access_token']}"
    assert client.patch(f"/api/categories/tasks/{cat_id}", json={"name": "Hax"}).status_code == 404


def test_avatar_remove_and_account_delete_clean_up_files(auth):
    user = auth.post("/api/users/me/avatar", files={"file": ("a.png", PNG, "image/png")}).json()
    path = Path(settings.upload_dir) / "avatars" / Path(user["avatar_url"]).name
    assert path.exists()
    r = auth.delete("/api/users/me/avatar")
    assert r.json()["avatar_url"] is None and not path.exists()

    user = auth.post("/api/users/me/avatar", files={"file": ("a.png", PNG, "image/png")}).json()
    path = Path(settings.upload_dir) / "avatars" / Path(user["avatar_url"]).name
    assert auth.delete("/api/users/me").status_code == 204
    assert not path.exists()


def test_export_contains_only_own_data(client):
    other = register(client, "other@example.com", "Other")
    client.cookies.clear()
    client.headers["Authorization"] = f"Bearer {other['access_token']}"
    client.post("/api/tasks", json={"title": "Not yours"})

    me = register(client, "me@example.com", "Me")
    client.cookies.clear()
    client.headers["Authorization"] = f"Bearer {me['access_token']}"
    client.post("/api/tasks", json={"title": "Mine"})
    client.post("/api/notes", json={"title": "N", "content": "hello"})
    h = client.post("/api/habits", json={"name": "Read"}).json()
    client.post(f"/api/habits/{h['id']}/toggle", json={})

    r = client.get("/api/users/me/export")
    assert r.status_code == 200
    assert "attachment" in r.headers["content-disposition"]
    data = r.json()
    assert data["profile"]["email"] == "me@example.com"
    assert [t["title"] for t in data["tasks"]] == ["Mine"]
    assert data["notes"][0]["content"] == "hello"
    assert len(data["habits"][0]["logs"]) == 1
    assert len(data["expense_categories"]) > 0 and data["activity"]


def test_recurring_reminders_expand_in_calendar_range(auth):
    start = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(hours=1)
    daily = auth.post(
        "/api/reminders", json={"title": "Water", "remind_at": iso(start), "recurrence": "daily"}
    ).json()
    auth.post("/api/reminders", json={"title": "Once", "remind_at": iso(start + timedelta(days=2))})
    local_today = datetime.now().date()
    rng = {"start": local_today.isoformat(), "end": (local_today + timedelta(days=6)).isoformat()}

    plain = auth.get("/api/reminders", params=rng).json()
    assert len(plain) == 2  # series only shows its next time

    expanded = auth.get("/api/reminders", params={**rng, "expand": "true"}).json()
    water = [r for r in expanded if r["title"] == "Water"]
    assert 6 <= len(water) <= 7
    assert water[0]["occurrence"] is False and all(w["occurrence"] for w in water[1:])
    assert all(w["id"] == daily["id"] and w["series_remind_at"] == daily["remind_at"] for w in water)
    assert len([r for r in expanded if r["title"] == "Once"]) == 1
    assert [r["remind_at"] for r in expanded] == sorted(r["remind_at"] for r in expanded)

    assert auth.get(f"/api/reminders/{daily['id']}").json()["title"] == "Water"


def test_expanded_series_started_before_window(auth):
    past = datetime.now(timezone.utc) - timedelta(days=10)
    auth.post("/api/reminders", json={"title": "Weekly", "remind_at": iso(past), "recurrence": "weekly"})
    local_today = datetime.now().date()
    rng = {
        "start": local_today.isoformat(),
        "end": (local_today + timedelta(days=13)).isoformat(),
        "expand": "true",
    }
    got = auth.get("/api/reminders", params=rng).json()
    assert len(got) == 2  # at +4 and +11 days


def test_reminder_limit_validated(auth):
    assert auth.get("/api/reminders?limit=0").status_code == 422
    assert auth.get("/api/reminders?limit=9999").status_code == 422
