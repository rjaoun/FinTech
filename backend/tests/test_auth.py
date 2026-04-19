"""
Authentication endpoint tests
- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me
- POST /api/auth/logout
"""
import pytest
import uuid

class TestAuthRegister:
    """User registration tests"""

    def test_register_new_user(self, base_url, api_client):
        """Register a new user and verify response structure"""
        unique_email = f"test_{uuid.uuid4().hex[:8]}@financefocus.app"
        response = api_client.post(
            f"{base_url}/api/auth/register",
            json={
                "email": unique_email,
                "password": "Test@1234",
                "name": "Test User"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "user" in data, "Response missing 'user' field"
        assert "access_token" in data, "Response missing 'access_token' field"
        
        user = data["user"]
        assert user["email"] == unique_email
        assert user["name"] == "Test User"
        assert user["currency"] == "USD"
        assert user["role"] == "user"
        assert "id" in user
        assert "created_at" in user

    def test_register_duplicate_email(self, base_url, api_client):
        """Registering with existing email should return 400"""
        response = api_client.post(
            f"{base_url}/api/auth/register",
            json={
                "email": "admin@financefocus.app",
                "password": "Test@1234",
                "name": "Duplicate"
            }
        )
        assert response.status_code == 400, f"Expected 400 for duplicate email, got {response.status_code}"
        assert "already registered" in response.json()["detail"].lower()

    def test_register_invalid_email(self, base_url, api_client):
        """Invalid email format should return 422"""
        response = api_client.post(
            f"{base_url}/api/auth/register",
            json={
                "email": "not-an-email",
                "password": "Test@1234",
                "name": "Test"
            }
        )
        assert response.status_code == 422, f"Expected 422 for invalid email, got {response.status_code}"

    def test_register_short_password(self, base_url, api_client):
        """Password < 6 chars should return 422"""
        response = api_client.post(
            f"{base_url}/api/auth/register",
            json={
                "email": f"test_{uuid.uuid4().hex[:8]}@financefocus.app",
                "password": "12345",
                "name": "Test"
            }
        )
        assert response.status_code == 422, f"Expected 422 for short password, got {response.status_code}"


class TestAuthLogin:
    """Login endpoint tests"""

    def test_login_admin_success(self, base_url, api_client):
        """Admin login with correct credentials"""
        response = api_client.post(
            f"{base_url}/api/auth/login",
            json={
                "email": "admin@financefocus.app",
                "password": "admin123"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "user" in data
        assert "access_token" in data
        
        user = data["user"]
        assert user["email"] == "admin@financefocus.app"
        assert user["role"] == "admin"
        assert len(data["access_token"]) > 20

    def test_login_wrong_password(self, base_url, api_client):
        """Login with wrong password should return 401"""
        response = api_client.post(
            f"{base_url}/api/auth/login",
            json={
                "email": "admin@financefocus.app",
                "password": "wrongpassword"
            }
        )
        assert response.status_code == 401, f"Expected 401 for wrong password, got {response.status_code}"
        assert "invalid" in response.json()["detail"].lower()

    def test_login_nonexistent_user(self, base_url, api_client):
        """Login with non-existent email should return 401"""
        response = api_client.post(
            f"{base_url}/api/auth/login",
            json={
                "email": "nonexistent@financefocus.app",
                "password": "password123"
            }
        )
        assert response.status_code == 401, f"Expected 401 for non-existent user, got {response.status_code}"


class TestAuthMe:
    """GET /api/auth/me tests"""

    def test_me_with_valid_token(self, base_url, api_client, auth_headers):
        """GET /me with valid token returns current user"""
        response = api_client.get(
            f"{base_url}/api/auth/me",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        user = response.json()
        assert user["email"] == "admin@financefocus.app"
        assert user["role"] == "admin"
        assert "id" in user
        assert "name" in user
        assert "currency" in user
        assert "created_at" in user

    def test_me_without_token(self, base_url, api_client):
        """GET /me without Authorization header should return 401"""
        response = api_client.get(f"{base_url}/api/auth/me")
        assert response.status_code == 401, f"Expected 401 without token, got {response.status_code}"

    def test_me_with_invalid_token(self, base_url, api_client):
        """GET /me with invalid token should return 401"""
        response = api_client.get(
            f"{base_url}/api/auth/me",
            headers={"Authorization": "Bearer invalid_token_12345"}
        )
        assert response.status_code == 401, f"Expected 401 for invalid token, got {response.status_code}"


class TestAuthLogout:
    """Logout endpoint tests"""

    def test_logout_authenticated(self, base_url, api_client, auth_headers):
        """Logout with valid token"""
        response = api_client.post(
            f"{base_url}/api/auth/logout",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert response.json()["ok"] is True

    def test_logout_unauthenticated(self, base_url, api_client):
        """Logout without token should return 401"""
        response = api_client.post(f"{base_url}/api/auth/logout")
        assert response.status_code == 401, f"Expected 401 without token, got {response.status_code}"
