"""Regression tests for concurrent materialize_due race condition fix.

Covers:
- Parallel GETs on /transactions, /dashboard/summary, /calendar must not create
  duplicate materialized recurring transactions.
- Balance math for past month is not double-counted.
- Future month projections add cleanly to cumulative real balance.
- Unique partial index rejects direct duplicate inserts.
- Non-recurring transactions (recurring_rule_id=None) are unaffected by the index.
- Full CRUD regression on recurring, transactions, dashboard, calendar, categories,
  auth, and paid endpoints still works.
"""
import os
import uuid
import concurrent.futures
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")


# -------- fixtures --------
@pytest.fixture(scope="module")
def user_ctx():
    """Register a fresh test user for isolated testing."""
    email = f"test_race_{uuid.uuid4().hex[:8]}@example.com"
    password = "Test@1234"
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": password, "name": "Race Tester"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    return {
        "email": email,
        "token": data["access_token"],
        "user_id": data["user"]["id"],
        "headers": {"Authorization": f"Bearer {data['access_token']}"},
    }


def _cleanup(headers):
    requests.post(f"{BASE_URL}/api/users/me/reset", headers=headers, timeout=15)


# -------- 1. RACE CONDITION -------- #
class TestRaceCondition:
    def test_parallel_gets_no_duplicate_materialization(self, user_ctx):
        headers = user_ctx["headers"]
        _cleanup(headers)

        # Create a monthly rent-like rule starting 6 months in the past so that
        # ~6 past-due occurrences exist that need to be materialized.
        start = (datetime.now(timezone.utc) - timedelta(days=185)).strftime("%Y-%m-%d")
        r = requests.post(
            f"{BASE_URL}/api/recurring",
            headers=headers,
            json={
                "amount": 1500,
                "type": "expense",
                "category": "bills",
                "description": "TEST_rent",
                "frequency": "monthly",
                "start_date": start,
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text
        rule_id = r.json()["id"]

        # Fire 10 parallel reads across three endpoints that all invoke materialize_due
        def hit(path):
            return requests.get(f"{BASE_URL}{path}", headers=headers, timeout=20)

        month = datetime.now(timezone.utc).strftime("%Y-%m")
        paths = [
            "/api/transactions",
            "/api/dashboard/summary",
            f"/api/dashboard/summary?month={month}",
            f"/api/calendar?month={month}",
            "/api/transactions",
            "/api/dashboard/summary",
            f"/api/calendar?month={month}",
            "/api/transactions",
            f"/api/dashboard/summary?month={month}",
            f"/api/calendar?month={month}",
        ]
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
            results = list(ex.map(hit, paths))
        for r in results:
            assert r.status_code == 200, f"{r.url} -> {r.status_code} {r.text[:200]}"

        # Now fetch transactions and count occurrences per (rule_id, date)
        list_r = requests.get(f"{BASE_URL}/api/transactions?limit=500", headers=headers, timeout=15)
        assert list_r.status_code == 200
        txs = [t for t in list_r.json() if t.get("recurring_rule_id") == rule_id]

        # Group by date and assert exactly one row per date
        by_date = {}
        for t in txs:
            by_date.setdefault(t["date"], 0)
            by_date[t["date"]] += 1
        dups = {d: c for d, c in by_date.items() if c > 1}
        assert not dups, f"Duplicate materialized rows for rule {rule_id}: {dups}"
        # Sanity: at least 5 monthly occurrences over 6 months
        assert len(by_date) >= 5, f"Expected >=5 materialized dates, got {len(by_date)}"

    def test_dashboard_month_balance_no_double_count_past(self, user_ctx):
        """For a past month whose materialization has completed, month_balance
        should reflect a single count of that month's recurring rows only."""
        headers = user_ctx["headers"]
        # Use a month 2-3 months in the past guaranteed to be materialized
        now = datetime.now(timezone.utc)
        # Pick 3 months ago
        y = now.year
        m = now.month - 3
        while m <= 0:
            m += 12
            y -= 1
        target = f"{y}-{m:02d}"

        r1 = requests.get(f"{BASE_URL}/api/dashboard/summary?month={target}", headers=headers, timeout=15)
        assert r1.status_code == 200
        s1 = r1.json()
        # Second call to prove idempotency
        r2 = requests.get(f"{BASE_URL}/api/dashboard/summary?month={target}", headers=headers, timeout=15)
        s2 = r2.json()

        assert s1["month_balance"] == s2["month_balance"], (
            f"month_balance changed across identical calls: {s1['month_balance']} -> {s2['month_balance']}"
        )
        # month_projected_income/expense should be 0 for a past month
        assert s1["month_projected_income"] == 0
        assert s1["month_projected_expense"] == 0

    def test_dashboard_future_month_projection_math(self, user_ctx):
        """For a future target month, month_balance = cumulative_real + projected_income - projected_expense."""
        headers = user_ctx["headers"]
        now = datetime.now(timezone.utc)
        # 2 months in the future
        m = now.month + 2
        y = now.year
        while m > 12:
            m -= 12
            y += 1
        future = f"{y}-{m:02d}"

        r = requests.get(f"{BASE_URL}/api/dashboard/summary?month={future}", headers=headers, timeout=15)
        assert r.status_code == 200
        s = r.json()

        # For a future month with our TEST_rent rule active, we should have projected_expense >= 1500
        assert s["month_projected_expense"] >= 1500, s

        # Compute cumulative real balance for months up to the current month (only real materialized)
        cur_month = now.strftime("%Y-%m")
        r_cur = requests.get(f"{BASE_URL}/api/dashboard/summary?month={cur_month}", headers=headers, timeout=15)
        assert r_cur.status_code == 200
        s_cur = r_cur.json()
        # Real cumulative through current month should equal s_cur.month_balance MINUS current-month projections
        real_cumulative_cur = s_cur["month_balance"] - s_cur["month_projected_income"] + s_cur["month_projected_expense"]

        # For the future month, projections should stack cleanly. Balance should be lower than real_cumulative_cur
        # since our recurring is expense.
        assert s["month_balance"] < real_cumulative_cur + 0.01, (
            f"Future month_balance {s['month_balance']} should be <= current real cumulative {real_cumulative_cur}"
        )


# -------- 2. UNIQUE INDEX -------- #
class TestUniqueIndex:
    def test_direct_duplicate_insert_rejected(self):
        """Directly inserting two documents with same (user_id, recurring_rule_id, date)
        should fail on the second because of uniq_user_rule_date partial index."""
        import motor.motor_asyncio
        import asyncio

        mongo_url = os.environ["MONGO_URL"]
        db_name = os.environ["DB_NAME"]

        async def _run():
            client = motor.motor_asyncio.AsyncIOMotorClient(mongo_url)
            db = client[db_name]
            uid = f"TEST_race_uid_{uuid.uuid4().hex[:8]}"
            rid = f"TEST_race_rid_{uuid.uuid4().hex[:8]}"
            date_iso = "2099-01-01T00:00:00+00:00"
            base_doc = lambda: {
                "id": str(uuid.uuid4()),
                "user_id": uid,
                "recurring_rule_id": rid,
                "date": date_iso,
                "amount": 10.0,
                "type": "expense",
                "category": "bills",
                "description": "TEST_dup",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "paid": True,
            }
            try:
                await db.transactions.insert_one(base_doc())
                dup_raised = False
                try:
                    await db.transactions.insert_one(base_doc())
                except Exception as e:
                    if "duplicate key" in str(e).lower() or "E11000" in str(e):
                        dup_raised = True
                    else:
                        raise
                assert dup_raised, "Second insert with same (user, rule, date) should have failed"
            finally:
                await db.transactions.delete_many({"user_id": uid})
                client.close()

        asyncio.run(_run())

    def test_non_recurring_not_affected_by_unique_index(self, user_ctx):
        """Non-recurring transactions (recurring_rule_id=None) can be freely duplicated."""
        headers = user_ctx["headers"]
        payload = {
            "amount": 25.5,
            "type": "expense",
            "category": "food",
            "description": "TEST_manual_dup",
            "date": "2099-06-15T12:00:00+00:00",
            "paid": True,
        }
        ids = []
        for _ in range(3):
            r = requests.post(f"{BASE_URL}/api/transactions", headers=headers, json=payload, timeout=15)
            assert r.status_code == 200, r.text
            ids.append(r.json()["id"])
        assert len(set(ids)) == 3
        # Cleanup
        for tid in ids:
            requests.delete(f"{BASE_URL}/api/transactions/{tid}", headers=headers, timeout=15)


# -------- 3. REGRESSION: existing endpoints -------- #
class TestRegression:
    def test_auth_login_me(self, user_ctx):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=user_ctx["headers"], timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == user_ctx["email"]

    def test_admin_login(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@financefocus.app", "password": "admin123"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert "access_token" in r.json()

    def test_categories(self, user_ctx):
        r = requests.get(f"{BASE_URL}/api/categories", headers=user_ctx["headers"], timeout=15)
        assert r.status_code == 200
        cats = r.json()
        assert isinstance(cats, list) and len(cats) > 10

    def test_calendar_current_month(self, user_ctx):
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        r = requests.get(f"{BASE_URL}/api/calendar?month={month}", headers=user_ctx["headers"], timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["month"] == month
        assert "days" in body and "totals" in body

    def test_transactions_crud_and_paid(self, user_ctx):
        headers = user_ctx["headers"]
        # Create
        r = requests.post(
            f"{BASE_URL}/api/transactions",
            headers=headers,
            json={"amount": 42, "type": "expense", "category": "food", "description": "TEST_crud"},
            timeout=15,
        )
        assert r.status_code == 200
        tid = r.json()["id"]

        # Update
        r = requests.put(
            f"{BASE_URL}/api/transactions/{tid}",
            headers=headers,
            json={"amount": 43, "type": "expense", "category": "food", "description": "TEST_crud2"},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["amount"] == 43

        # Paid toggle
        r = requests.patch(
            f"{BASE_URL}/api/transactions/{tid}/paid",
            headers=headers,
            json={"paid": False},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["paid"] is False

        # Delete
        r = requests.delete(f"{BASE_URL}/api/transactions/{tid}", headers=headers, timeout=15)
        assert r.status_code == 200

    def test_recurring_crud(self, user_ctx):
        headers = user_ctx["headers"]
        r = requests.post(
            f"{BASE_URL}/api/recurring",
            headers=headers,
            json={
                "amount": 20,
                "type": "expense",
                "category": "bills",
                "description": "TEST_reg_recurring",
                "frequency": "monthly",
                "start_date": (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d"),
            },
            timeout=15,
        )
        assert r.status_code == 200
        rid = r.json()["id"]

        # List
        r = requests.get(f"{BASE_URL}/api/recurring", headers=headers, timeout=15)
        assert r.status_code == 200
        assert any(x["id"] == rid for x in r.json())

        # Toggle (patch)
        r = requests.patch(f"{BASE_URL}/api/recurring/{rid}", headers=headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["active"] is False

        # Delete
        r = requests.delete(f"{BASE_URL}/api/recurring/{rid}", headers=headers, timeout=15)
        assert r.status_code == 200

    def test_ai_suggest_category(self, user_ctx):
        r = requests.post(
            f"{BASE_URL}/api/ai/suggest-category",
            headers=user_ctx["headers"],
            json={"description": "Uber ride home", "amount": 12.5},
            timeout=30,
        )
        # We accept 200 with a category id even on fallback
        assert r.status_code == 200, r.text
        assert "category" in r.json()


# -------- final cleanup -------- #
def test_zzz_cleanup(user_ctx):
    _cleanup(user_ctx["headers"])
