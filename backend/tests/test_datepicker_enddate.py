"""
Backend tests for date picker bug fix and recurring end_date feature
Tests:
- POST /api/transactions with YYYY-MM-DDTHH:MM:SS sorts correctly (bug fix)
- POST /api/recurring with end_date
- Recurring materialization respects end_date
- end_date validation (must be after start_date)
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

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

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


class TestTransactionDateSorting:
    """Test that transactions with YYYY-MM-DDTHH:MM:SS sort correctly (bug fix)"""

    def test_transaction_with_later_time_appears_at_top(self, api_client):
        """
        Bug fix verification: POST transaction with same date but later HH:MM:SS
        should appear at TOP of GET /api/transactions list
        """
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Create first transaction with 10:00:00
        tx1_payload = {
            "amount": 10.0,
            "type": "expense",
            "category": "food",
            "description": "TEST_Morning coffee",
            "date": f"{today}T10:00:00"
        }
        
        tx1_response = api_client.post(f"{BASE_URL}/api/transactions", json=tx1_payload)
        assert tx1_response.status_code == 200
        tx1_id = tx1_response.json()["id"]
        
        # Create second transaction with 15:30:00 (later in the day)
        tx2_payload = {
            "amount": 20.0,
            "type": "expense",
            "category": "food",
            "description": "TEST_Afternoon snack",
            "date": f"{today}T15:30:00"
        }
        
        tx2_response = api_client.post(f"{BASE_URL}/api/transactions", json=tx2_payload)
        assert tx2_response.status_code == 200
        tx2_id = tx2_response.json()["id"]
        
        # GET transactions - should be sorted by date DESC (newest first)
        list_response = api_client.get(f"{BASE_URL}/api/transactions")
        assert list_response.status_code == 200
        
        transactions = list_response.json()
        
        # Find our transactions
        tx1_found = next((t for t in transactions if t["id"] == tx1_id), None)
        tx2_found = next((t for t in transactions if t["id"] == tx2_id), None)
        
        assert tx1_found is not None, "First transaction not found"
        assert tx2_found is not None, "Second transaction not found"
        
        # Get their positions in the list
        tx1_index = transactions.index(tx1_found)
        tx2_index = transactions.index(tx2_found)
        
        # tx2 (15:30:00) should appear BEFORE tx1 (10:00:00) in the list
        assert tx2_index < tx1_index, (
            f"Transaction with later time (15:30:00) should appear before earlier time (10:00:00). "
            f"Got tx2 at index {tx2_index}, tx1 at index {tx1_index}"
        )
        
        print(f"✓ Bug fix verified: Transaction with time 15:30:00 appears at index {tx2_index}, "
              f"transaction with time 10:00:00 appears at index {tx1_index}")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/transactions/{tx1_id}")
        api_client.delete(f"{BASE_URL}/api/transactions/{tx2_id}")


class TestRecurringEndDate:
    """Test recurring transactions with end_date feature"""

    def test_create_recurring_with_end_date(self, api_client):
        """POST /api/recurring with end_date returns end_date in response"""
        start = "2026-05-01"
        end = "2026-05-31"
        
        payload = {
            "amount": 50.0,
            "type": "expense",
            "category": "food",
            "description": "TEST_Monthly subscription with end date",
            "frequency": "weekly",
            "start_date": start,
            "end_date": end
        }
        
        response = api_client.post(f"{BASE_URL}/api/recurring", json=payload)
        assert response.status_code == 200, f"Failed to create recurring: {response.text}"
        
        rule = response.json()
        assert "end_date" in rule, "end_date field missing from response"
        assert rule["end_date"] is not None, "end_date should not be null"
        assert rule["end_date"].startswith(end), f"Expected end_date to start with {end}, got {rule['end_date']}"
        assert rule["start_date"].startswith(start), f"Expected start_date to start with {start}"
        assert rule["active"] is True
        
        print(f"✓ Created recurring rule with end_date: {rule['end_date']}")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/recurring/{rule['id']}?delete_generated=true")

    def test_get_recurring_includes_end_date(self, api_client):
        """GET /api/recurring returns end_date field"""
        # Create rule with end_date
        payload = {
            "amount": 100.0,
            "type": "income",
            "category": "salary",
            "description": "TEST_Contract with end date",
            "frequency": "monthly",
            "start_date": "2026-06-01",
            "end_date": "2026-12-31"
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/recurring", json=payload)
        rule_id = create_response.json()["id"]
        
        # GET list
        list_response = api_client.get(f"{BASE_URL}/api/recurring")
        assert list_response.status_code == 200
        
        rules = list_response.json()
        our_rule = next((r for r in rules if r["id"] == rule_id), None)
        
        assert our_rule is not None
        assert "end_date" in our_rule
        assert our_rule["end_date"] is not None
        assert our_rule["end_date"].startswith("2026-12-31")
        
        print(f"✓ GET /api/recurring includes end_date: {our_rule['end_date']}")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/recurring/{rule_id}?delete_generated=true")

    def test_recurring_without_end_date_returns_null(self, api_client):
        """POST /api/recurring WITHOUT end_date returns end_date=null and rule stays active"""
        payload = {
            "amount": 75.0,
            "type": "expense",
            "category": "bills",
            "description": "TEST_Indefinite subscription",
            "frequency": "monthly"
        }
        
        response = api_client.post(f"{BASE_URL}/api/recurring", json=payload)
        assert response.status_code == 200
        
        rule = response.json()
        assert "end_date" in rule
        assert rule["end_date"] is None, f"Expected end_date=null for indefinite rule, got {rule['end_date']}"
        assert rule["active"] is True
        
        print("✓ Recurring rule without end_date has end_date=null and active=true")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/recurring/{rule['id']}?delete_generated=true")

    def test_end_date_before_start_date_returns_400(self, api_client):
        """POST /api/recurring with end_date BEFORE start_date returns 400"""
        payload = {
            "amount": 50.0,
            "type": "expense",
            "category": "food",
            "description": "TEST_Invalid date range",
            "frequency": "weekly",
            "start_date": "2026-05-01",
            "end_date": "2026-04-01"  # Before start_date
        }
        
        response = api_client.post(f"{BASE_URL}/api/recurring", json=payload)
        assert response.status_code == 400, f"Expected 400 for end_date before start_date, got {response.status_code}"
        
        error = response.json()
        assert "detail" in error
        assert "after" in error["detail"].lower() or "before" in error["detail"].lower()
        
        print(f"✓ end_date before start_date correctly returns 400: {error['detail']}")

    def test_materialization_respects_end_date(self, api_client):
        """
        Recurring rule with end_date only generates transactions up to end_date
        Example: start_date=2026-04-01, frequency=weekly, end_date=2026-04-10
        Should generate only 2 transactions: 2026-04-01 and 2026-04-08
        (2026-04-15 would be after end_date, so not generated)
        """
        # Use past dates to trigger immediate materialization
        start = "2026-04-01"
        end = "2026-04-10"
        
        payload = {
            "amount": 30.0,
            "type": "expense",
            "category": "transport",
            "description": "TEST_Weekly bus pass with end date",
            "frequency": "weekly",
            "start_date": start,
            "end_date": end
        }
        
        response = api_client.post(f"{BASE_URL}/api/recurring", json=payload)
        assert response.status_code == 200
        
        rule = response.json()
        rule_id = rule["id"]
        
        # Get transactions
        tx_response = api_client.get(f"{BASE_URL}/api/transactions")
        transactions = tx_response.json()
        
        # Filter transactions for this rule
        recurring_txs = [t for t in transactions if t.get("recurring_rule_id") == rule_id]
        
        # Should have exactly 2 transactions: 2026-04-01 and 2026-04-08
        # (2026-04-15 would be after end_date 2026-04-10)
        assert len(recurring_txs) == 2, (
            f"Expected exactly 2 transactions (2026-04-01 and 2026-04-08), got {len(recurring_txs)}"
        )
        
        # Verify dates
        tx_dates = sorted([t["date"][:10] for t in recurring_txs])
        assert tx_dates[0] == "2026-04-01", f"First transaction should be 2026-04-01, got {tx_dates[0]}"
        assert tx_dates[1] == "2026-04-08", f"Second transaction should be 2026-04-08, got {tx_dates[1]}"
        
        print(f"✓ Materialization respects end_date: generated {len(recurring_txs)} transactions with dates {tx_dates}")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/recurring/{rule_id}?delete_generated=true")

    def test_rule_becomes_inactive_after_end_date_passed(self, api_client):
        """
        Recurring rule with end_date in the past should become active=false
        after materialization completes
        """
        # Use dates in the past where end_date has already passed
        start = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        end = (datetime.now() - timedelta(days=5)).strftime("%Y-%m-%d")
        
        payload = {
            "amount": 25.0,
            "type": "expense",
            "category": "food",
            "description": "TEST_Expired subscription",
            "frequency": "weekly",
            "start_date": start,
            "end_date": end
        }
        
        response = api_client.post(f"{BASE_URL}/api/recurring", json=payload)
        assert response.status_code == 200
        
        rule = response.json()
        rule_id = rule["id"]
        
        # After materialization, the rule should be inactive because end_date has passed
        # The response from POST already includes the updated state after materialization
        assert rule["active"] is False, (
            f"Rule should be inactive after end_date {end} has passed, but active={rule['active']}"
        )
        
        # Verify via GET as well
        list_response = api_client.get(f"{BASE_URL}/api/recurring")
        rules = list_response.json()
        our_rule = next((r for r in rules if r["id"] == rule_id), None)
        
        assert our_rule is not None
        assert our_rule["active"] is False, "Rule should remain inactive in GET response"
        
        print(f"✓ Rule with end_date in the past correctly becomes active=false")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/recurring/{rule_id}?delete_generated=true")

    def test_materialization_with_end_date_in_future(self, api_client):
        """
        Recurring rule with end_date in the future should stay active
        and generate transactions up to current date
        """
        # Start in the past, end in the future
        start = (datetime.now() - timedelta(days=14)).strftime("%Y-%m-%d")
        end = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        payload = {
            "amount": 40.0,
            "type": "expense",
            "category": "bills",
            "description": "TEST_Active subscription with future end",
            "frequency": "weekly",
            "start_date": start,
            "end_date": end
        }
        
        response = api_client.post(f"{BASE_URL}/api/recurring", json=payload)
        assert response.status_code == 200
        
        rule = response.json()
        rule_id = rule["id"]
        
        # Rule should still be active (end_date hasn't passed)
        assert rule["active"] is True, "Rule should be active when end_date is in the future"
        
        # Should have generated transactions from start_date to now (approximately 2 weeks = 2 instances)
        tx_response = api_client.get(f"{BASE_URL}/api/transactions")
        transactions = tx_response.json()
        recurring_txs = [t for t in transactions if t.get("recurring_rule_id") == rule_id]
        
        assert len(recurring_txs) >= 2, f"Expected at least 2 transactions, got {len(recurring_txs)}"
        
        # All transactions should be before or equal to today
        today = datetime.now().strftime("%Y-%m-%d")
        for tx in recurring_txs:
            tx_date = tx["date"][:10]
            assert tx_date <= today, f"Transaction date {tx_date} should not be in the future"
        
        print(f"✓ Rule with future end_date stays active and generates {len(recurring_txs)} transactions up to today")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/recurring/{rule_id}?delete_generated=true")
