import pytest
from httpx import AsyncClient
from unittest.mock import patch, AsyncMock
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import User

@pytest.fixture
def mock_email_service():
    with patch("app.services.auth_service.EmailService.send_verification_email", new_callable=AsyncMock) as mock_send:
        # Also mock token generation so we know what it is
        with patch("app.services.auth_service.EmailService.generate_verification_token", return_value="mock_token"):
            yield mock_send

@pytest.mark.asyncio
async def test_register_user(client: AsyncClient, db_session: AsyncSession, mock_email_service):
    response = await client.post(
        "/api/auth/register",
        json={
            "email": "test@example.com",
            "password": "strongPassword123",
            "full_name": "Test User",
            "role": "student"
        }
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "test@example.com"
    assert "Registration successful" in data["message"]
    
    mock_email_service.assert_called_once()
    
    # Check if user was actually created in the DB
    result = await db_session.execute(select(User).where(User.email == "test@example.com"))
    user = result.scalar_one_or_none()
    assert user is not None
    assert user.is_email_verified is False
    assert user.email_verification_token == "mock_token"

@pytest.mark.asyncio
async def test_login_unverified_user(client: AsyncClient, mock_email_service):
    # Register first
    register_resp = await client.post(
        "/api/auth/register",
        json={
            "email": "unverified@example.com",
            "password": "strongPassword123",
            "full_name": "Unverified User",
            "role": "student"
        }
    )
    assert register_resp.status_code == 201
    
    # Try to login
    response = await client.post(
        "/api/auth/login",
        json={
            "email": "unverified@example.com",
            "password": "strongPassword123"
        }
    )
    
    print("LOGIN RESPONSE:", response.json())
    assert response.status_code == 403
    assert "verify your email" in response.json()["detail"].lower()

@pytest.mark.asyncio
async def test_verify_email_and_login(client: AsyncClient, db_session: AsyncSession, mock_email_service):
    # Register
    register_resp = await client.post(
        "/api/auth/register",
        json={
            "email": "verify@example.com",
            "password": "strongPassword123",
            "full_name": "Verify User",
            "role": "student"
        }
    )
    assert register_resp.status_code == 201
    
    # Mock welcome email
    with patch("app.services.auth_service.EmailService.send_welcome_email", new_callable=AsyncMock) as mock_welcome:
        # Verify email using the explicit token that we mocked
        verify_response = await client.post(
            "/api/auth/verify-email",
            json={"token": "mock_token"}
        )
        print("VERIFY RESPONSE:", verify_response.json())
        assert verify_response.status_code == 200
        mock_welcome.assert_called_once()
        
    # Login again
    login_response = await client.post(
        "/api/auth/login",
        json={
            "email": "verify@example.com",
            "password": "strongPassword123"
        }
    )
    
    assert login_response.status_code == 200
    login_data = login_response.json()
    assert "access_token" in login_data
    assert login_data["user"]["email"] == "verify@example.com"
    
    return login_data["access_token"]

@pytest.mark.asyncio
async def test_get_me(client: AsyncClient, db_session: AsyncSession, mock_email_service):
    # Get token by running the verify & login flow
    access_token = await test_verify_email_and_login(client, db_session, mock_email_service)
    
    # Request /me
    response = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    
    assert response.status_code == 200
    assert response.json()["email"] == "verify@example.com"

@pytest.mark.asyncio
async def test_google_auth_new_user(client: AsyncClient, db_session: AsyncSession):
    # Mock Google verification
    mock_google_info = {
        "email": "googleuser@example.com",
        "full_name": "Google User",
        "google_id": "google_12345",
        "avatar_url": "http://example.com/avatar.jpg"
    }
    
    with patch("app.routes.auth.OAuthService.verify_google_id_token", new_callable=AsyncMock) as mock_verify:
        mock_verify.return_value = mock_google_info
        
        response = await client.post(
            "/api/auth/google",
            json={
                "credential": "fake_google_id_token",
                "role": "student"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["email"] == "googleuser@example.com"
        assert data["user"]["role"] == "student"
        
        # Check BD
        result = await db_session.execute(select(User).where(User.email == "googleuser@example.com"))
        user = result.scalar_one_or_none()
        assert user is not None
        assert user.is_email_verified is True
        assert user.auth_provider == "google"
