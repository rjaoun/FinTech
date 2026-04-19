"""
Budget endpoint tests
- POST /api/budgets (upsert)
- GET /api/budgets?month=YYYY-MM (includes 'spent' field)
- DELETE /api/budgets/{id}
"""
import pytest
import uuid
from datetime import datetime

class TestBudgets:
    """Budget CRUD tests"""

    def test_create_budget_and_verify(self, base_url, api_client, auth_headers):
        """POST /api/budgets creates budget with upsert behavior"""
        month = datetime.now().strftime("%Y-%m")
        payload = {
            "category": "food",
            "amount": 500.00,
            "month": month
        }
        
        # Create
        create_response = api_client.post(
            f"{base_url}/api/budgets",
            json=payload,
            headers=auth_headers
        )
        assert create_response.status_code == 200, f"Expected 200, got {create_response.status_code}: {create_response.text}"
        
        created = create_response.json()
        assert created["category"] == "food"
        assert created["amount"] == 500.00
        assert created["month"] == month
        assert "id" in created
        assert "user_id" in created
        
        # GET to verify
        get_response = api_client.get(
            f"{base_url}/api/budgets?month={month}",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        
        budgets = get_response.json()
        found = next((b for b in budgets if b["category"] == "food"), None)
        assert found is not None, "Budget not found in GET list"
        assert found["amount"] == 500.00

    def test_budget_includes_spent_field(self, base_url, api_client, auth_headers):
        """GET /api/budgets includes 'spent' field calculated from transactions"""
        month = datetime.now().strftime("%Y-%m")
        
        # Create budget
        api_client.post(
            f"{base_url}/api/budgets",
            json={
                "category": "transport",
                "amount": 200.00,
                "month": month
            },
            headers=auth_headers
        )
        
        # Create expense transaction in that category
        api_client.post(
            f"{base_url}/api/transactions",
            json={
                "amount": 50.00,
                "type": "expense",
                "category": "transport",
                "description": "TEST_Budget spent test"
            },
            headers=auth_headers
        )
        
        # GET budgets
        response = api_client.get(
            f"{base_url}/api/budgets?month={month}",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        budgets = response.json()
        transport_budget = next((b for b in budgets if b["category"] == "transport"), None)
        assert transport_budget is not None
        assert "spent" in transport_budget, "Budget should include 'spent' field"
        assert transport_budget["spent"] >= 50.00, "Spent should include test transaction"

    def test_budget_upsert_behavior(self, base_url, api_client, auth_headers):
        """POST /api/budgets with same (user, category, month) updates existing"""
        month = datetime.now().strftime("%Y-%m")
        
        # Create first budget
        api_client.post(
            f"{base_url}/api/budgets",
            json={
                "category": "shopping",
                "amount": 300.00,
                "month": month
            },
            headers=auth_headers
        )
        
        # Upsert with new amount
        upsert_response = api_client.post(
            f"{base_url}/api/budgets",
            json={
                "category": "shopping",
                "amount": 400.00,
                "month": month
            },
            headers=auth_headers
        )
        assert upsert_response.status_code == 200
        
        # Verify only one budget exists with updated amount
        get_response = api_client.get(
            f"{base_url}/api/budgets?month={month}",
            headers=auth_headers
        )
        budgets = get_response.json()
        shopping_budgets = [b for b in budgets if b["category"] == "shopping"]
        assert len(shopping_budgets) == 1, "Should have only one shopping budget (upsert)"
        assert shopping_budgets[0]["amount"] == 400.00, "Amount should be updated"

    def test_delete_budget(self, base_url, api_client, auth_headers):
        """DELETE /api/budgets/{id} removes budget"""
        month = datetime.now().strftime("%Y-%m")
        
        # Create
        create_response = api_client.post(
            f"{base_url}/api/budgets",
            json={
                "category": "entertainment",
                "amount": 150.00,
                "month": month
            },
            headers=auth_headers
        )
        budget_id = create_response.json()["id"]
        
        # Delete
        delete_response = api_client.delete(
            f"{base_url}/api/budgets/{budget_id}",
            headers=auth_headers
        )
        assert delete_response.status_code == 200
        assert delete_response.json()["ok"] is True
        
        # Verify deletion
        get_response = api_client.get(
            f"{base_url}/api/budgets?month={month}",
            headers=auth_headers
        )
        budgets = get_response.json()
        found = next((b for b in budgets if b["id"] == budget_id), None)
        assert found is None, "Budget should be deleted"

    def test_budgets_unauthenticated(self, base_url, api_client):
        """Budget endpoints without auth return 401"""
        month = datetime.now().strftime("%Y-%m")
        
        # POST
        post_response = api_client.post(
            f"{base_url}/api/budgets",
            json={"category": "food", "amount": 100, "month": month}
        )
        assert post_response.status_code == 401
        
        # GET
        get_response = api_client.get(f"{base_url}/api/budgets")
        assert get_response.status_code == 401
