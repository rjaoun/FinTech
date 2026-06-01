"""
Backend tests for user profile endpoints
Tests: GET /api/users/currencies, PATCH /api/users/me, POST /api/users/me/reset
"""
import pytest
import os

class TestUserProfile:
    """User profile endpoints tests"""

    def test_get_currencies_requires_auth(self, base_url, api_client):
        """GET /api/users/currencies returns 401 without auth"""
        response = api_client.get(f"{base_url}/api/users/currencies")
        assert response.status_code == 401
        print("✓ GET /api/users/currencies requires authentication")

    def test_get_currencies_returns_10_currencies(self, base_url, api_client, auth_headers):
        """GET /api/users/currencies returns list of 10 currencies with code and symbol"""
        response = api_client.get(f"{base_url}/api/users/currencies", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) == 10, f"Expected 10 currencies, got {len(data)}"
        
        # Verify structure of each currency
        for currency in data:
            assert "code" in currency, "Currency must have 'code' field"
            assert "symbol" in currency, "Currency must have 'symbol' field"
            assert isinstance(currency["code"], str), "Currency code must be string"
            assert isinstance(currency["symbol"], str), "Currency symbol must be string"
        
        # Verify expected currencies are present
        codes = [c["code"] for c in data]
        expected_codes = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "INR", "MXN", "BRL", "CHF"]
        assert set(codes) == set(expected_codes), f"Expected currencies {expected_codes}, got {codes}"
        
        print(f"✓ GET /api/users/currencies returns 10 currencies: {codes}")

    def test_patch_user_me_requires_auth(self, base_url, api_client):
        """PATCH /api/users/me returns 401 without auth"""
        response = api_client.patch(f"{base_url}/api/users/me", json={"currency": "EUR"})
        assert response.status_code == 401
        print("✓ PATCH /api/users/me requires authentication")

    def test_patch_user_me_updates_currency(self, base_url, api_client, auth_headers):
        """PATCH /api/users/me with {currency: 'EUR'} updates user currency"""
        # Get current user
        me_response = api_client.get(f"{base_url}/api/auth/me", headers=auth_headers)
        assert me_response.status_code == 200
        original_currency = me_response.json()["currency"]
        
        # Update to EUR
        response = api_client.patch(
            f"{base_url}/api/users/me",
            json={"currency": "EUR"},
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["currency"] == "EUR", f"Expected currency 'EUR', got {data['currency']}"
        assert "id" in data
        assert "email" in data
        assert "name" in data
        
        # Verify GET /api/auth/me reflects the change
        verify_response = api_client.get(f"{base_url}/api/auth/me", headers=auth_headers)
        assert verify_response.status_code == 200
        assert verify_response.json()["currency"] == "EUR"
        
        print(f"✓ PATCH /api/users/me updated currency from {original_currency} to EUR")
        
        # Restore original currency
        api_client.patch(
            f"{base_url}/api/users/me",
            json={"currency": original_currency},
            headers=auth_headers
        )

    def test_patch_user_me_invalid_currency_returns_400(self, base_url, api_client, auth_headers):
        """PATCH /api/users/me with invalid currency returns 400"""
        response = api_client.patch(
            f"{base_url}/api/users/me",
            json={"currency": "XYZ"},
            headers=auth_headers
        )
        assert response.status_code == 400
        
        data = response.json()
        assert "detail" in data
        assert "Currency must be one of" in data["detail"] or "XYZ" in str(data["detail"])
        
        print("✓ PATCH /api/users/me with invalid currency 'XYZ' returns 400")

    def test_patch_user_me_updates_name(self, base_url, api_client, auth_headers):
        """PATCH /api/users/me with {name: 'New Name'} updates user name"""
        # Get current user
        me_response = api_client.get(f"{base_url}/api/auth/me", headers=auth_headers)
        assert me_response.status_code == 200
        original_name = me_response.json()["name"]
        
        # Update name
        new_name = "TEST_Updated_Name"
        response = api_client.patch(
            f"{base_url}/api/users/me",
            json={"name": new_name},
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["name"] == new_name, f"Expected name '{new_name}', got {data['name']}"
        
        # Verify GET /api/auth/me reflects the change
        verify_response = api_client.get(f"{base_url}/api/auth/me", headers=auth_headers)
        assert verify_response.status_code == 200
        assert verify_response.json()["name"] == new_name
        
        print(f"✓ PATCH /api/users/me updated name from '{original_name}' to '{new_name}'")
        
        # Restore original name
        api_client.patch(
            f"{base_url}/api/users/me",
            json={"name": original_name},
            headers=auth_headers
        )

    def test_patch_user_me_empty_name_returns_400(self, base_url, api_client, auth_headers):
        """PATCH /api/users/me with empty name returns 400"""
        response = api_client.patch(
            f"{base_url}/api/users/me",
            json={"name": "   "},
            headers=auth_headers
        )
        assert response.status_code == 400
        
        data = response.json()
        assert "detail" in data
        assert "empty" in data["detail"].lower()
        
        print("✓ PATCH /api/users/me with empty name returns 400")

    def test_post_reset_requires_auth(self, base_url, api_client):
        """POST /api/users/me/reset returns 401 without auth"""
        response = api_client.post(f"{base_url}/api/users/me/reset")
        assert response.status_code == 401
        print("✓ POST /api/users/me/reset requires authentication")

    def test_post_reset_deletes_all_user_data(self, base_url, api_client):
        """POST /api/users/me/reset deletes transactions, recurring_rules, goals, budgets but keeps user account"""
        # Register a fresh test user to avoid wiping admin data
        test_email = f"test_reset_{os.urandom(4).hex()}@test.com"
        register_response = api_client.post(
            f"{base_url}/api/auth/register",
            json={
                "email": test_email,
                "password": "Test@1234",
                "name": "Test Reset User"
            }
        )
        assert register_response.status_code == 200
        test_token = register_response.json()["access_token"]
        test_headers = {"Authorization": f"Bearer {test_token}"}
        
        # Create test data
        # 1. Transaction
        tx_response = api_client.post(
            f"{base_url}/api/transactions",
            json={"amount": 100, "type": "expense", "category": "food", "description": "TEST_reset"},
            headers=test_headers
        )
        assert tx_response.status_code == 200
        
        # 2. Recurring rule
        rec_response = api_client.post(
            f"{base_url}/api/recurring",
            json={
                "amount": 1500,
                "type": "income",
                "category": "salary",
                "description": "TEST_reset_recurring",
                "frequency": "monthly",
                "start_date": "2026-05-01"
            },
            headers=test_headers
        )
        assert rec_response.status_code == 200
        
        # 3. Goal
        goal_response = api_client.post(
            f"{base_url}/api/goals",
            json={
                "title": "TEST_reset_goal",
                "target_amount": 5000,
                "current_amount": 1000
            },
            headers=test_headers
        )
        assert goal_response.status_code == 200
        
        # 4. Budget
        budget_response = api_client.post(
            f"{base_url}/api/budgets",
            json={
                "category": "food",
                "amount": 500,
                "month": "2026-05"
            },
            headers=test_headers
        )
        assert budget_response.status_code == 200
        
        # Verify data exists
        txs = api_client.get(f"{base_url}/api/transactions", headers=test_headers).json()
        recs = api_client.get(f"{base_url}/api/recurring", headers=test_headers).json()
        goals = api_client.get(f"{base_url}/api/goals", headers=test_headers).json()
        budgets = api_client.get(f"{base_url}/api/budgets", headers=test_headers).json()
        
        assert len(txs) > 0, "Should have transactions before reset"
        assert len(recs) > 0, "Should have recurring rules before reset"
        assert len(goals) > 0, "Should have goals before reset"
        assert len(budgets) > 0, "Should have budgets before reset"
        
        # Call reset
        reset_response = api_client.post(f"{base_url}/api/users/me/reset", headers=test_headers)
        assert reset_response.status_code == 200
        
        reset_data = reset_response.json()
        assert reset_data["ok"] is True
        assert "deleted" in reset_data
        assert reset_data["deleted"]["transactions"] > 0
        assert reset_data["deleted"]["recurring_rules"] > 0
        assert reset_data["deleted"]["goals"] > 0
        assert reset_data["deleted"]["budgets"] > 0
        
        print(f"✓ POST /api/users/me/reset deleted: {reset_data['deleted']}")
        
        # Verify all data is gone
        txs_after = api_client.get(f"{base_url}/api/transactions", headers=test_headers).json()
        recs_after = api_client.get(f"{base_url}/api/recurring", headers=test_headers).json()
        goals_after = api_client.get(f"{base_url}/api/goals", headers=test_headers).json()
        budgets_after = api_client.get(f"{base_url}/api/budgets", headers=test_headers).json()
        
        assert len(txs_after) == 0, f"Transactions should be empty after reset, got {len(txs_after)}"
        assert len(recs_after) == 0, f"Recurring rules should be empty after reset, got {len(recs_after)}"
        assert len(goals_after) == 0, f"Goals should be empty after reset, got {len(goals_after)}"
        assert len(budgets_after) == 0, f"Budgets should be empty after reset, got {len(budgets_after)}"
        
        # Verify user account still exists
        me_response = api_client.get(f"{base_url}/api/auth/me", headers=test_headers)
        assert me_response.status_code == 200
        assert me_response.json()["email"] == test_email
        
        print(f"✓ User account still exists after reset: {test_email}")
