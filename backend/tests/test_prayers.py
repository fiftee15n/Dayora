"""Namaz tracker."""

from datetime import date, timedelta

PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"]
TODAY = date.today()


def mark_day(auth, d: date, prayers=PRAYERS, status="prayed"):
    for p in prayers:
        r = auth.put(f"/api/prayers/{d.isoformat()}/{p}", json={"status": status})
        assert r.status_code == 200, r.text


def test_mark_and_list_today(auth):
    mark_day(auth, TODAY, ["fajr", "dhuhr"])
    auth.put(f"/api/prayers/{TODAY.isoformat()}/asr", json={"status": "qaza"})
    rows = auth.get("/api/prayers").json()
    assert {(r["prayer"], r["status"]) for r in rows} == {("fajr", "prayed"), ("dhuhr", "prayed"), ("asr", "qaza")}
    stats = auth.get("/api/prayers/stats").json()
    assert stats["today_done"] == 3


def test_marking_twice_updates_status(auth):
    mark_day(auth, TODAY, ["isha"])
    r = auth.put(f"/api/prayers/{TODAY.isoformat()}/isha", json={"status": "qaza"})
    assert r.json()["status"] == "qaza"
    assert len(auth.get("/api/prayers").json()) == 1


def test_unmark(auth):
    mark_day(auth, TODAY, ["fajr"])
    assert auth.delete(f"/api/prayers/{TODAY.isoformat()}/fajr").status_code == 204
    assert auth.get("/api/prayers").json() == []
    # Unmarking something that isn't marked is fine.
    assert auth.delete(f"/api/prayers/{TODAY.isoformat()}/fajr").status_code == 204


def test_rejects_future_and_unknown_prayer(auth):
    tomorrow = (TODAY + timedelta(days=1)).isoformat()
    assert auth.put(f"/api/prayers/{tomorrow}/fajr", json={}).status_code == 400
    assert auth.put(f"/api/prayers/{TODAY.isoformat()}/tahajjud", json={}).status_code == 422


def test_range_listing(auth):
    week_ago = TODAY - timedelta(days=6)
    mark_day(auth, week_ago)
    mark_day(auth, TODAY, ["fajr"])
    rows = auth.get(f"/api/prayers?start={week_ago.isoformat()}&end={TODAY.isoformat()}").json()
    assert len(rows) == 6


def test_streak_counts_full_days(auth):
    # Three full days ending yesterday, and today partly done: streak is 3 (today doesn't break it).
    for i in range(1, 4):
        mark_day(auth, TODAY - timedelta(days=i))
    mark_day(auth, TODAY, ["fajr"])
    s = auth.get("/api/prayers/stats").json()
    assert s["streak"] == 3 and s["best_streak"] == 3
    # Completing today extends it.
    mark_day(auth, TODAY, PRAYERS[1:])
    assert auth.get("/api/prayers/stats").json()["streak"] == 4


def test_gap_breaks_streak_but_best_remembers(auth):
    for i in range(5, 9):  # four full days, ending five days ago
        mark_day(auth, TODAY - timedelta(days=i))
    mark_day(auth, TODAY - timedelta(days=1))
    s = auth.get("/api/prayers/stats").json()
    assert s["streak"] == 1 and s["best_streak"] == 4


def test_month_stats(auth):
    mark_day(auth, TODAY, ["fajr", "dhuhr"])
    auth.put(f"/api/prayers/{TODAY.isoformat()}/asr", json={"status": "qaza"})
    s = auth.get("/api/prayers/stats").json()
    assert s["month_done"] == 3 and s["month_on_time"] == 2 and s["month_qaza"] == 1
    assert s["month_possible"] == 5 * TODAY.day


def test_prayers_are_private(auth, client):
    mark_day(auth, TODAY, ["fajr"])
    other = client.post("/api/auth/register", json={"name": "Eve", "email": "eve@example.com", "password": "secret123"}).json()
    rows = client.get("/api/prayers", headers={"Authorization": f"Bearer {other['access_token']}"}).json()
    assert rows == []
