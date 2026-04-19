"""
Goal endpoint tests
- POST /api/goals
- GET /api/goals
- POST /api/goals/{id}/contribute (increments current_amount)
- DELETE /api/goals/{id}
"""
import pytest
import uuid

class TestGoals:
    """Goal CRUD tests"""

    def test_create_goal_and_verify(self, base_url, api_client, auth_headers):
        """POST /api/goals creates goal"""
        payload = {
            "title": "TEST_Emergency Fund",
            "target_amount": 5000.00,
            "current_amount": 0.00,
            "deadline": "2026-12-31"
        }
        
        # Create
        create_response = api_client.post(
            f"{base_url}/api/goals",
            json=payload,
            headers=auth_headers
        )
        assert create_response.status_code == 200, f"Expected 200, got {create_response.status_code}: {create_response.text}"
        
        created = create_response.json()
        assert created["title"] == "TEST_Emergency Fund"
        assert created["target_amount"] == 5000.00
        assert created["current_amount"] == 0.00
        assert "id" in created
        assert "user_id" in created
        
        goal_id = created["id"]
        
        # GET to verify
        get_response = api_client.get(
            f"{base_url}/api/goals",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        
        goals = get_response.json()
        found = next((g for g in goals if g["id"] == goal_id), None)
        assert found is not None, "Goal not found in GET list"
        assert found["title"] == "TEST_Emergency Fund"

    def test_contribute_to_goal(self, base_url, api_client, auth_headers):
        """POST /api/goals/{id}/contribute increments current_amount"""
        # Create goal
        create_response = api_client.post(
            f"{base_url}/api/goals",
            json={
                "title": "TEST_Vacation Fund",
                "target_amount": 2000.00,
                "current_amount": 100.00
            },
            headers=auth_headers
        )
        goal_id = create_response.json()["id"]
        
        # Contribute
        contribute_response = api_client.post(
            f"{base_url}/api/goals/{goal_id}/contribute",
            json={"amount": 250.00},
            headers=auth_headers
        )
        assert contribute_response.status_code == 200, f"Expected 200, got {contribute_response.status_code}: {contribute_response.text}"
        
        updated = contribute_response.json()
        assert updated["current_amount"] == 350.00, f"Expected 350.00 (100 + 250), got {updated['current_amount']}"
        
        # GET to verify persistence
        get_response = api_client.get(
            f"{base_url}/api/goals",
            headers=auth_headers
        )
        goals = get_response.json()
        found = next((g for g in goals if g["id"] == goal_id), None)
        assert found is not None
        assert found["current_amount"] == 350.00, "Contribution should persist"

    def test_delete_goal(self, base_url, api_client, auth_headers):
        """DELETE /api/goals/{id} removes goal"""
        # Create
        create_response = api_client.post(
            f"{base_url}/api/goals",
            json={
                "title": "TEST_Delete me",
                "target_amount": 1000.00,
                "current_amount": 0.00
            },
            headers=auth_headers
        )
        goal_id = create_response.json()["id"]
        
        # Delete
        delete_response = api_client.delete(
            f"{base_url}/api/goals/{goal_id}",
            headers=auth_headers
        )
        assert delete_response.status_code == 200
        assert delete_response.json()["ok"] is True
        
        # Verify deletion
        get_response = api_client.get(
            f"{base_url}/api/goals",
            headers=auth_headers
        )
        goals = get_response.json()
        found = next((g for g in goals if g["id"] == goal_id), None)
        assert found is None, "Goal should be deleted"

    def test_goals_unauthenticated(self, base_url, api_client):
        """Goal endpoints without auth return 401"""
        # POST
        post_response = api_client.post(
            f"{base_url}/api/goals",
            json={"title": "Test", "target_amount": 100, "current_amount": 0}
        )
        assert post_response.status_code == 401
        
        # GET
        get_response = api_client.get(f"{base_url}/api/goals")
        assert get_response.status_code == 401
