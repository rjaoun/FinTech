"""
Tests for the new PUT /api/recurring/{rid} endpoint (iteration 10).
Verifies that updating a recurring rule cascades $set to every generated
transaction (recurring_rule_id match) and that omitted fields remain unchanged.
Also covers 404 (missing rule), 400 (empty body), and rent-category creation.
"""
import os
import requests
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from dotenv import load_dotenv

# Load frontend .env for EXPO_PUBLIC_BACKEND_URL (mirror pattern from test_recurring.py)
frontend_env = Path(__file__).parent.parent.parent / "frontend" / ".env"
load_dotenv(frontend_env)
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001").rstrip("/")


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "admin@financefocus.app", "password": "admin123"},
    )
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


@pytest.fixture
def client(token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    return s


# ---------- Category regression: rent ----------
class TestRentCategory:
    def test_rent_category_exists_and_usable(self, client):
        r = client.get(f"{BASE_URL}/api/categories")
        assert r.status_code == 200
        cats = r.json()
        assert len(cats) == 16, f"expected 16 categories, got {len(cats)}"
        rent = next((c for c in cats if c["id"] == "rent"), None)
        assert rent is not None
        assert rent == {"id": "rent", "name": "Rent", "icon": "home", "color": "#8B6F47", "type": "expense"}

    def test_create_transaction_with_rent_category(self, client):
        payload = {
            "amount": 1200.0,
            "type": "expense",
            "category": "rent",
            "description": "TEST_Rent transaction",
        }
        r = client.post(f"{BASE_URL}/api/transactions", json=payload)
        assert r.status_code == 200, r.text
        tx = r.json()
        assert tx["category"] == "rent"
        # Cleanup
        client.delete(f"{BASE_URL}/api/transactions/{tx['id']}")


# ---------- PUT /api/recurring/{rid} ----------
class TestRecurringUpdateCascade:
    def _create_rule_with_history(self, client, days_back=21):
        past = (datetime.now() - timedelta(days=days_back)).strftime("%Y-%m-%d")
        r = client.post(
            f"{BASE_URL}/api/recurring",
            json={
                "amount": 50.0,
                "type": "expense",
                "category": "food",
                "description": "TEST_Series original",
                "frequency": "weekly",
                "start_date": past,
            },
        )
        assert r.status_code == 200, r.text
        rule = r.json()
        # Fetch its generated transactions
        tx_r = client.get(f"{BASE_URL}/api/transactions")
        assert tx_r.status_code == 200
        gen = [t for t in tx_r.json() if t.get("recurring_rule_id") == rule["id"]]
        assert len(gen) >= 2, f"expected >=2 generated tx, got {len(gen)}"
        return rule, gen

    def test_put_recurring_cascades_all_fields(self, client):
        rule, gen_before = self._create_rule_with_history(client)
        rid = rule["id"]
        try:
            body = {
                "amount": 99.5,
                "type": "expense",
                "category": "rent",
                "description": "TEST_Series updated",
            }
            r = client.put(f"{BASE_URL}/api/recurring/{rid}", json=body)
            assert r.status_code == 200, r.text
            updated = r.json()
            assert updated["id"] == rid
            assert updated["amount"] == 99.5
            assert updated["category"] == "rent"
            assert updated["description"] == "TEST_Series updated"
            # Frequency and start_date untouched
            assert updated["frequency"] == rule["frequency"]
            assert updated["start_date"][:10] == rule["start_date"][:10]

            # Cascade: every previously-materialized transaction reflects the change
            tx_r = client.get(f"{BASE_URL}/api/transactions")
            gen_after = [t for t in tx_r.json() if t.get("recurring_rule_id") == rid]
            assert len(gen_after) >= len(gen_before)
            for t in gen_after:
                assert t["amount"] == 99.5, f"row {t['id']} amount not cascaded"
                assert t["category"] == "rent"
                assert t["description"] == "TEST_Series updated"
                assert t["type"] == "expense"
        finally:
            client.delete(f"{BASE_URL}/api/recurring/{rid}?delete_generated=true")

    def test_put_recurring_partial_body_leaves_other_fields(self, client):
        rule, _ = self._create_rule_with_history(client)
        rid = rule["id"]
        try:
            # Only change amount
            r = client.put(f"{BASE_URL}/api/recurring/{rid}", json={"amount": 77.0})
            assert r.status_code == 200, r.text
            updated = r.json()
            assert updated["amount"] == 77.0
            assert updated["category"] == rule["category"]
            assert updated["description"] == rule["description"]
            assert updated["type"] == rule["type"]

            # Cascaded rows keep original description/category but new amount
            tx_r = client.get(f"{BASE_URL}/api/transactions")
            rows = [t for t in tx_r.json() if t.get("recurring_rule_id") == rid]
            for t in rows:
                assert t["amount"] == 77.0
                assert t["category"] == rule["category"]
                assert t["description"] == rule["description"]
        finally:
            client.delete(f"{BASE_URL}/api/recurring/{rid}?delete_generated=true")

    def test_put_recurring_missing_id_returns_404(self, client):
        r = client.put(
            f"{BASE_URL}/api/recurring/does-not-exist-xyz",
            json={"amount": 10.0},
        )
        assert r.status_code == 404

    def test_put_recurring_empty_body_returns_400(self, client):
        # Need a real rule so we get past the 404 check
        r = client.post(
            f"{BASE_URL}/api/recurring",
            json={
                "amount": 30.0,
                "type": "expense",
                "category": "food",
                "description": "TEST_Empty body",
                "frequency": "weekly",
            },
        )
        assert r.status_code == 200
        rid = r.json()["id"]
        try:
            resp = client.put(f"{BASE_URL}/api/recurring/{rid}", json={})
            assert resp.status_code == 400
            detail = resp.json().get("detail", "")
            assert "Nothing to update" in detail
        finally:
            client.delete(f"{BASE_URL}/api/recurring/{rid}?delete_generated=true")


# ---------- Regression: existing PATCH toggle + DELETE still work ----------
class TestRecurringUnchangedEndpoints:
    def test_patch_toggle_still_works(self, client):
        r = client.post(
            f"{BASE_URL}/api/recurring",
            json={
                "amount": 20.0,
                "type": "expense",
                "category": "food",
                "description": "TEST_Toggle regression",
                "frequency": "weekly",
            },
        )
        rid = r.json()["id"]
        try:
            resp = client.patch(f"{BASE_URL}/api/recurring/{rid}")
            assert resp.status_code == 200
            assert resp.json()["active"] is False
        finally:
            client.delete(f"{BASE_URL}/api/recurring/{rid}?delete_generated=true")

    def test_delete_with_delete_generated_still_removes_rows(self, client):
        past = (datetime.now() - timedelta(days=14)).strftime("%Y-%m-%d")
        r = client.post(
            f"{BASE_URL}/api/recurring",
            json={
                "amount": 15.0,
                "type": "expense",
                "category": "food",
                "description": "TEST_Delete regression",
                "frequency": "weekly",
                "start_date": past,
            },
        )
        rid = r.json()["id"]
        # Delete with cascade
        resp = client.delete(f"{BASE_URL}/api/recurring/{rid}?delete_generated=true")
        assert resp.status_code == 200
        # No rows for that rule
        tx = client.get(f"{BASE_URL}/api/transactions").json()
        assert [t for t in tx if t.get("recurring_rule_id") == rid] == []
