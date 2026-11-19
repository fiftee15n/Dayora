"""Loans (borrowed / lent) and one-tap income sources."""

from datetime import date, timedelta

TODAY = date.today().isoformat()


def month_totals(auth):
    s = auth.get("/api/transactions/summary").json()
    return s["income"], s["expense"]


def borrow(auth, amount=1_000_000, person="Rahim", **extra):
    r = auth.post(
        "/api/loans",
        json={"person": person, "direction": "borrowed", "amount": amount, "date": TODAY, **extra},
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_borrowing_counts_as_income_and_repayments_as_expense(auth):
    loan = borrow(auth)
    assert loan["principal"] == 1_000_000 and loan["remaining"] == 1_000_000 and not loan["settled"]
    assert month_totals(auth) == (1_000_000, 0)

    r = auth.post(f"/api/loans/{loan['id']}/entries", json={"amount": 250_000, "date": TODAY, "note": "first part"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["paid"] == 250_000 and body["remaining"] == 750_000
    assert len(body["entries"]) == 2
    assert month_totals(auth) == (1_000_000, 250_000)

    # The money records are tagged with the Loans category and a readable description.
    txs = auth.get("/api/transactions").json()["items"]
    descs = {t["description"] for t in txs}
    assert "Borrowed from Rahim" in descs and "Repaid Rahim · first part" in descs
    assert all(t["category"]["name"] == "Loans" for t in txs)


def test_lending_is_expense_and_being_repaid_is_income(auth):
    r = auth.post("/api/loans", json={"person": "Karim", "direction": "lent", "amount": 5000, "date": TODAY})
    loan = r.json()
    auth.post(f"/api/loans/{loan['id']}/entries", json={"amount": 2000, "date": TODAY})
    assert month_totals(auth) == (2000, 5000)
    totals = auth.get("/api/loans").json()["totals"]
    assert totals["owed_to_me"] == 3000 and totals["i_owe"] == 0 and totals["open_lent"] == 1


def test_paying_in_full_settles_and_overpaying_is_refused(auth):
    loan = borrow(auth, amount=1000)
    r = auth.post(f"/api/loans/{loan['id']}/entries", json={"amount": 1200, "date": TODAY})
    assert r.status_code == 400 and "still owed" in r.json()["detail"]
    r = auth.post(f"/api/loans/{loan['id']}/entries", json={"amount": 1000, "date": TODAY})
    assert r.json()["settled"] is True and r.json()["remaining"] == 0
    assert auth.get("/api/loans?status=open").json()["items"] == []
    assert len(auth.get("/api/loans?status=settled").json()["items"]) == 1


def test_borrowing_more_raises_the_principal(auth):
    loan = borrow(auth, amount=1000)
    r = auth.post(f"/api/loans/{loan['id']}/entries", json={"kind": "principal", "amount": 500, "date": TODAY})
    assert r.json()["principal"] == 1500 and r.json()["remaining"] == 1500
    assert month_totals(auth) == (1500, 0)


def test_not_recording_in_money(auth):
    loan = borrow(auth, amount=1000, record_in_money=False)
    auth.post(f"/api/loans/{loan['id']}/entries", json={"amount": 400, "date": TODAY, "record_in_money": False})
    assert month_totals(auth) == (0, 0)
    assert auth.get(f"/api/loans/{loan['id']}").json()["remaining"] == 600


def test_deleting_a_repayment_removes_its_transaction(auth):
    loan = borrow(auth, amount=1000)
    body = auth.post(f"/api/loans/{loan['id']}/entries", json={"amount": 300, "date": TODAY}).json()
    payment = next(e for e in body["entries"] if e["kind"] == "payment")
    r = auth.delete(f"/api/loans/{loan['id']}/entries/{payment['id']}")
    assert r.status_code == 200 and r.json()["paid"] == 0
    assert month_totals(auth) == (1000, 0)
    # The original amount can't be deleted on its own.
    original = r.json()["entries"][0]
    assert auth.delete(f"/api/loans/{loan['id']}/entries/{original['id']}").status_code == 400


def test_deleting_the_transaction_in_money_updates_the_loan(auth):
    loan = borrow(auth, amount=1000)
    body = auth.post(f"/api/loans/{loan['id']}/entries", json={"amount": 300, "date": TODAY}).json()
    tx_id = next(e for e in body["entries"] if e["kind"] == "payment")["transaction_id"]
    assert auth.delete(f"/api/transactions/{tx_id}").status_code == 204
    assert auth.get(f"/api/loans/{loan['id']}").json()["paid"] == 0


def test_editing_the_transaction_amount_updates_the_loan(auth):
    loan = borrow(auth, amount=1000)
    body = auth.post(f"/api/loans/{loan['id']}/entries", json={"amount": 300, "date": TODAY}).json()
    tx_id = next(e for e in body["entries"] if e["kind"] == "payment")["transaction_id"]
    assert auth.patch(f"/api/transactions/{tx_id}", json={"amount": 450}).status_code == 200
    assert auth.get(f"/api/loans/{loan['id']}").json()["paid"] == 450
    # Flipping a loan transaction between income and expense isn't allowed.
    assert auth.patch(f"/api/transactions/{tx_id}", json={"type": "income"}).status_code == 400


def test_deleting_a_loan_removes_its_money_records(auth):
    loan = borrow(auth, amount=1000)
    auth.post(f"/api/loans/{loan['id']}/entries", json={"amount": 300, "date": TODAY})
    assert auth.delete(f"/api/loans/{loan['id']}").status_code == 204
    assert month_totals(auth) == (0, 0)
    assert auth.get(f"/api/loans/{loan['id']}").status_code == 404


def test_loans_are_private(auth, client):
    loan = borrow(auth)
    other = client.post("/api/auth/register", json={"name": "Eve", "email": "eve@example.com", "password": "secret123"}).json()
    headers = {"Authorization": f"Bearer {other['access_token']}"}
    assert client.get(f"/api/loans/{loan['id']}", headers=headers).status_code == 404
    assert client.get("/api/loans", headers=headers).json()["items"] == []


def test_update_loan_details(auth):
    loan = borrow(auth)
    r = auth.patch(f"/api/loans/{loan['id']}", json={"person": "Rahim Uddin", "note": "For the bike", "due_date": "2027-06-30"})
    assert r.json()["person"] == "Rahim Uddin" and r.json()["due_date"] == "2027-06-30"


# ---------------------------------------------------------------- income sources


def test_income_source_one_tap(auth):
    cats = auth.get("/api/categories/expenses").json()
    salary = next(c for c in cats if c["name"] == "Salary")
    r = auth.post("/api/income-sources", json={"name": "Office salary", "amount": 50000, "category_id": salary["id"]})
    assert r.status_code == 201, r.text
    src = r.json()

    r = auth.post(f"/api/income-sources/{src['id']}/add", json={})
    assert r.status_code == 201, r.text
    tx = r.json()
    assert tx["type"] == "income" and tx["amount"] == 50000 and tx["description"] == "Office salary"
    assert tx["category"]["name"] == "Salary" and tx["date"] == TODAY

    # It's now ticked for this month...
    listed = auth.get("/api/income-sources").json()[0]
    assert listed["this_month_transaction_id"] == tx["id"]
    assert listed["this_month_amount"] == 50000 and listed["this_month_date"] == TODAY

    # ...and can't be added twice in the same month.
    r = auth.post(f"/api/income-sources/{src['id']}/add", json={"amount": 55000})
    assert r.status_code == 409
    assert month_totals(auth) == (50000, 0)

    # Undo = delete the transaction; the tick clears and it can be added again.
    assert auth.delete(f"/api/transactions/{tx['id']}").status_code == 204
    assert auth.get("/api/income-sources").json()[0]["this_month_transaction_id"] is None
    r = auth.post(f"/api/income-sources/{src['id']}/add", json={"amount": 55000})
    assert r.status_code == 201 and r.json()["amount"] == 55000


def test_income_source_tick_resets_each_month(auth):
    src = auth.post("/api/income-sources", json={"name": "Salary", "amount": 1000}).json()
    last_month = (date.today().replace(day=1) - timedelta(days=1)).isoformat()
    r = auth.post(f"/api/income-sources/{src['id']}/add", json={"date": last_month})
    assert r.status_code == 201
    # Last month's entry doesn't tick this month.
    assert auth.get("/api/income-sources").json()[0]["this_month_transaction_id"] is None
    assert auth.post(f"/api/income-sources/{src['id']}/add", json={}).status_code == 201


def test_income_source_without_amount_needs_one(auth):
    src = auth.post("/api/income-sources", json={"name": "Freelance"}).json()
    assert auth.post(f"/api/income-sources/{src['id']}/add", json={}).status_code == 400
    assert auth.post(f"/api/income-sources/{src['id']}/add", json={"amount": 1200}).status_code == 201


def test_income_source_rejects_expense_category(auth):
    cats = auth.get("/api/categories/expenses").json()
    food = next(c for c in cats if c["kind"] == "expense")
    r = auth.post("/api/income-sources", json={"name": "X", "category_id": food["id"]})
    assert r.status_code == 400


def test_income_source_edit_and_delete(auth):
    src = auth.post("/api/income-sources", json={"name": "Rent", "amount": 8000}).json()
    r = auth.patch(f"/api/income-sources/{src['id']}", json={"amount": 9000, "name": "Flat rent"})
    assert r.json()["amount"] == 9000 and r.json()["name"] == "Flat rent"
    assert auth.delete(f"/api/income-sources/{src['id']}").status_code == 204
    assert auth.get("/api/income-sources").json() == []


def test_new_accounts_get_fitness_category(auth):
    names = [c["name"] for c in auth.get("/api/categories/tasks").json()]
    assert "Fitness" in names
