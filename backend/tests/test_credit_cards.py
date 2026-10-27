"""Backend tests for Credit Cards CRUD endpoints."""
import pytest
import requests
import uuid


@pytest.fixture(scope="module")
def second_user_token(base_url, api_client):
    """Register a second isolated user for isolation tests."""
    email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
    r = api_client.post(
        f"{base_url}/api/auth/register",
        json={"email": email, "password": "Test@1234", "name": "Second User"},
    )
    if r.status_code != 200:
        pytest.skip(f"Second user registration failed: {r.status_code} {r.text}")
    return r.json()["access_token"]


@pytest.fixture
def second_headers(second_user_token):
    return {"Authorization": f"Bearer {second_user_token}"}


# ---------- Auth required ----------
class TestCreditCardAuth:
    def test_list_requires_auth(self, base_url, api_client):
        r = api_client.get(f"{base_url}/api/credit-cards")
        assert r.status_code == 401

    def test_create_requires_auth(self, base_url, api_client):
        r = api_client.post(f"{base_url}/api/credit-cards", json={})
        assert r.status_code == 401

    def test_update_requires_auth(self, base_url, api_client):
        r = api_client.put(f"{base_url}/api/credit-cards/does-not-exist", json={})
        assert r.status_code == 401

    def test_delete_requires_auth(self, base_url, api_client):
        r = api_client.delete(f"{base_url}/api/credit-cards/does-not-exist")
        assert r.status_code == 401


# ---------- CRUD happy path ----------
class TestCreditCardCRUD:
    created_ids: list = []

    def test_create_card(self, base_url, api_client, auth_headers):
        payload = {
            "name": "TEST Chase Sapphire",
            "balance": 2500.0,
            "credit_limit": 10000.0,
            "apr": 22.99,
            "statement_day": 15,
            "min_payment_percent": 2.0,
            "min_payment_floor": 25.0,
            "color": "#1E3F32",
        }
        r = api_client.post(f"{base_url}/api/credit-cards", json=payload, headers=auth_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == payload["name"]
        assert data["balance"] == payload["balance"]
        assert data["apr"] == payload["apr"]
        assert data["statement_day"] == payload["statement_day"]
        assert "id" in data and "user_id" in data and "created_at" in data
        TestCreditCardCRUD.created_ids.append(data["id"])

    def test_list_cards_sorted_desc(self, base_url, api_client, auth_headers):
        # Create a second card to verify ordering
        payload = {
            "name": "TEST Amex Gold",
            "balance": 500.0,
            "apr": 19.99,
            "statement_day": 5,
        }
        r = api_client.post(f"{base_url}/api/credit-cards", json=payload, headers=auth_headers)
        assert r.status_code == 200
        second_id = r.json()["id"]
        TestCreditCardCRUD.created_ids.append(second_id)

        r = api_client.get(f"{base_url}/api/credit-cards", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # Only our TEST cards
        test_items = [c for c in data if c["name"].startswith("TEST ")]
        assert len(test_items) >= 2
        # Verify desc order by created_at
        for i in range(len(test_items) - 1):
            assert test_items[i]["created_at"] >= test_items[i + 1]["created_at"]
        # Second card most recent should be first
        assert test_items[0]["id"] == second_id

    def test_update_card_partial(self, base_url, api_client, auth_headers):
        cid = TestCreditCardCRUD.created_ids[0]
        r = api_client.put(
            f"{base_url}/api/credit-cards/{cid}",
            json={"balance": 1800.0, "apr": 18.5},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["balance"] == 1800.0
        assert data["apr"] == 18.5
        # Unchanged fields preserved
        assert data["statement_day"] == 15

        # GET verify persistence
        r = api_client.get(f"{base_url}/api/credit-cards", headers=auth_headers)
        card = next(c for c in r.json() if c["id"] == cid)
        assert card["balance"] == 1800.0
        assert card["apr"] == 18.5

    def test_update_empty_body_returns_400(self, base_url, api_client, auth_headers):
        cid = TestCreditCardCRUD.created_ids[0]
        r = api_client.put(f"{base_url}/api/credit-cards/{cid}", json={}, headers=auth_headers)
        assert r.status_code == 400
        assert "Nothing to update" in r.json().get("detail", "")

    def test_update_missing_card_returns_404(self, base_url, api_client, auth_headers):
        r = api_client.put(
            f"{base_url}/api/credit-cards/nonexistent-{uuid.uuid4().hex}",
            json={"balance": 100.0},
            headers=auth_headers,
        )
        assert r.status_code == 404

    def test_delete_missing_card_returns_404(self, base_url, api_client, auth_headers):
        r = api_client.delete(
            f"{base_url}/api/credit-cards/nonexistent-{uuid.uuid4().hex}",
            headers=auth_headers,
        )
        assert r.status_code == 404

    def test_delete_card(self, base_url, api_client, auth_headers):
        # Pop one id, delete it, then verify GET no longer returns it
        cid = TestCreditCardCRUD.created_ids.pop()
        r = api_client.delete(f"{base_url}/api/credit-cards/{cid}", headers=auth_headers)
        assert r.status_code == 200
        assert r.json().get("ok") is True

        r = api_client.get(f"{base_url}/api/credit-cards", headers=auth_headers)
        ids = [c["id"] for c in r.json()]
        assert cid not in ids

    @classmethod
    def teardown_class(cls):
        import os
        base = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
        # Login fresh
        tok = requests.post(
            f"{base}/api/auth/login",
            json={"email": "admin@financefocus.app", "password": "admin123"},
        ).json().get("access_token")
        if not tok:
            return
        headers = {"Authorization": f"Bearer {tok}"}
        for cid in cls.created_ids:
            requests.delete(f"{base}/api/credit-cards/{cid}", headers=headers)
        # Also clean up any lingering TEST_ named cards
        r = requests.get(f"{base}/api/credit-cards", headers=headers)
        if r.status_code == 200:
            for c in r.json():
                if c["name"].startswith("TEST "):
                    requests.delete(f"{base}/api/credit-cards/{c['id']}", headers=headers)


# ---------- Validation ----------
class TestCreditCardValidation:
    def test_apr_above_100_rejected(self, base_url, api_client, auth_headers):
        r = api_client.post(
            f"{base_url}/api/credit-cards",
            json={"name": "x", "balance": 10, "apr": 150, "statement_day": 10},
            headers=auth_headers,
        )
        assert r.status_code == 422

    def test_apr_negative_rejected(self, base_url, api_client, auth_headers):
        r = api_client.post(
            f"{base_url}/api/credit-cards",
            json={"name": "x", "balance": 10, "apr": -1, "statement_day": 10},
            headers=auth_headers,
        )
        assert r.status_code == 422

    def test_statement_day_zero_rejected(self, base_url, api_client, auth_headers):
        r = api_client.post(
            f"{base_url}/api/credit-cards",
            json={"name": "x", "balance": 10, "apr": 20, "statement_day": 0},
            headers=auth_headers,
        )
        assert r.status_code == 422

    def test_statement_day_29_rejected(self, base_url, api_client, auth_headers):
        r = api_client.post(
            f"{base_url}/api/credit-cards",
            json={"name": "x", "balance": 10, "apr": 20, "statement_day": 29},
            headers=auth_headers,
        )
        assert r.status_code == 422

    def test_balance_negative_rejected(self, base_url, api_client, auth_headers):
        r = api_client.post(
            f"{base_url}/api/credit-cards",
            json={"name": "x", "balance": -10, "apr": 20, "statement_day": 10},
            headers=auth_headers,
        )
        assert r.status_code == 422

    def test_min_payment_pct_above_100_rejected(self, base_url, api_client, auth_headers):
        r = api_client.post(
            f"{base_url}/api/credit-cards",
            json={
                "name": "x", "balance": 10, "apr": 20, "statement_day": 10,
                "min_payment_percent": 150,
            },
            headers=auth_headers,
        )
        assert r.status_code == 422

    def test_min_payment_floor_negative_rejected(self, base_url, api_client, auth_headers):
        r = api_client.post(
            f"{base_url}/api/credit-cards",
            json={
                "name": "x", "balance": 10, "apr": 20, "statement_day": 10,
                "min_payment_floor": -5,
            },
            headers=auth_headers,
        )
        assert r.status_code == 422


# ---------- Isolation ----------
class TestCreditCardIsolation:
    def test_second_user_cannot_see_first_cards(
        self, base_url, api_client, auth_headers, second_headers
    ):
        # Admin creates a card
        r = api_client.post(
            f"{base_url}/api/credit-cards",
            json={
                "name": "TEST Isolation Card",
                "balance": 100.0,
                "apr": 15.0,
                "statement_day": 10,
            },
            headers=auth_headers,
        )
        assert r.status_code == 200
        cid = r.json()["id"]

        try:
            # Second user lists — shouldn't see admin's card
            r2 = api_client.get(f"{base_url}/api/credit-cards", headers=second_headers)
            assert r2.status_code == 200
            ids = [c["id"] for c in r2.json()]
            assert cid not in ids

            # Second user cannot update admin's card
            r3 = api_client.put(
                f"{base_url}/api/credit-cards/{cid}",
                json={"balance": 1.0},
                headers=second_headers,
            )
            assert r3.status_code == 404

            # Second user cannot delete admin's card
            r4 = api_client.delete(
                f"{base_url}/api/credit-cards/{cid}", headers=second_headers
            )
            assert r4.status_code == 404
        finally:
            api_client.delete(f"{base_url}/api/credit-cards/{cid}", headers=auth_headers)
