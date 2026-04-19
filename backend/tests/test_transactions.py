"""
Transaction CRUD tests
- POST /api/transactions
- GET /api/transactions
- DELETE /api/transactions/{id}
- PUT /api/transactions/{id}
"""
import pytest
import uuid

class TestTransactionCRUD:
    """Transaction CRUD with Create→GET verification"""

    def test_create_transaction_and_verify(self, base_url, api_client, auth_headers):
        """Create a transaction and verify it persists"""
        payload = {
            "amount": 50.00,
            "type": "expense",
            "category": "food",
            "description": "TEST_Lunch at cafe",
            "date": "2026-04-19T12:00:00Z"
        }
        
        # Create
        create_response = api_client.post(
            f"{base_url}/api/transactions",
            json=payload,
            headers=auth_headers
        )
        assert create_response.status_code == 200, f"Expected 200, got {create_response.status_code}: {create_response.text}"
        
        created = create_response.json()
        assert created["amount"] == 50.00
        assert created["type"] == "expense"
        assert created["category"] == "food"
        assert created["description"] == "TEST_Lunch at cafe"
        assert "id" in created
        assert "user_id" in created
        assert "created_at" in created
        
        tx_id = created["id"]
        
        # GET to verify persistence
        get_response = api_client.get(
            f"{base_url}/api/transactions",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        
        transactions = get_response.json()
        found = next((t for t in transactions if t["id"] == tx_id), None)
        assert found is not None, f"Transaction {tx_id} not found in GET list"
        assert found["amount"] == 50.00
        assert found["category"] == "food"

    def test_list_transactions(self, base_url, api_client, auth_headers):
        """GET /api/transactions returns list"""
        response = api_client.get(
            f"{base_url}/api/transactions",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list of transactions"

    def test_list_transactions_filter_by_type(self, base_url, api_client, auth_headers):
        """GET /api/transactions?type=income filters correctly"""
        # Create income transaction
        api_client.post(
            f"{base_url}/api/transactions",
            json={
                "amount": 1000.00,
                "type": "income",
                "category": "salary",
                "description": "TEST_Monthly salary"
            },
            headers=auth_headers
        )
        
        response = api_client.get(
            f"{base_url}/api/transactions?type=income",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        transactions = response.json()
        for tx in transactions:
            assert tx["type"] == "income", f"Expected income, got {tx['type']}"

    def test_delete_transaction(self, base_url, api_client, auth_headers):
        """DELETE /api/transactions/{id} removes transaction"""
        # Create
        create_response = api_client.post(
            f"{base_url}/api/transactions",
            json={
                "amount": 25.00,
                "type": "expense",
                "category": "transport",
                "description": "TEST_Bus fare"
            },
            headers=auth_headers
        )
        tx_id = create_response.json()["id"]
        
        # Delete
        delete_response = api_client.delete(
            f"{base_url}/api/transactions/{tx_id}",
            headers=auth_headers
        )
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}"
        assert delete_response.json()["ok"] is True
        
        # Verify deletion - should not appear in list
        get_response = api_client.get(
            f"{base_url}/api/transactions",
            headers=auth_headers
        )
        transactions = get_response.json()
        found = next((t for t in transactions if t["id"] == tx_id), None)
        assert found is None, f"Transaction {tx_id} should be deleted but still exists"

    def test_delete_nonexistent_transaction(self, base_url, api_client, auth_headers):
        """DELETE non-existent transaction returns 404"""
        fake_id = str(uuid.uuid4())
        response = api_client.delete(
            f"{base_url}/api/transactions/{fake_id}",
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404 for non-existent transaction, got {response.status_code}"

    def test_update_transaction(self, base_url, api_client, auth_headers):
        """PUT /api/transactions/{id} updates transaction"""
        # Create
        create_response = api_client.post(
            f"{base_url}/api/transactions",
            json={
                "amount": 30.00,
                "type": "expense",
                "category": "food",
                "description": "TEST_Original description"
            },
            headers=auth_headers
        )
        tx_id = create_response.json()["id"]
        
        # Update
        update_response = api_client.put(
            f"{base_url}/api/transactions/{tx_id}",
            json={
                "amount": 35.00,
                "type": "expense",
                "category": "shopping",
                "description": "TEST_Updated description"
            },
            headers=auth_headers
        )
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}"
        
        updated = update_response.json()
        assert updated["amount"] == 35.00
        assert updated["category"] == "shopping"
        assert updated["description"] == "TEST_Updated description"
        
        # GET to verify update persisted
        get_response = api_client.get(
            f"{base_url}/api/transactions",
            headers=auth_headers
        )
        transactions = get_response.json()
        found = next((t for t in transactions if t["id"] == tx_id), None)
        assert found is not None
        assert found["amount"] == 35.00
        assert found["category"] == "shopping"


class TestTransactionDateField:
    """Transaction date field tests (new feature)"""

    def test_create_transaction_with_explicit_date(self, base_url, api_client, auth_headers):
        """POST /api/transactions with explicit date stores that date, not today's date"""
        explicit_date = "2026-03-15T00:00:00+00:00"
        payload = {
            "amount": 42.50,
            "type": "expense",
            "category": "food",
            "description": "TEST_Coffee with friend",
            "date": explicit_date
        }
        
        # Create with explicit date
        create_response = api_client.post(
            f"{base_url}/api/transactions",
            json=payload,
            headers=auth_headers
        )
        assert create_response.status_code == 200, f"Expected 200, got {create_response.status_code}: {create_response.text}"
        
        created = create_response.json()
        assert created["date"] == explicit_date, f"Expected date {explicit_date}, got {created['date']}"
        assert created["description"] == "TEST_Coffee with friend"
        
        tx_id = created["id"]
        
        # GET to verify date persisted correctly
        get_response = api_client.get(
            f"{base_url}/api/transactions",
            headers=auth_headers
        )
        transactions = get_response.json()
        found = next((t for t in transactions if t["id"] == tx_id), None)
        assert found is not None
        assert found["date"] == explicit_date, f"Date not persisted correctly. Expected {explicit_date}, got {found['date']}"

    def test_update_transaction_date(self, base_url, api_client, auth_headers):
        """PUT /api/transactions/{id} updates date field"""
        # Create transaction with one date
        create_response = api_client.post(
            f"{base_url}/api/transactions",
            json={
                "amount": 100.00,
                "type": "expense",
                "category": "shopping",
                "description": "TEST_Original purchase",
                "date": "2026-01-10T00:00:00+00:00"
            },
            headers=auth_headers
        )
        tx_id = create_response.json()["id"]
        
        # Update with new date
        new_date = "2026-02-20T00:00:00+00:00"
        update_response = api_client.put(
            f"{base_url}/api/transactions/{tx_id}",
            json={
                "amount": 120.00,
                "type": "expense",
                "category": "shopping",
                "description": "TEST_Updated purchase",
                "date": new_date
            },
            headers=auth_headers
        )
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}"
        
        updated = update_response.json()
        assert updated["date"] == new_date, f"Date not updated. Expected {new_date}, got {updated['date']}"
        assert updated["amount"] == 120.00
        assert updated["description"] == "TEST_Updated purchase"
        
        # GET to verify update persisted
        get_response = api_client.get(
            f"{base_url}/api/transactions",
            headers=auth_headers
        )
        transactions = get_response.json()
        found = next((t for t in transactions if t["id"] == tx_id), None)
        assert found is not None
        assert found["date"] == new_date


class TestTransactionOwnership:
    """Transaction ownership and authorization tests"""

    def test_update_other_users_transaction_returns_404(self, base_url, api_client, auth_headers):
        """PUT /api/transactions/{id} returns 404 for other user's transaction"""
        # Use a fake UUID that won't belong to admin user
        fake_id = str(uuid.uuid4())
        
        response = api_client.put(
            f"{base_url}/api/transactions/{fake_id}",
            json={
                "amount": 50.00,
                "type": "expense",
                "category": "food",
                "description": "TEST_Attempt to update"
            },
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404 for other user's transaction, got {response.status_code}"

    def test_delete_other_users_transaction_returns_404(self, base_url, api_client, auth_headers):
        """DELETE /api/transactions/{id} returns 404 for other user's transaction"""
        fake_id = str(uuid.uuid4())
        
        response = api_client.delete(
            f"{base_url}/api/transactions/{fake_id}",
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404 for other user's transaction, got {response.status_code}"


class TestTransactionAuth:
    """Transaction endpoint authorization tests"""

    def test_create_transaction_without_auth(self, base_url, api_client):
        """POST /api/transactions without auth returns 401"""
        response = api_client.post(
            f"{base_url}/api/transactions",
            json={
                "amount": 10.00,
                "type": "expense",
                "category": "food",
                "description": "Test"
            }
        )
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"

    def test_list_transactions_without_auth(self, base_url, api_client):
        """GET /api/transactions without auth returns 401"""
        response = api_client.get(f"{base_url}/api/transactions")
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
