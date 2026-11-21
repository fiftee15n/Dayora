"""Savings goals: put money aside for a purpose; it leaves the monthly balance."""

from datetime import date

TODAY = date.today().isoformat()


def totals(auth):
    s = auth.get("/api/transactions/summary").json()
    return s["income"], s["expense"], s["balance"]


def goal(auth, name="New laptop", target=120000):
    r = auth.post("/api/savings", json={"name": name, "target": target})
    assert r.status_code == 201, r.text
    return r.json()


def save(auth, gid, amount, kind="deposit", **extra):
    r = auth.post(f"/api/savings/{gid}/entries", json={"amount": amount, "date": TODAY, "kind": kind, **extra})
    assert r.status_code == 201, r.text
    return r.json()


def test_create_goal(auth):
    g = goal(auth)
    assert g["name"] == "New laptop" and g["target"] == 120000
    assert g["saved"] == 0 and g["remaining"] == 120000 and g["progress"] == 0 and not g["reached"]


def test_saving_comes_off_the_balance(auth):
    auth.post("/api/transactions", json={"type": "income", "amount": 50000, "date": TODAY})
    g = goal(auth)
    body = save(auth, g["id"], 10000, note="November")
    assert body["saved"] == 10000 and body["remaining"] == 110000 and body["this_month"] == 10000
    assert body["progress"] == round(10000 / 120000 * 100, 1)
    # Income 50,000, saved 10,000 -> balance after saving is 40,000.
    assert totals(auth) == (50000, 10000, 40000)
    tx = auth.get("/api/transactions?type=expense").json()["items"][0]
    assert tx["description"] == "Saved for New laptop · November" and tx["category"]["name"] == "Savings"


def test_partial_savings_add_up_and_reach_target(auth):
    g = goal(auth, target=3000)
    save(auth, g["id"], 1000)
    body = save(auth, g["id"], 2000)
    assert body["saved"] == 3000 and body["reached"] and body["remaining"] == 0 and body["progress"] == 100


def test_taking_money_out(auth):
    g = goal(auth)
    save(auth, g["id"], 5000)
    body = save(auth, g["id"], 2000, kind="withdraw")
    assert body["saved"] == 3000
    assert totals(auth) == (2000, 5000, -3000)
    # Can't take out more than is saved.
    r = auth.post(f"/api/savings/{g['id']}/entries", json={"amount": 9999, "date": TODAY, "kind": "withdraw"})
    assert r.status_code == 400


def test_list_totals(auth):
    a = goal(auth, "Laptop", 100000)
    b = goal(auth, "Emergency fund", None)
    save(auth, a["id"], 4000)
    save(auth, b["id"], 1500)
    data = auth.get("/api/savings").json()
    assert data["totals"] == {"saved": 5500, "target": 100000, "this_month": 5500}
    no_target = next(g for g in data["items"] if g["name"] == "Emergency fund")
    assert no_target["target"] is None and no_target["progress"] is None and not no_target["reached"]


def test_not_recording_in_money(auth):
    g = goal(auth)
    save(auth, g["id"], 1000, record_in_money=False)
    assert totals(auth) == (0, 0, 0)
    assert auth.get(f"/api/savings/{g['id']}").json()["saved"] == 1000


def test_deleting_entry_returns_money(auth):
    g = goal(auth)
    body = save(auth, g["id"], 1000)
    entry = body["entries"][0]
    r = auth.delete(f"/api/savings/{g['id']}/entries/{entry['id']}")
    assert r.status_code == 200 and r.json()["saved"] == 0
    assert totals(auth) == (0, 0, 0)


def test_money_side_stays_in_sync(auth):
    g = goal(auth)
    body = save(auth, g["id"], 1000)
    tx_id = body["entries"][0]["transaction_id"]
    assert auth.patch(f"/api/transactions/{tx_id}", json={"amount": 1500}).status_code == 200
    assert auth.get(f"/api/savings/{g['id']}").json()["saved"] == 1500
    assert auth.patch(f"/api/transactions/{tx_id}", json={"type": "income"}).status_code == 400
    assert auth.delete(f"/api/transactions/{tx_id}").status_code == 204
    assert auth.get(f"/api/savings/{g['id']}").json()["saved"] == 0


def test_edit_and_delete_goal(auth):
    g = goal(auth)
    save(auth, g["id"], 2000)
    r = auth.patch(f"/api/savings/{g['id']}", json={"name": "Gaming laptop", "target": 150000})
    assert r.json()["name"] == "Gaming laptop" and r.json()["remaining"] == 148000
    assert auth.delete(f"/api/savings/{g['id']}").status_code == 204
    assert totals(auth) == (0, 0, 0)  # the saved money is back in the balance
    assert auth.get(f"/api/savings/{g['id']}").status_code == 404


def test_savings_are_private(auth, client):
    g = goal(auth)
    other = client.post("/api/auth/register", json={"name": "Eve", "email": "eve@example.com", "password": "secret123"}).json()
    h = {"Authorization": f"Bearer {other['access_token']}"}
    assert client.get(f"/api/savings/{g['id']}", headers=h).status_code == 404
    assert client.get("/api/savings", headers=h).json()["items"] == []


def complete(auth, gid, spent, **extra):
    r = auth.post(f"/api/savings/{gid}/complete", json={"spent": spent, "date": TODAY, **extra})
    assert r.status_code == 200, r.text
    return r.json()


def test_complete_with_money_left_over(auth):
    auth.post("/api/transactions", json={"type": "income", "amount": 20000, "date": TODAY})
    g = goal(auth, target=5000)
    save(auth, g["id"], 5000)
    assert totals(auth) == (20000, 5000, 15000)
    body = complete(auth, g["id"], 4000)
    assert body["completed_on"] == TODAY and body["spent"] == 4000 and body["leftover"] == 1000
    assert body["saved"] == 4000 and body["reached"]
    # The 1,000 left over is back in the balance.
    assert totals(auth) == (21000, 5000, 16000)
    # A completed goal is closed for new entries and no longer counts in the totals.
    r = auth.post(f"/api/savings/{g['id']}/entries", json={"amount": 10, "date": TODAY})
    assert r.status_code == 400
    assert auth.get("/api/savings").json()["totals"]["saved"] == 0


def test_complete_spending_more_than_saved(auth):
    g = goal(auth, target=5000)
    save(auth, g["id"], 5000)
    body = complete(auth, g["id"], 6000)
    assert body["leftover"] == -1000 and body["saved"] == 6000
    assert totals(auth) == (0, 6000, -6000)


def test_reopen_undoes_completion(auth):
    g = goal(auth)
    save(auth, g["id"], 5000)
    complete(auth, g["id"], 4000)
    r = auth.post(f"/api/savings/{g['id']}/reopen")
    assert r.status_code == 200 and r.json()["completed_on"] is None and r.json()["saved"] == 5000
    assert totals(auth) == (0, 5000, -5000)


def test_deleting_completed_goal_keeps_spending(auth):
    g = goal(auth)
    save(auth, g["id"], 5000)
    complete(auth, g["id"], 4000)
    assert auth.delete(f"/api/savings/{g['id']}").status_code == 204
    # The 4,000 really was spent, so Money keeps it (5,000 saved - 1,000 returned).
    assert totals(auth) == (1000, 5000, -4000)
