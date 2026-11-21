"""Income earned for one month but received in another (salary paid in arrears)."""


def add(auth, **body):
    r = auth.post("/api/transactions", json={"type": "income", "amount": 50000, **body})
    assert r.status_code == 201, r.text
    return r.json()


def summary(auth, month):
    y, m = map(int, month.split("-"))
    from calendar import monthrange

    end = f"{month}-{monthrange(y, m)[1]:02d}"
    return auth.get(f"/api/transactions/summary?start={month}-01&end={end}").json()


def test_salary_for_last_month(auth):
    tx = add(auth, date="2026-11-15", description="Salary", for_month="2026-10")
    assert tx["for_month"] == "2026-10"
    nov = summary(auth, "2026-11")
    # Counted when received...
    assert nov["income"] == 50000
    assert nov["income_for_other_months"] == [{"month": "2026-10", "amount": 50000}]
    assert nov["received_elsewhere"] == []
    # ...and October shows it as received later, without changing October's totals.
    oct_ = summary(auth, "2026-10")
    assert oct_["income"] == 0
    assert oct_["received_elsewhere_total"] == 50000
    assert oct_["received_elsewhere"][0]["description"] == "Salary"
    assert oct_["received_elsewhere"][0]["date"] == "2026-11-15"


def test_same_month_is_not_stored(auth):
    assert add(auth, date="2026-11-15", for_month="2026-11")["for_month"] is None


def test_expenses_have_no_for_month(auth):
    r = auth.post("/api/transactions", json={"type": "expense", "amount": 5, "date": "2026-11-15", "for_month": "2026-10"})
    assert r.json()["for_month"] is None


def test_edit_and_clear_for_month(auth):
    tx = add(auth, date="2026-11-15")
    r = auth.patch(f"/api/transactions/{tx['id']}", json={"for_month": "2026-10"})
    assert r.json()["for_month"] == "2026-10"
    r = auth.patch(f"/api/transactions/{tx['id']}", json={"for_month": None})
    assert r.json()["for_month"] is None
    assert auth.patch(f"/api/transactions/{tx['id']}", json={"for_month": "2026-13"}).status_code == 422


def test_quick_income_paid_for_previous_month(auth):
    src = auth.post("/api/income-sources", json={"name": "Office salary", "amount": 60000, "for_previous_month": True}).json()
    assert src["for_previous_month"] is True
    tx = auth.post(f"/api/income-sources/{src['id']}/add", json={"date": "2026-11-12"}).json()
    assert tx["for_month"] == "2026-10"
    # Turning it off: entries are for the month received.
    auth.patch(f"/api/income-sources/{src['id']}", json={"for_previous_month": False})
    tx2 = auth.post(f"/api/income-sources/{src['id']}/add", json={"date": "2026-12-12"}).json()
    assert tx2["for_month"] is None


def test_quick_add_month_choice_overrides_source_default(auth):
    src = auth.post("/api/income-sources", json={"name": "Tuition", "amount": 5000, "for_previous_month": True}).json()
    tx = auth.post(f"/api/income-sources/{src['id']}/add", json={"date": "2026-11-12", "for_month": None}).json()
    assert tx["for_month"] is None
    listed = auth.get("/api/income-sources").json()[0]
    assert listed["for_previous_month"] is True


def test_quick_income_ticks_follow_the_viewed_month(auth):
    src = auth.post("/api/income-sources", json={"name": "Salary", "amount": 60000}).json()
    auth.post(f"/api/income-sources/{src['id']}/add", json={"date": "2026-11-12"})
    assert auth.get("/api/income-sources?month=2026-11").json()[0]["this_month_transaction_id"]
    # February has nothing added, so it's unticked.
    feb = auth.get("/api/income-sources?month=2027-02").json()[0]
    assert feb["this_month_transaction_id"] is None
    # Ticking for February (dated in February) doesn't touch November.
    auth.post(f"/api/income-sources/{src['id']}/add", json={"date": "2027-02-01"})
    assert auth.get("/api/income-sources?month=2027-02").json()[0]["this_month_date"] == "2027-02-01"
    assert auth.get("/api/income-sources?month=2026-11").json()[0]["this_month_date"] == "2026-11-12"
