"""
Tests for the new `paid` flag on transactions (iteration 7).
Covers:
- POST /transactions accepts optional `paid` (default True), persists it.
- PUT /transactions/{id} persists `paid` (does not overwrite to True if False supplied).
- PATCH /transactions/{id}/paid toggles value and returns updated doc.
- GET /transactions returns `paid` on every doc (including backfilled legacy).
"""
import pytest
import os


BASE = None  # filled in fixture


@pytest.fixture(scope="module")
def env(base_url, api_client, admin_token):
    global BASE
    BASE = base_url
    headers = {"Authorization": f"Bearer {admin_token}"}
    return {"base": base_url, "client": api_client, "headers": headers}


@pytest.fixture
def make_tx(env):
    created = []

    def _make(paid=None, **overrides):
        payload = {
            "amount": 12.34,
            "type": "expense",
            "category": "food",
            "description": "TEST_paid_flow",
        }
        payload.update(overrides)
        if paid is not None:
            payload["paid"] = paid
        r = env["client"].post(f"{env['base']}/api/transactions", json=payload, headers=env["headers"])
        assert r.status_code == 200, f"create failed: {r.status_code} {r.text}"
        doc = r.json()
        created.append(doc["id"])
        return doc

    yield _make

    # Cleanup
    for tid in created:
        env["client"].delete(f"{env['base']}/api/transactions/{tid}", headers=env["headers"])


class TestPaidCreate:
    def test_create_default_paid_true(self, make_tx):
        doc = make_tx()
        assert doc["paid"] is True, f"expected paid True by default, got {doc.get('paid')}"

    def test_create_paid_false_persists(self, make_tx, env):
        doc = make_tx(paid=False)
        assert doc["paid"] is False
        # Verify via list
        r = env["client"].get(f"{env['base']}/api/transactions", headers=env["headers"])
        assert r.status_code == 200
        found = next((t for t in r.json() if t["id"] == doc["id"]), None)
        assert found is not None
        assert found["paid"] is False


class TestPaidUpdate:
    def test_put_preserves_false(self, make_tx, env):
        """PUT with paid=false must NOT get flipped back to true."""
        doc = make_tx(paid=False)
        payload = {
            "amount": 22.22,
            "type": "expense",
            "category": "food",
            "description": "TEST_paid_flow_edited",
            "paid": False,
        }
        r = env["client"].put(f"{env['base']}/api/transactions/{doc['id']}", json=payload, headers=env["headers"])
        assert r.status_code == 200, r.text
        updated = r.json()
        assert updated["paid"] is False, f"PUT flipped paid False→{updated.get('paid')}"
        assert updated["amount"] == 22.22

    def test_put_can_flip_paid_true(self, make_tx, env):
        doc = make_tx(paid=False)
        payload = {
            "amount": doc["amount"],
            "type": doc["type"],
            "category": doc["category"],
            "description": doc["description"],
            "paid": True,
        }
        r = env["client"].put(f"{env['base']}/api/transactions/{doc['id']}", json=payload, headers=env["headers"])
        assert r.status_code == 200
        assert r.json()["paid"] is True


class TestPaidPatch:
    def test_patch_toggles_false(self, make_tx, env):
        doc = make_tx()  # default paid=True
        r = env["client"].patch(
            f"{env['base']}/api/transactions/{doc['id']}/paid",
            json={"paid": False},
            headers=env["headers"],
        )
        assert r.status_code == 200, r.text
        assert r.json()["paid"] is False

        # GET verify persistence
        rl = env["client"].get(f"{env['base']}/api/transactions", headers=env["headers"])
        got = next((t for t in rl.json() if t["id"] == doc["id"]), None)
        assert got and got["paid"] is False

    def test_patch_toggles_true(self, make_tx, env):
        doc = make_tx(paid=False)
        r = env["client"].patch(
            f"{env['base']}/api/transactions/{doc['id']}/paid",
            json={"paid": True},
            headers=env["headers"],
        )
        assert r.status_code == 200
        assert r.json()["paid"] is True

    def test_patch_nonexistent_returns_404(self, env):
        r = env["client"].patch(
            f"{env['base']}/api/transactions/does-not-exist/paid",
            json={"paid": True},
            headers=env["headers"],
        )
        assert r.status_code == 404


class TestListReturnsPaidField:
    def test_all_transactions_have_paid_field(self, make_tx, env):
        # Ensure at least one exists
        make_tx()
        r = env["client"].get(f"{env['base']}/api/transactions", headers=env["headers"])
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 0
        missing = [t["id"] for t in data if "paid" not in t]
        assert not missing, f"Transactions missing `paid` field: {missing[:5]}"
        # Type check: must be bool
        wrong_type = [t["id"] for t in data if not isinstance(t["paid"], bool)]
        assert not wrong_type, f"paid field not boolean: {wrong_type[:5]}"
