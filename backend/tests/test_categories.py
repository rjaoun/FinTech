"""
Categories endpoint tests
- GET /api/categories (authenticated)
"""
import pytest

class TestCategories:
    """Category endpoint tests"""

    def test_list_categories_authenticated(self, base_url, api_client, auth_headers):
        """GET /api/categories returns 15 predefined categories"""
        response = api_client.get(
            f"{base_url}/api/categories",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        categories = response.json()
        assert isinstance(categories, list), "Expected list of categories"
        assert len(categories) == 15, f"Expected 15 categories, got {len(categories)}"
        
        # Verify structure of first category
        cat = categories[0]
        assert "id" in cat
        assert "name" in cat
        assert "icon" in cat
        assert "color" in cat
        assert "type" in cat
        assert cat["type"] in ["income", "expense"]
        
        # Verify specific categories exist
        cat_ids = {c["id"] for c in categories}
        expected_ids = {"food", "transport", "shopping", "salary", "freelance", "investment"}
        assert expected_ids.issubset(cat_ids), f"Missing expected categories: {expected_ids - cat_ids}"

    def test_list_categories_unauthenticated(self, base_url, api_client):
        """GET /api/categories without auth returns 401"""
        response = api_client.get(f"{base_url}/api/categories")
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
