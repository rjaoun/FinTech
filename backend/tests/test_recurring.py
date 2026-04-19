"""
Backend tests for recurring transactions feature
Tests: POST /api/recurring, GET /api/recurring, PATCH /api/recurring/{id}, DELETE /api/recurring/{id}
Tests all frequencies: daily, weekly, biweekly, monthly, quarterly, yearly
"""
import pytest
import requests
import os
from datetime import datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv

# Load frontend .env to get EXPO_PUBLIC_BACKEND_URL
frontend_env = Path(__file__).parent.parent.parent / "frontend" / ".env"
load_dotenv(frontend_env)

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'http://localhost:8001').rstrip('/')

@pytest.fixture
def auth_token():
    """Login as admin and return Bearer token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@financefocus.app",
        "password": "admin123"
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    return data["access_token"]

@pytest.fixture
def api_client(auth_token):
    """Authenticated requests session"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session

class TestRecurringCreate:
    """Test POST /api/recurring with different frequencies"""

    def test_create_weekly_with_past_date_materializes_transactions(self, api_client):
        """Create weekly recurring rule with past start_date, verify multiple transactions created"""
        # Use a past date (3 weeks ago) to trigger materialization
        past_date = (datetime.now() - timedelta(days=21)).strftime("%Y-%m-%d")
        
        payload = {
            "amount": 50.0,
            "type": "expense",
            "category": "food",
            "description": "TEST_Weekly groceries",
            "frequency": "weekly",
            "start_date": past_date
        }
        
        # Create recurring rule
        create_response = api_client.post(f"{BASE_URL}/api/recurring", json=payload)
        assert create_response.status_code == 200, f"Failed to create recurring: {create_response.text}"
        
        rule = create_response.json()
        assert rule["frequency"] == "weekly"
        assert rule["active"] is True
        assert "id" in rule
        assert "next_date" in rule
        rule_id = rule["id"]
        
        # Verify transactions were materialized (should have ~3 instances)
        tx_response = api_client.get(f"{BASE_URL}/api/transactions")
        assert tx_response.status_code == 200
        
        transactions = tx_response.json()
        recurring_txs = [t for t in transactions if t.get("recurring_rule_id") == rule_id]
        
        # Should have created at least 2 transactions (3 weeks = 3 instances, but depends on timing)
        assert len(recurring_txs) >= 2, f"Expected at least 2 materialized transactions, got {len(recurring_txs)}"
        
        # Verify all have recurring_rule_id
        for tx in recurring_txs:
            assert tx["recurring_rule_id"] == rule_id
            assert tx["amount"] == 50.0
            assert tx["type"] == "expense"
            assert tx["category"] == "food"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/recurring/{rule_id}?delete_generated=true")

    def test_create_daily_frequency(self, api_client):
        """Test daily frequency creates rule correctly"""
        payload = {
            "amount": 10.0,
            "type": "expense",
            "category": "transport",
            "description": "TEST_Daily commute",
            "frequency": "daily"
        }
        
        response = api_client.post(f"{BASE_URL}/api/recurring", json=payload)
        assert response.status_code == 200
        
        rule = response.json()
        assert rule["frequency"] == "daily"
        assert rule["amount"] == 10.0
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/recurring/{rule['id']}?delete_generated=true")

    def test_create_biweekly_frequency(self, api_client):
        """Test biweekly frequency"""
        payload = {
            "amount": 100.0,
            "type": "expense",
            "category": "bills",
            "description": "TEST_Biweekly rent",
            "frequency": "biweekly"
        }
        
        response = api_client.post(f"{BASE_URL}/api/recurring", json=payload)
        assert response.status_code == 200
        
        rule = response.json()
        assert rule["frequency"] == "biweekly"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/recurring/{rule['id']}?delete_generated=true")

    def test_create_monthly_frequency(self, api_client):
        """Test monthly frequency"""
        payload = {
            "amount": 1500.0,
            "type": "income",
            "category": "salary",
            "description": "TEST_Monthly salary",
            "frequency": "monthly"
        }
        
        response = api_client.post(f"{BASE_URL}/api/recurring", json=payload)
        assert response.status_code == 200
        
        rule = response.json()
        assert rule["frequency"] == "monthly"
        assert rule["type"] == "income"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/recurring/{rule['id']}?delete_generated=true")

    def test_create_quarterly_frequency(self, api_client):
        """Test quarterly frequency"""
        payload = {
            "amount": 300.0,
            "type": "expense",
            "category": "bills",
            "description": "TEST_Quarterly insurance",
            "frequency": "quarterly"
        }
        
        response = api_client.post(f"{BASE_URL}/api/recurring", json=payload)
        assert response.status_code == 200
        
        rule = response.json()
        assert rule["frequency"] == "quarterly"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/recurring/{rule['id']}?delete_generated=true")

    def test_create_yearly_frequency(self, api_client):
        """Test yearly frequency"""
        payload = {
            "amount": 1200.0,
            "type": "expense",
            "category": "bills",
            "description": "TEST_Yearly subscription",
            "frequency": "yearly"
        }
        
        response = api_client.post(f"{BASE_URL}/api/recurring", json=payload)
        assert response.status_code == 200
        
        rule = response.json()
        assert rule["frequency"] == "yearly"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/recurring/{rule['id']}?delete_generated=true")

    def test_create_without_start_date_defaults_to_today(self, api_client):
        """Test that omitting start_date defaults to today"""
        payload = {
            "amount": 25.0,
            "type": "expense",
            "category": "food",
            "description": "TEST_No start date",
            "frequency": "weekly"
        }
        
        response = api_client.post(f"{BASE_URL}/api/recurring", json=payload)
        assert response.status_code == 200
        
        rule = response.json()
        today = datetime.now().strftime("%Y-%m-%d")
        assert rule["start_date"][:10] == today
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/recurring/{rule['id']}?delete_generated=true")


class TestRecurringList:
    """Test GET /api/recurring"""

    def test_list_recurring_returns_active_rules(self, api_client):
        """Test listing recurring rules"""
        # Create a rule first
        payload = {
            "amount": 50.0,
            "type": "expense",
            "category": "food",
            "description": "TEST_List test",
            "frequency": "weekly"
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/recurring", json=payload)
        assert create_response.status_code == 200
        rule_id = create_response.json()["id"]
        
        # List rules
        list_response = api_client.get(f"{BASE_URL}/api/recurring")
        assert list_response.status_code == 200
        
        rules = list_response.json()
        assert isinstance(rules, list)
        
        # Find our rule
        our_rule = next((r for r in rules if r["id"] == rule_id), None)
        assert our_rule is not None
        assert our_rule["amount"] == 50.0
        assert our_rule["frequency"] == "weekly"
        assert "next_date" in our_rule
        assert our_rule["active"] is True
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/recurring/{rule_id}?delete_generated=true")

    def test_list_recurring_includes_next_date(self, api_client):
        """Verify next_date is populated in list response"""
        payload = {
            "amount": 100.0,
            "type": "income",
            "category": "salary",
            "description": "TEST_Next date check",
            "frequency": "monthly"
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/recurring", json=payload)
        rule_id = create_response.json()["id"]
        
        list_response = api_client.get(f"{BASE_URL}/api/recurring")
        rules = list_response.json()
        
        our_rule = next((r for r in rules if r["id"] == rule_id), None)
        assert our_rule is not None
        assert "next_date" in our_rule
        assert our_rule["next_date"] is not None
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/recurring/{rule_id}?delete_generated=true")


class TestRecurringToggle:
    """Test PATCH /api/recurring/{id} for toggling active status"""

    def test_toggle_active_to_inactive(self, api_client):
        """Test toggling active=true to active=false"""
        # Create rule
        payload = {
            "amount": 50.0,
            "type": "expense",
            "category": "food",
            "description": "TEST_Toggle test",
            "frequency": "weekly"
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/recurring", json=payload)
        rule = create_response.json()
        rule_id = rule["id"]
        assert rule["active"] is True
        
        # Toggle to inactive
        toggle_response = api_client.patch(f"{BASE_URL}/api/recurring/{rule_id}")
        assert toggle_response.status_code == 200
        
        toggled_rule = toggle_response.json()
        assert toggled_rule["active"] is False
        
        # Verify via GET
        get_response = api_client.get(f"{BASE_URL}/api/recurring")
        rules = get_response.json()
        our_rule = next((r for r in rules if r["id"] == rule_id), None)
        assert our_rule["active"] is False
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/recurring/{rule_id}?delete_generated=true")

    def test_toggle_inactive_to_active(self, api_client):
        """Test toggling active=false back to active=true"""
        # Create and toggle to inactive
        payload = {
            "amount": 50.0,
            "type": "expense",
            "category": "food",
            "description": "TEST_Toggle back",
            "frequency": "weekly"
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/recurring", json=payload)
        rule_id = create_response.json()["id"]
        
        # First toggle (active -> inactive)
        api_client.patch(f"{BASE_URL}/api/recurring/{rule_id}")
        
        # Second toggle (inactive -> active)
        toggle_response = api_client.patch(f"{BASE_URL}/api/recurring/{rule_id}")
        assert toggle_response.status_code == 200
        
        toggled_rule = toggle_response.json()
        assert toggled_rule["active"] is True
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/recurring/{rule_id}?delete_generated=true")


class TestRecurringDelete:
    """Test DELETE /api/recurring/{id}"""

    def test_delete_rule_keeps_generated_transactions(self, api_client):
        """Test deleting rule without delete_generated keeps transactions"""
        # Create rule with past date to generate transactions
        past_date = (datetime.now() - timedelta(days=14)).strftime("%Y-%m-%d")
        payload = {
            "amount": 50.0,
            "type": "expense",
            "category": "food",
            "description": "TEST_Delete keep history",
            "frequency": "weekly",
            "start_date": past_date
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/recurring", json=payload)
        rule_id = create_response.json()["id"]
        
        # Get transactions before delete
        tx_response = api_client.get(f"{BASE_URL}/api/transactions")
        transactions_before = tx_response.json()
        recurring_txs_before = [t for t in transactions_before if t.get("recurring_rule_id") == rule_id]
        assert len(recurring_txs_before) >= 1, "Should have generated at least 1 transaction"
        
        # Delete rule WITHOUT delete_generated
        delete_response = api_client.delete(f"{BASE_URL}/api/recurring/{rule_id}")
        assert delete_response.status_code == 200
        
        # Verify rule is gone
        list_response = api_client.get(f"{BASE_URL}/api/recurring")
        rules = list_response.json()
        assert not any(r["id"] == rule_id for r in rules)
        
        # Verify transactions still exist
        tx_response_after = api_client.get(f"{BASE_URL}/api/transactions")
        transactions_after = tx_response_after.json()
        recurring_txs_after = [t for t in transactions_after if t.get("recurring_rule_id") == rule_id]
        assert len(recurring_txs_after) == len(recurring_txs_before), "Transactions should still exist"
        
        # Cleanup transactions manually
        for tx in recurring_txs_after:
            api_client.delete(f"{BASE_URL}/api/transactions/{tx['id']}")

    def test_delete_rule_with_delete_generated_removes_transactions(self, api_client):
        """Test deleting rule with delete_generated=true removes all generated transactions"""
        # Create rule with past date
        past_date = (datetime.now() - timedelta(days=14)).strftime("%Y-%m-%d")
        payload = {
            "amount": 50.0,
            "type": "expense",
            "category": "food",
            "description": "TEST_Delete everything",
            "frequency": "weekly",
            "start_date": past_date
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/recurring", json=payload)
        rule_id = create_response.json()["id"]
        
        # Verify transactions were created
        tx_response = api_client.get(f"{BASE_URL}/api/transactions")
        transactions_before = tx_response.json()
        recurring_txs_before = [t for t in transactions_before if t.get("recurring_rule_id") == rule_id]
        assert len(recurring_txs_before) >= 1
        
        # Delete rule WITH delete_generated=true
        delete_response = api_client.delete(f"{BASE_URL}/api/recurring/{rule_id}?delete_generated=true")
        assert delete_response.status_code == 200
        
        # Verify rule is gone
        list_response = api_client.get(f"{BASE_URL}/api/recurring")
        rules = list_response.json()
        assert not any(r["id"] == rule_id for r in rules)
        
        # Verify transactions are also gone
        tx_response_after = api_client.get(f"{BASE_URL}/api/transactions")
        transactions_after = tx_response_after.json()
        recurring_txs_after = [t for t in transactions_after if t.get("recurring_rule_id") == rule_id]
        assert len(recurring_txs_after) == 0, "All generated transactions should be deleted"

    def test_delete_nonexistent_rule_returns_404(self, api_client):
        """Test deleting non-existent rule returns 404"""
        fake_id = "nonexistent-rule-id-12345"
        delete_response = api_client.delete(f"{BASE_URL}/api/recurring/{fake_id}")
        assert delete_response.status_code == 404


class TestRecurringIntegration:
    """Test integration with existing endpoints"""

    def test_transactions_endpoint_includes_recurring_rule_id(self, api_client):
        """Verify GET /api/transactions includes recurring_rule_id field"""
        # Create a one-time transaction
        tx_payload = {
            "amount": 25.0,
            "type": "expense",
            "category": "food",
            "description": "TEST_One-time transaction"
        }
        
        tx_response = api_client.post(f"{BASE_URL}/api/transactions", json=tx_payload)
        assert tx_response.status_code == 200
        
        tx = tx_response.json()
        assert "recurring_rule_id" in tx
        assert tx["recurring_rule_id"] is None  # One-time should have null
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/transactions/{tx['id']}")

    def test_dashboard_summary_includes_recurring_transactions(self, api_client):
        """Verify dashboard summary works with recurring-generated transactions"""
        # Create recurring rule with past date
        past_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        payload = {
            "amount": 100.0,
            "type": "income",
            "category": "salary",
            "description": "TEST_Dashboard recurring",
            "frequency": "weekly",
            "start_date": past_date
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/recurring", json=payload)
        rule_id = create_response.json()["id"]
        
        # Get dashboard summary (this should call materialize_due internally)
        dashboard_response = api_client.get(f"{BASE_URL}/api/dashboard/summary")
        assert dashboard_response.status_code == 200
        
        summary = dashboard_response.json()
        assert "recent_transactions" in summary
        assert "transaction_count" in summary
        
        # Verify the endpoint works and includes required fields
        # (The recurring transaction might not be in top 5 recent if there are other transactions)
        assert isinstance(summary["recent_transactions"], list)
        assert summary["transaction_count"] >= 0
        
        # Verify via transactions endpoint that recurring transactions exist
        tx_response = api_client.get(f"{BASE_URL}/api/transactions")
        transactions = tx_response.json()
        recurring_txs = [t for t in transactions if t.get("recurring_rule_id") == rule_id]
        assert len(recurring_txs) >= 1, "Recurring transactions should be materialized"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/recurring/{rule_id}?delete_generated=true")


class TestRecurringAuth:
    """Test authentication requirements"""

    def test_create_recurring_without_auth_returns_401(self):
        """Test creating recurring rule without authentication"""
        payload = {
            "amount": 50.0,
            "type": "expense",
            "category": "food",
            "description": "TEST_Unauth",
            "frequency": "weekly"
        }
        
        response = requests.post(f"{BASE_URL}/api/recurring", json=payload)
        assert response.status_code == 401

    def test_list_recurring_without_auth_returns_401(self):
        """Test listing recurring rules without authentication"""
        response = requests.get(f"{BASE_URL}/api/recurring")
        assert response.status_code == 401
