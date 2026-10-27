# Iteration 13: verifies backend side of swipe-to-delete (single + recurring series) and AI insights with newer data
import os
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")


@pytest.fixture(scope="module")
def user_headers():
    """Fresh isolated user so AI insights operates on known data"""
    email = f"test_iter13_{uuid.uuid4().hex[:8]}@financefocus.app"
    r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "Test@1234", "name": "TEST Iter13"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _tx_ids(h):
    r = requests.get(f"{BASE_URL}/api/transactions", headers=h)
    assert r.status_code == 200
    return r.json()


# --- Single delete (non-recurring) ---
class TestSingleDelete:
    def test_delete_non_recurring(self, user_headers):
        r = requests.post(f"{BASE_URL}/api/transactions", headers=user_headers,
                          json={"amount": 12.5, "type": "expense", "category": "food", "description": "TEST_swipe_single"})
        assert r.status_code == 200
        tid = r.json()["id"]
        d = requests.delete(f"{BASE_URL}/api/transactions/{tid}", headers=user_headers)
        assert d.status_code == 200
        assert tid not in [t["id"] for t in _tx_ids(user_headers)]

    def test_delete_missing_404(self, user_headers):
        d = requests.delete(f"{BASE_URL}/api/transactions/does-not-exist", headers=user_headers)
        assert d.status_code == 404


# --- Recurring delete: just-this-one vs whole series ---
class TestRecurringDelete:
    def _make_rule(self, h, desc):
        start = (date.today() - timedelta(days=21)).isoformat()
        r = requests.post(f"{BASE_URL}/api/recurring", headers=h, json={
            "amount": 9.99, "type": "expense", "category": "bills", "description": desc,
            "frequency": "weekly", "start_date": start})
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        gen = [t for t in _tx_ids(h) if t.get("recurring_rule_id") == rid]
        assert len(gen) >= 3, f"expected >=3 materialized, got {len(gen)}"
        return rid, gen

    def test_delete_just_one(self, user_headers):
        rid, gen = self._make_rule(user_headers, "TEST_rec_one")
        target = gen[0]["id"]
        assert requests.delete(f"{BASE_URL}/api/transactions/{target}", headers=user_headers).status_code == 200
        remaining = [t for t in _tx_ids(user_headers) if t.get("recurring_rule_id") == rid]
        assert target not in [t["id"] for t in remaining]
        assert len(remaining) == len(gen) - 1
        # deleted instance must not be re-materialized after list call
        remaining2 = [t for t in _tx_ids(user_headers) if t.get("recurring_rule_id") == rid]
        assert len(remaining2) == len(gen) - 1
        requests.delete(f"{BASE_URL}/api/recurring/{rid}?delete_generated=true", headers=user_headers)

    def test_delete_series(self, user_headers):
        rid, gen = self._make_rule(user_headers, "TEST_rec_series")
        d = requests.delete(f"{BASE_URL}/api/recurring/{rid}?delete_generated=true", headers=user_headers)
        assert d.status_code == 200
        assert not [t for t in _tx_ids(user_headers) if t.get("recurring_rule_id") == rid]
        rules = requests.get(f"{BASE_URL}/api/recurring", headers=user_headers).json()
        assert rid not in [x["id"] for x in rules]


# --- AI insights with credit cards, unpaid flags and recurring data ---
class TestAIInsightsNewData:
    def test_insights_with_rich_data(self, user_headers):
        h = user_headers
        requests.post(f"{BASE_URL}/api/credit-cards", headers=h, json={"name": "TEST_Visa", "balance": 1200, "credit_limit": 5000, "apr": 22.9, "statement_day": 15})
        requests.post(f"{BASE_URL}/api/transactions", headers=h, json={"amount": 3000, "type": "income", "category": "salary", "description": "TEST salary"})
        requests.post(f"{BASE_URL}/api/transactions", headers=h, json={"amount": 80, "type": "expense", "category": "food", "description": "TEST groceries", "paid": False})
        requests.post(f"{BASE_URL}/api/transactions", headers=h, json={"amount": 45, "type": "expense", "category": "transport", "description": "TEST uber"})
        requests.post(f"{BASE_URL}/api/recurring", headers=h, json={"amount": 15.99, "type": "expense", "category": "entertainment", "description": "TEST Netflix", "frequency": "monthly", "start_date": (date.today() - timedelta(days=40)).isoformat()})
        r = requests.post(f"{BASE_URL}/api/ai/insights", headers=h, timeout=90)
        assert r.status_code == 200
        data = r.json()
        assert not data.get("fallback"), f"AI fell back: {data.get('error')}"
        assert isinstance(data["summary"], str) and data["summary"]
        assert isinstance(data["top_categories"], list)
        assert isinstance(data["tips"], list) and data["tips"]

    def test_suggest_category(self, user_headers):
        r = requests.post(f"{BASE_URL}/api/ai/suggest-category", headers=user_headers, json={"description": "Starbucks latte", "amount": 5}, timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert "error" not in d, d
        assert d["category"] and d["confidence"] > 0
