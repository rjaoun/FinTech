# Iteration 14: upcoming (projected) recurring occurrences - skip + single-occurrence override + regressions
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")


def _register():
    email = f"test_iter14_{uuid.uuid4().hex[:8]}@financefocus.app"
    r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "Test@1234", "name": "TEST Iter14"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def h():
    return _register()


@pytest.fixture(scope="module")
def other_h():
    return _register()


def _month_add(dt, n):
    y, m = dt.year, dt.month + n
    while m > 12:
        y, m = y + 1, m - 12
    return datetime(y, m, 15, 12, 0, 0, tzinfo=timezone.utc)


def _cal_proj(h, month, rid):
    r = requests.get(f"{BASE_URL}/api/calendar", params={"month": month}, headers=h)
    assert r.status_code == 200, r.text
    return [e for d in r.json()["days"] for e in d["events"] if e["projected"] and e["recurring_rule_id"] == rid]


def _summary(h, month):
    r = requests.get(f"{BASE_URL}/api/dashboard/summary", params={"month": month}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def _txs(h, rid=None):
    r = requests.get(f"{BASE_URL}/api/transactions", headers=h)
    assert r.status_code == 200
    data = r.json()
    return [t for t in data if rid is None or t.get("recurring_rule_id") == rid]


@pytest.fixture(scope="module")
def rules(h):
    """Monthly expense + monthly income rules starting next month"""
    now = datetime.now(timezone.utc)
    start = _month_add(now, 1)
    m1, m2, m3 = start.strftime("%Y-%m"), _month_add(now, 2).strftime("%Y-%m"), _month_add(now, 3).strftime("%Y-%m")
    exp = requests.post(f"{BASE_URL}/api/recurring", headers=h, json={
        "amount": 100, "type": "expense", "category": "bills", "description": "TEST_rent",
        "frequency": "monthly", "start_date": start.isoformat()}).json()
    inc = requests.post(f"{BASE_URL}/api/recurring", headers=h, json={
        "amount": 500, "type": "income", "category": "salary", "description": "TEST_salary",
        "frequency": "monthly", "start_date": start.isoformat()}).json()
    yield {"exp": exp["id"], "inc": inc["id"], "m1": m1, "m2": m2, "m3": m3}
    for rid in (exp["id"], inc["id"]):
        requests.delete(f"{BASE_URL}/api/recurring/{rid}?delete_generated=true", headers=h)


# --- Skip endpoint ---
class TestSkip:
    def test_projection_exists_before_skip(self, h, rules):
        assert len(_cal_proj(h, rules["m1"], rules["exp"])) == 1
        s = _summary(h, rules["m1"])
        assert s["month_projected_expense"] == 100
        assert s["month_projected_income"] == 500

    def test_skip_hides_only_that_occurrence(self, h, rules):
        ev = _cal_proj(h, rules["m1"], rules["exp"])[0]
        r = requests.post(f"{BASE_URL}/api/recurring/{rules['exp']}/skip", headers=h, json={"date": ev["date"]})
        assert r.status_code == 200 and r.json() == {"ok": True}
        assert _cal_proj(h, rules["m1"], rules["exp"]) == []
        s = _summary(h, rules["m1"])
        assert s["month_projected_expense"] == 0
        assert s["month_projected_income"] == 500  # income untouched
        assert not any(t.get("recurring_rule_id") == rules["exp"] for t in s["recent_transactions"])
        # other months remain
        assert len(_cal_proj(h, rules["m2"], rules["exp"])) == 1
        assert _summary(h, rules["m2"])["month_projected_expense"] == 100

    def test_skip_income_occurrence(self, h, rules):
        ev = _cal_proj(h, rules["m2"], rules["inc"])[0]
        r = requests.post(f"{BASE_URL}/api/recurring/{rules['inc']}/skip", headers=h, json={"date": ev["date"]})
        assert r.status_code == 200
        assert _cal_proj(h, rules["m2"], rules["inc"]) == []
        assert _summary(h, rules["m2"])["month_projected_income"] == 0
        assert len(_cal_proj(h, rules["m1"], rules["inc"])) == 1

    def test_skip_bad_rid_404(self, h):
        r = requests.post(f"{BASE_URL}/api/recurring/nope/skip", headers=h, json={"date": "2030-01-01T00:00:00+00:00"})
        assert r.status_code == 404

    def test_skip_other_user_404(self, other_h, rules):
        r = requests.post(f"{BASE_URL}/api/recurring/{rules['exp']}/skip", headers=other_h, json={"date": "2030-01-01T00:00:00+00:00"})
        assert r.status_code == 404

    def test_skip_missing_body_422(self, h, rules):
        r = requests.post(f"{BASE_URL}/api/recurring/{rules['exp']}/skip", headers=h, json={})
        assert r.status_code == 422


# --- Override (edit only this occurrence) ---
class TestOverride:
    def test_override_creates_real_tx_and_hides_projection(self, h, rules):
        ev = _cal_proj(h, rules["m3"], rules["exp"])[0]
        body = {"amount": 175.5, "type": "expense", "category": "bills", "description": "TEST_rent_edited",
                "date": ev["date"], "paid": False, "original_date": ev["date"]}
        r = requests.post(f"{BASE_URL}/api/recurring/{rules['exp']}/occurrence", headers=h, json=body)
        assert r.status_code == 200, r.text
        tx = r.json()
        assert tx["recurring_rule_id"] == rules["exp"] and tx["amount"] == 175.5 and tx["paid"] is False
        assert "_id" not in tx
        # persisted
        assert any(t["id"] == tx["id"] and t["amount"] == 175.5 for t in _txs(h, rules["exp"]))
        # projected copy hidden, real one shown
        assert _cal_proj(h, rules["m3"], rules["exp"]) == []
        s = _summary(h, rules["m3"])
        assert s["month_projected_expense"] == 0
        assert s["month_expense"] == 175.5
        # other months unchanged
        assert _summary(h, rules["m2"])["month_projected_expense"] == 100

    def test_override_bad_rid_404(self, h):
        r = requests.post(f"{BASE_URL}/api/recurring/nope/occurrence", headers=h, json={
            "amount": 1, "type": "expense", "category": "bills", "date": "2030-01-01T00:00:00+00:00",
            "original_date": "2030-01-01T00:00:00+00:00"})
        assert r.status_code == 404

    def test_override_other_user_404(self, other_h, rules):
        r = requests.post(f"{BASE_URL}/api/recurring/{rules['exp']}/occurrence", headers=other_h, json={
            "amount": 1, "type": "expense", "category": "bills", "date": "2030-01-01T00:00:00+00:00",
            "original_date": "2030-01-01T00:00:00+00:00"})
        assert r.status_code == 404


# --- materialize_due must not duplicate an overridden / skipped date ---
class TestMaterializeRespectsExceptions:
    def test_override_then_due_no_duplicate(self, h):
        start = datetime.now(timezone.utc) + timedelta(seconds=10)
        rule = requests.post(f"{BASE_URL}/api/recurring", headers=h, json={
            "amount": 40, "type": "expense", "category": "bills", "description": "TEST_soon",
            "frequency": "monthly", "start_date": start.isoformat()}).json()
        rid = rule["id"]
        try:
            ev = _cal_proj(h, start.strftime("%Y-%m"), rid)
            assert len(ev) == 1, "projection should exist before it is due"
            orig = ev[0]["date"]
            r = requests.post(f"{BASE_URL}/api/recurring/{rid}/occurrence", headers=h, json={
                "amount": 55, "type": "expense", "category": "bills", "description": "TEST_soon_edited",
                "date": (start + timedelta(minutes=1)).isoformat(), "paid": True, "original_date": orig})
            assert r.status_code == 200, r.text
            time.sleep(12)  # occurrence now due
            requests.get(f"{BASE_URL}/api/recurring", headers=h)  # triggers materialize_due
            rows = _txs(h, rid)
            assert len(rows) == 1, rows
            assert rows[0]["amount"] == 55
            assert not any(t["date"] == orig for t in rows)
        finally:
            requests.delete(f"{BASE_URL}/api/recurring/{rid}?delete_generated=true", headers=h)

    def test_skip_then_due_not_materialized(self, h):
        start = datetime.now(timezone.utc) + timedelta(seconds=8)
        rid = requests.post(f"{BASE_URL}/api/recurring", headers=h, json={
            "amount": 9, "type": "expense", "category": "bills", "description": "TEST_skipsoon",
            "frequency": "monthly", "start_date": start.isoformat()}).json()["id"]
        try:
            orig = _cal_proj(h, start.strftime("%Y-%m"), rid)[0]["date"]
            assert requests.post(f"{BASE_URL}/api/recurring/{rid}/skip", headers=h, json={"date": orig}).status_code == 200
            time.sleep(10)
            requests.get(f"{BASE_URL}/api/transactions", headers=h)
            requests.get(f"{BASE_URL}/api/recurring", headers=h)
            assert _txs(h, rid) == []
            rr = [x for x in requests.get(f"{BASE_URL}/api/recurring", headers=h).json() if x["id"] == rid][0]
            assert rr["next_date"] > orig  # pointer advanced past skipped date
        finally:
            requests.delete(f"{BASE_URL}/api/recurring/{rid}?delete_generated=true", headers=h)

    def test_past_rule_override_same_date_no_duplicate(self, h):
        start = datetime.now(timezone.utc) - timedelta(days=2)
        rid = requests.post(f"{BASE_URL}/api/recurring", headers=h, json={
            "amount": 20, "type": "expense", "category": "bills", "description": "TEST_past",
            "frequency": "monthly", "start_date": start.isoformat()}).json()["id"]
        try:
            rows = _txs(h, rid)
            assert len(rows) == 1
            d = rows[0]["date"]
            r = requests.post(f"{BASE_URL}/api/recurring/{rid}/occurrence", headers=h, json={
                "amount": 99, "type": "expense", "category": "bills", "date": d, "original_date": d})
            print("override on materialized date ->", r.status_code, r.text[:120])
            assert r.status_code in (200, 409)
            requests.get(f"{BASE_URL}/api/recurring", headers=h)
            assert len([t for t in _txs(h, rid) if t["date"] == d]) == 1
        finally:
            requests.delete(f"{BASE_URL}/api/recurring/{rid}?delete_generated=true", headers=h)


# --- Regression: PUT cascade + delete series ---
class TestRegression:
    def test_put_series_and_delete(self, h):
        start = datetime.now(timezone.utc) - timedelta(days=15)
        rid = requests.post(f"{BASE_URL}/api/recurring", headers=h, json={
            "amount": 10, "type": "expense", "category": "bills", "description": "TEST_weekly",
            "frequency": "weekly", "start_date": start.isoformat()}).json()["id"]
        rows = _txs(h, rid)
        assert len(rows) == 3
        r = requests.put(f"{BASE_URL}/api/recurring/{rid}", headers=h, json={"amount": 12})
        assert r.status_code == 200 and r.json()["amount"] == 12
        assert all(t["amount"] == 12 for t in _txs(h, rid))
        assert requests.delete(f"{BASE_URL}/api/recurring/{rid}?delete_generated=true", headers=h).status_code == 200
        assert _txs(h, rid) == []
        assert rid not in [x["id"] for x in requests.get(f"{BASE_URL}/api/recurring", headers=h).json()]

    def test_transaction_crud_and_paid(self, h):
        r = requests.post(f"{BASE_URL}/api/transactions", headers=h, json={
            "amount": 5, "type": "expense", "category": "food", "description": "TEST_tx", "paid": False})
        assert r.status_code == 200
        tid = r.json()["id"]
        p = requests.patch(f"{BASE_URL}/api/transactions/{tid}/paid", headers=h, json={"paid": True})
        assert p.status_code == 200 and p.json()["paid"] is True
        u = requests.put(f"{BASE_URL}/api/transactions/{tid}", headers=h, json={
            "amount": 6, "type": "expense", "category": "food", "description": "TEST_tx2"})
        assert u.status_code == 200 and u.json()["amount"] == 6
        assert requests.delete(f"{BASE_URL}/api/transactions/{tid}", headers=h).status_code == 200
        assert tid not in [t["id"] for t in _txs(h)]
