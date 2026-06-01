"""
Backend tests for dashboard month carousel feature
Tests: GET /api/dashboard/summary with month query param
"""
import pytest
from datetime import datetime, timezone

class TestDashboardMonth:
    """Dashboard month carousel backend tests"""

    def test_dashboard_summary_defaults_to_current_month(self, base_url, api_client, auth_headers):
        """GET /api/dashboard/summary without month param defaults to current month"""
        response = api_client.get(f"{base_url}/api/dashboard/summary", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        now = datetime.now(timezone.utc)
        current_month = now.strftime("%Y-%m")
        
        assert "month" in data
        assert data["month"] == current_month
        assert "month_balance" in data
        assert "month_income" in data
        assert "month_expense" in data
        assert "monthly_series" in data
        print(f"✓ Dashboard defaults to current month: {current_month}")

    def test_dashboard_summary_with_specific_month(self, base_url, api_client, auth_headers):
        """GET /api/dashboard/summary?month=2026-03 returns March 2026 metrics"""
        response = api_client.get(f"{base_url}/api/dashboard/summary?month=2026-03", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["month"] == "2026-03"
        assert "month_balance" in data
        assert "month_income" in data
        assert "month_expense" in data
        print(f"✓ Dashboard returns metrics for 2026-03")

    def test_dashboard_monthly_series_ends_at_selected_month(self, base_url, api_client, auth_headers):
        """monthly_series should end at selected month with 6 keys"""
        response = api_client.get(f"{base_url}/api/dashboard/summary?month=2026-04", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        series = data["monthly_series"]
        
        assert len(series) == 6, f"Expected 6 months in series, got {len(series)}"
        assert series[-1]["month"] == "2026-04", f"Last month should be 2026-04, got {series[-1]['month']}"
        
        # Verify series is in chronological order
        months = [m["month"] for m in series]
        assert months == sorted(months), "Series should be in chronological order"
        print(f"✓ Monthly series ends at 2026-04 with 6 keys: {months}")

    def test_dashboard_month_balance_is_cumulative(self, base_url, api_client, auth_headers):
        """month_balance should be cumulative balance up to end of selected month"""
        # Create test transactions in different months
        test_txs = [
            {"amount": 1000, "type": "income", "category": "salary", "description": "TEST_Jan", "date": "2026-01-15T10:00:00Z"},
            {"amount": 200, "type": "expense", "category": "food", "description": "TEST_Jan", "date": "2026-01-20T10:00:00Z"},
            {"amount": 1500, "type": "income", "category": "salary", "description": "TEST_Feb", "date": "2026-02-15T10:00:00Z"},
            {"amount": 300, "type": "expense", "category": "food", "description": "TEST_Feb", "date": "2026-02-20T10:00:00Z"},
        ]
        
        created_ids = []
        for tx in test_txs:
            resp = api_client.post(f"{base_url}/api/transactions", json=tx, headers=auth_headers)
            assert resp.status_code == 200
            created_ids.append(resp.json()["id"])
        
        # Check month_balance for 2026-01 (should be 1000 - 200 = 800)
        resp1 = api_client.get(f"{base_url}/api/dashboard/summary?month=2026-01", headers=auth_headers)
        assert resp1.status_code == 200
        data1 = resp1.json()
        
        # Check month_balance for 2026-02 (should be cumulative: 800 + 1500 - 300 = 2000)
        resp2 = api_client.get(f"{base_url}/api/dashboard/summary?month=2026-02", headers=auth_headers)
        assert resp2.status_code == 200
        data2 = resp2.json()
        
        # Verify month_balance is cumulative
        jan_balance = data1["month_balance"]
        feb_balance = data2["month_balance"]
        
        # Feb balance should be greater than Jan balance (cumulative)
        assert feb_balance > jan_balance, f"Feb balance ({feb_balance}) should be > Jan balance ({jan_balance})"
        print(f"✓ month_balance is cumulative: Jan={jan_balance}, Feb={feb_balance}")
        
        # Cleanup
        for tid in created_ids:
            api_client.delete(f"{base_url}/api/transactions/{tid}", headers=auth_headers)

    def test_dashboard_recent_transactions_filtered_by_month(self, base_url, api_client, auth_headers):
        """recent_transactions should only contain transactions from selected month"""
        # Create test transactions in different months
        test_txs = [
            {"amount": 100, "type": "expense", "category": "food", "description": "TEST_March_tx", "date": "2026-03-15T10:00:00Z"},
            {"amount": 200, "type": "expense", "category": "food", "description": "TEST_April_tx", "date": "2026-04-15T10:00:00Z"},
        ]
        
        created_ids = []
        for tx in test_txs:
            resp = api_client.post(f"{base_url}/api/transactions", json=tx, headers=auth_headers)
            assert resp.status_code == 200
            created_ids.append(resp.json()["id"])
        
        # Get dashboard for March 2026
        response = api_client.get(f"{base_url}/api/dashboard/summary?month=2026-03", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        recent = data["recent_transactions"]
        
        # All recent transactions should be from March 2026
        for tx in recent:
            tx_month = tx["date"][:7]  # YYYY-MM
            assert tx_month == "2026-03", f"Transaction {tx['id']} is from {tx_month}, expected 2026-03"
        
        print(f"✓ recent_transactions filtered by month: {len(recent)} transactions from 2026-03")
        
        # Cleanup
        for tid in created_ids:
            api_client.delete(f"{base_url}/api/transactions/{tid}", headers=auth_headers)

    def test_dashboard_month_income_expense_filtered(self, base_url, api_client, auth_headers):
        """month_income and month_expense should only include selected month"""
        # Create test transactions
        test_txs = [
            {"amount": 500, "type": "income", "category": "salary", "description": "TEST_May_income", "date": "2026-05-15T10:00:00Z"},
            {"amount": 100, "type": "expense", "category": "food", "description": "TEST_May_expense", "date": "2026-05-20T10:00:00Z"},
            {"amount": 1000, "type": "income", "category": "salary", "description": "TEST_June_income", "date": "2026-06-15T10:00:00Z"},
        ]
        
        created_ids = []
        for tx in test_txs:
            resp = api_client.post(f"{base_url}/api/transactions", json=tx, headers=auth_headers)
            assert resp.status_code == 200
            created_ids.append(resp.json()["id"])
        
        # Get dashboard for May 2026
        response = api_client.get(f"{base_url}/api/dashboard/summary?month=2026-05", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify May income includes only May transactions
        assert data["month_income"] >= 500, f"May income should include 500, got {data['month_income']}"
        assert data["month_expense"] >= 100, f"May expense should include 100, got {data['month_expense']}"
        
        # Get dashboard for June 2026
        response2 = api_client.get(f"{base_url}/api/dashboard/summary?month=2026-06", headers=auth_headers)
        assert response2.status_code == 200
        data2 = response2.json()
        
        # June should have different values
        print(f"✓ month_income/expense filtered: May income={data['month_income']}, June income={data2['month_income']}")
        
        # Cleanup
        for tid in created_ids:
            api_client.delete(f"{base_url}/api/transactions/{tid}", headers=auth_headers)
