"""One-page monthly report."""

from calendar import monthrange
from datetime import date, timedelta

TODAY = date.today()
LAST = (TODAY.replace(day=1) - timedelta(days=1)).replace(day=1)  # 1st of last month
KEY = LAST.strftime("%Y-%m")
DAYS = monthrange(LAST.year, LAST.month)[1]


def d(day: int) -> str:
    return LAST.replace(day=day).isoformat()


def tx(auth, type, amount, day, **extra):
    r = auth.post("/api/transactions", json={"type": type, "amount": amount, "date": d(day), **extra})
    assert r.status_code == 201, r.text


def test_defaults_to_last_month(auth):
    r = auth.get("/api/reports/monthly").json()
    assert r["month"] == KEY and not r["partial"] and r["days"] == DAYS and not r["has_data"]


def test_money_totals_and_average(auth):
    tx(auth, "income", 60000, 5, description="Salary")
    tx(auth, "expense", 3000, 2, description="Groceries")
    tx(auth, "expense", 9000, 10, description="Rent")
    r = auth.get(f"/api/reports/monthly?month={KEY}").json()
    assert r["income"] == 60000 and r["expense"] == 12000 and r["balance"] == 48000
    assert r["avg_daily_expense"] == round(12000 / DAYS, 2)
    assert r["biggest_expense"]["description"] == "Rent"
    assert r["top_spending_day"] == {"date": d(10), "amount": 9000}


def test_loans_as_of_month_end(auth):
    auth.post("/api/loans", json={"person": "Rahim", "direction": "lent", "amount": 5000, "date": d(3)})
    loan = auth.post("/api/loans", json={"person": "Karim", "direction": "borrowed", "amount": 2000, "date": d(4)}).json()
    # Repaid this month: no longer owed at month end.
    auth.post(f"/api/loans/{loan['id']}/entries", json={"kind": "payment", "amount": 500, "date": d(20)})
    r = auth.get(f"/api/reports/monthly?month={KEY}").json()["loans"]
    assert r["owed_to_me"] == 5000 and r["i_owe"] == 1500
    assert r["owed_to_me_people"][0]["person"] == "Rahim"
    assert r["lent_this_month"] == 5000 and r["repaid_by_me_this_month"] == 500


def test_savings_section(auth):
    g = auth.post("/api/savings", json={"name": "Laptop", "target": 5000}).json()
    auth.post(f"/api/savings/{g['id']}/entries", json={"amount": 5000, "date": d(1)})
    auth.post(f"/api/savings/{g['id']}/complete", json={"spent": 4000, "date": d(25)})
    h = auth.post("/api/savings", json={"name": "Hajj", "target": 100000}).json()
    auth.post(f"/api/savings/{h['id']}/entries", json={"amount": 2000, "date": d(2)})
    s = auth.get(f"/api/reports/monthly?month={KEY}").json()["savings"]
    # The left-over return at completion isn't counted as "taken out".
    assert s["put_aside"] == 7000 and s["taken_out"] == 0
    assert s["completed"][0]["name"] == "Laptop" and s["completed"][0]["leftover"] == 1000
    assert [x["name"] for x in s["in_progress"]] == ["Hajj"] and s["in_progress"][0]["saved"] == 2000


def test_current_month_is_partial_and_future_is_rejected(auth):
    r = auth.get(f"/api/reports/monthly?month={TODAY.strftime('%Y-%m')}").json()
    assert r["partial"] and r["days"] == TODAY.day
    nxt = (TODAY.replace(day=28) + timedelta(days=5)).strftime("%Y-%m")
    assert auth.get(f"/api/reports/monthly?month={nxt}").status_code == 400
