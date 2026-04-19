"""
Dashboard endpoint tests
- GET /api/dashboard/summary
"""
import pytest

class TestDashboard:
    """Dashboard summary tests"""

    def test_dashboard_summary_structure(self, base_url, api_client, auth_headers):
        """GET /api/dashboard/summary returns correct structure"""
        response = api_client.get(
            f"{base_url}/api/dashboard/summary",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify required fields
        required_fields = [
            "balance", "total_income", "total_expense",
            "month_income", "month_expense", "month_savings",
            "monthly_series", "category_breakdown", "recent_transactions",
            "transaction_count"
        ]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        # Verify types
        assert isinstance(data["balance"], (int, float))
        assert isinstance(data["monthly_series"], list)
        assert isinstance(data["category_breakdown"], list)
        assert isinstance(data["recent_transactions"], list)
        
        # Verify monthly_series structure
        if len(data["monthly_series"]) > 0:
            month_entry = data["monthly_series"][0]
            assert "month" in month_entry
            assert "income" in month_entry
            assert "expense" in month_entry
        
        # Verify category_breakdown structure
        if len(data["category_breakdown"]) > 0:
            cat_entry = data["category_breakdown"][0]
            assert "category" in cat_entry
            assert "amount" in cat_entry

    def test_dashboard_summary_with_transactions(self, base_url, api_client, auth_headers):
        """Dashboard summary reflects created transactions"""
        # Create a test transaction
        api_client.post(
            f"{base_url}/api/transactions",
            json={
                "amount": 100.00,
                "type": "income",
                "category": "salary",
                "description": "TEST_Dashboard test income"
            },
            headers=auth_headers
        )
        
        response = api_client.get(
            f"{base_url}/api/dashboard/summary",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["transaction_count"] > 0, "Should have at least one transaction"
        assert data["total_income"] >= 100.00, "Total income should include test transaction"

    def test_dashboard_summary_unauthenticated(self, base_url, api_client):
        """GET /api/dashboard/summary without auth returns 401"""
        response = api_client.get(f"{base_url}/api/dashboard/summary")
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
