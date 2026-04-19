"""
AI endpoint tests
- POST /api/ai/suggest-category (returns category from 15 predefined IDs)
- POST /api/ai/insights (returns summary, top_categories, anomalies, tips, forecast; fallback=true acceptable)
"""
import pytest

class TestAISuggestCategory:
    """AI category suggestion tests"""

    def test_suggest_category_structure(self, base_url, api_client, auth_headers):
        """POST /api/ai/suggest-category returns valid category ID"""
        response = api_client.post(
            f"{base_url}/api/ai/suggest-category",
            json={
                "description": "Coffee at Starbucks",
                "amount": 5.50
            },
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "category" in data, "Response missing 'category' field"
        assert "confidence" in data, "Response missing 'confidence' field"
        
        # Verify category is one of the 15 predefined IDs
        valid_categories = {
            "food", "transport", "shopping", "bills", "entertainment",
            "health", "education", "travel", "groceries", "other_exp",
            "salary", "freelance", "investment", "gift", "other_inc"
        }
        assert data["category"] in valid_categories, f"Category '{data['category']}' not in predefined list"
        
        # Confidence should be 0-1
        assert 0 <= data["confidence"] <= 1, f"Confidence {data['confidence']} out of range [0,1]"

    def test_suggest_category_empty_description(self, base_url, api_client, auth_headers):
        """Empty description should return 400"""
        response = api_client.post(
            f"{base_url}/api/ai/suggest-category",
            json={"description": ""},
            headers=auth_headers
        )
        assert response.status_code == 400, f"Expected 400 for empty description, got {response.status_code}"

    def test_suggest_category_unauthenticated(self, base_url, api_client):
        """POST /api/ai/suggest-category without auth returns 401"""
        response = api_client.post(
            f"{base_url}/api/ai/suggest-category",
            json={"description": "Test"}
        )
        assert response.status_code == 401


class TestAIInsights:
    """AI insights tests"""

    def test_insights_structure(self, base_url, api_client, auth_headers):
        """POST /api/ai/insights returns correct structure (fallback acceptable)"""
        # Create some transactions first
        for i in range(3):
            api_client.post(
                f"{base_url}/api/transactions",
                json={
                    "amount": 50.00 + i * 10,
                    "type": "expense",
                    "category": "food",
                    "description": f"TEST_Insights test {i}"
                },
                headers=auth_headers
            )
        
        response = api_client.post(
            f"{base_url}/api/ai/insights",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify required fields
        required_fields = ["summary", "top_categories", "anomalies", "tips", "forecast_next_month", "generated_at"]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        # Verify types
        assert isinstance(data["summary"], str)
        assert isinstance(data["top_categories"], list)
        assert isinstance(data["anomalies"], list)
        assert isinstance(data["tips"], list)
        
        # forecast_next_month can be dict or None
        if data["forecast_next_month"] is not None:
            assert isinstance(data["forecast_next_month"], dict)
        
        # fallback=true is acceptable
        if "fallback" in data:
            assert data["fallback"] is True, "If fallback present, should be True"

    def test_insights_no_transactions(self, base_url, api_client, auth_headers):
        """Insights with no transactions returns helpful message"""
        # Use a fresh user with no transactions
        register_response = api_client.post(
            f"{base_url}/api/auth/register",
            json={
                "email": f"test_{uuid.uuid4().hex[:8]}@financefocus.app",
                "password": "Test@1234",
                "name": "Fresh User"
            }
        )
        fresh_token = register_response.json()["access_token"]
        fresh_headers = {"Authorization": f"Bearer {fresh_token}"}
        
        response = api_client.post(
            f"{base_url}/api/ai/insights",
            headers=fresh_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "summary" in data
        assert len(data["tips"]) > 0, "Should provide tips even with no transactions"

    def test_insights_unauthenticated(self, base_url, api_client):
        """POST /api/ai/insights without auth returns 401"""
        response = api_client.post(f"{base_url}/api/ai/insights")
        assert response.status_code == 401


import uuid
