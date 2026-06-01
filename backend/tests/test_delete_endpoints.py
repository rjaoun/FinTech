"""
Test DELETE endpoints for transactions, goals, budgets, and recurring rules.
Iteration 5: Bug fix verification - no backend changes expected.
"""
import pytest
import requests
import os

BASE_URL = "https://fintech-app-v2.preview.emergentagent.com"

@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def auth_token(api_client):
    """Login and get auth token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@financefocus.app",
        "password": "admin123"
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    token = response.json()["access_token"]
    api_client.headers.update({"Authorization": f"Bearer {token}"})
    return token

class TestDeleteEndpoints:
    """Verify DELETE endpoints return correct status codes"""

    def test_delete_transaction(self, api_client, auth_token):
        """Create and delete a transaction"""
        # Create transaction
        create_response = api_client.post(f"{BASE_URL}/api/transactions", json={
            "amount": 50.0,
            "type": "expense",
            "category": "food",
            "description": "TEST_DELETE transaction",
            "date": "2026-04-19T12:00:00"
        })
        assert create_response.status_code == 200
        tx_id = create_response.json()["id"]
        
        # Delete transaction
        delete_response = api_client.delete(f"{BASE_URL}/api/transactions/{tx_id}")
        assert delete_response.status_code == 200
        
        # Verify deleted (should return 404)
        get_response = api_client.get(f"{BASE_URL}/api/transactions")
        transactions = get_response.json()
        assert not any(t["id"] == tx_id for t in transactions), "Transaction should be deleted"

    def test_delete_goal(self, api_client, auth_token):
        """Create and delete a goal"""
        # Create goal
        create_response = api_client.post(f"{BASE_URL}/api/goals", json={
            "title": "TEST_DELETE goal",
            "target_amount": 1000.0,
            "current_amount": 0,
            "deadline": None
        })
        assert create_response.status_code == 200
        goal_id = create_response.json()["id"]
        
        # Delete goal
        delete_response = api_client.delete(f"{BASE_URL}/api/goals/{goal_id}")
        assert delete_response.status_code == 200
        
        # Verify deleted
        get_response = api_client.get(f"{BASE_URL}/api/goals")
        goals = get_response.json()
        assert not any(g["id"] == goal_id for g in goals), "Goal should be deleted"

    def test_delete_budget(self, api_client, auth_token):
        """Create and delete a budget"""
        # Create budget
        create_response = api_client.post(f"{BASE_URL}/api/budgets", json={
            "category": "food",
            "amount": 500.0,
            "month": "2026-04"
        })
        assert create_response.status_code == 200
        budget_id = create_response.json()["id"]
        
        # Delete budget
        delete_response = api_client.delete(f"{BASE_URL}/api/budgets/{budget_id}")
        assert delete_response.status_code == 200
        
        # Verify deleted
        get_response = api_client.get(f"{BASE_URL}/api/budgets?month=2026-04")
        budgets = get_response.json()
        assert not any(b["id"] == budget_id for b in budgets), "Budget should be deleted"

    def test_delete_recurring_with_generated(self, api_client, auth_token):
        """Create and delete a recurring rule with delete_generated=true"""
        # Create recurring rule
        create_response = api_client.post(f"{BASE_URL}/api/recurring", json={
            "amount": 100.0,
            "type": "expense",
            "category": "food",
            "description": "TEST_DELETE recurring",
            "frequency": "monthly",
            "start_date": "2026-04-01T00:00:00",
            "end_date": None
        })
        assert create_response.status_code == 200
        rule_id = create_response.json()["id"]
        
        # Delete with delete_generated=true
        delete_response = api_client.delete(f"{BASE_URL}/api/recurring/{rule_id}?delete_generated=true")
        assert delete_response.status_code == 200
        
        # Verify deleted
        get_response = api_client.get(f"{BASE_URL}/api/recurring")
        rules = get_response.json()
        assert not any(r["id"] == rule_id for r in rules), "Recurring rule should be deleted"

    def test_delete_recurring_keep_history(self, api_client, auth_token):
        """Create and delete a recurring rule without deleting generated transactions"""
        # Create recurring rule
        create_response = api_client.post(f"{BASE_URL}/api/recurring", json={
            "amount": 75.0,
            "type": "income",
            "category": "salary",
            "description": "TEST_DELETE recurring keep history",
            "frequency": "weekly",
            "start_date": "2026-04-01T00:00:00",
            "end_date": None
        })
        assert create_response.status_code == 200
        rule_id = create_response.json()["id"]
        
        # Delete without delete_generated (defaults to false)
        delete_response = api_client.delete(f"{BASE_URL}/api/recurring/{rule_id}")
        assert delete_response.status_code == 200
        
        # Verify deleted
        get_response = api_client.get(f"{BASE_URL}/api/recurring")
        rules = get_response.json()
        assert not any(r["id"] == rule_id for r in rules), "Recurring rule should be deleted"

    def test_delete_nonexistent_returns_404(self, api_client, auth_token):
        """Verify deleting non-existent resource returns 404"""
        fake_id = "00000000-0000-0000-0000-000000000000"
        
        # Try to delete non-existent transaction
        response = api_client.delete(f"{BASE_URL}/api/transactions/{fake_id}")
        assert response.status_code == 404, "Should return 404 for non-existent transaction"
