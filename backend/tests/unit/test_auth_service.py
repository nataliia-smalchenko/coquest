import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.auth_service import AuthService
from app.services.email_service import EmailService
from app.models.user import User, AuthProvider
from app.utils.security import (
    get_password_hash,
    create_access_token,
    create_refresh_token,
)


# Helpers
def _make_user(**kwargs) -> User:
    defaults = dict(
        id="user-uuid-1",
        email="test@example.com",
        full_name="Test User",
        role="student",
        auth_provider=AuthProvider.EMAIL,
        is_email_verified=True,
        password_hash=get_password_hash("password123"),
        email_verification_token=None,
        email_verification_sent_at=None,
        google_id=None,
        avatar_url=None,
        preferred_language="uk",
    )
    defaults.update(kwargs)
    user = MagicMock(spec=User)
    for k, v in defaults.items():
        setattr(user, k, v)
    return user


def _make_db(scalar_result=None) -> AsyncSession:
    db = AsyncMock(spec=AsyncSession)
    execute_result = MagicMock()
    execute_result.scalar_one_or_none.return_value = scalar_result
    db.execute.return_value = execute_result
    return db


# get_user_by_id
class TestGetUserById:
    @pytest.mark.asyncio
    async def test_returns_user_when_found(self):
        user = _make_user()
        db = _make_db(scalar_result=user)
        result = await AuthService.get_user_by_id(db, "user-uuid-1")
        assert result is user

    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(self):
        db = _make_db(scalar_result=None)
        result = await AuthService.get_user_by_id(db, "nonexistent")
        assert result is None


# register_user
class TestRegisterUser:
    @pytest.mark.asyncio
    async def test_raises_409_when_email_exists(self):
        existing_user = _make_user()
        db = _make_db(scalar_result=existing_user)

        from app.schemas.user import UserCreate

        user_data = MagicMock(spec=UserCreate)
        user_data.email = "test@example.com"

        with pytest.raises(HTTPException) as exc_info:
            await AuthService.register_user(db, user_data)
        assert exc_info.value.status_code == 409

    @pytest.mark.asyncio
    async def test_creates_user_and_sends_email(self):
        db = _make_db(scalar_result=None)
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        from app.schemas.user import UserCreate

        user_data = MagicMock(spec=UserCreate)
        user_data.email = "new@example.com"
        user_data.password = "strongPass123"
        user_data.full_name = "New User"
        user_data.role = "student"

        with patch.object(
            EmailService, "generate_verification_token", return_value="tok123"
        ):
            with patch.object(
                EmailService, "send_verification_email", new_callable=AsyncMock
            ) as mock_send:
                mock_send.return_value = {}
                await AuthService.register_user(db, user_data, language="uk")

        mock_send.assert_called_once()
        call_kwargs = mock_send.call_args.kwargs
        assert call_kwargs["token"] == "tok123"
        assert call_kwargs["language"] == "uk"
        assert call_kwargs["email"] == "new@example.com"
        db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_raises_500_when_email_send_fails(self):
        db = _make_db(scalar_result=None)
        db.flush = AsyncMock()
        db.rollback = AsyncMock()

        from app.schemas.user import UserCreate

        user_data = MagicMock(spec=UserCreate)
        user_data.email = "new@example.com"
        user_data.password = "pass"
        user_data.full_name = "Name"
        user_data.role = "student"

        with patch.object(
            EmailService, "generate_verification_token", return_value="tok"
        ):
            with patch.object(
                EmailService, "send_verification_email", new_callable=AsyncMock
            ) as mock_send:
                mock_send.side_effect = Exception("SMTP down")
                with pytest.raises(HTTPException) as exc_info:
                    await AuthService.register_user(db, user_data)

        assert exc_info.value.status_code == 500
        db.rollback.assert_called_once()


# verify_email
class TestVerifyEmail:
    @pytest.mark.asyncio
    async def test_raises_400_when_token_not_found(self):
        db = _make_db(scalar_result=None)
        with pytest.raises(HTTPException) as exc_info:
            await AuthService.verify_email(db, "bad_token")
        assert exc_info.value.status_code == 400
        assert "Invalid" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_raises_400_when_already_verified(self):
        user = _make_user(is_email_verified=True)
        db = _make_db(scalar_result=user)
        with pytest.raises(HTTPException) as exc_info:
            await AuthService.verify_email(db, "some_token")
        assert exc_info.value.status_code == 400
        assert "already verified" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_raises_400_when_token_expired(self):
        from datetime import datetime, timezone, timedelta

        sent_at = datetime.now(timezone.utc) - timedelta(hours=25)
        user = _make_user(is_email_verified=False, email_verification_sent_at=sent_at)
        db = _make_db(scalar_result=user)
        with pytest.raises(HTTPException) as exc_info:
            await AuthService.verify_email(db, "expired_token")
        assert exc_info.value.status_code == 400
        assert "expired" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_verifies_email_and_sends_welcome(self):
        from datetime import datetime, timezone, timedelta

        sent_at = datetime.now(timezone.utc) - timedelta(hours=1)
        user = _make_user(
            is_email_verified=False,
            email_verification_sent_at=sent_at,
            email="user@example.com",
            full_name="User",
            preferred_language=MagicMock(value="uk"),
        )
        db = _make_db(scalar_result=user)
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        with patch.object(
            EmailService, "send_welcome_email", new_callable=AsyncMock
        ) as mock_welcome:
            await AuthService.verify_email(db, "valid_token")

        assert user.is_email_verified is True
        assert user.email_verification_token is None
        mock_welcome.assert_called_once()

    @pytest.mark.asyncio
    async def test_completes_even_if_welcome_email_fails(self):
        from datetime import datetime, timezone, timedelta

        sent_at = datetime.now(timezone.utc) - timedelta(hours=1)
        user = _make_user(is_email_verified=False, email_verification_sent_at=sent_at)
        db = _make_db(scalar_result=user)
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        with patch.object(
            EmailService, "send_welcome_email", new_callable=AsyncMock
        ) as mock_welcome:
            mock_welcome.side_effect = Exception("email failed")
            # Should NOT raise
            await AuthService.verify_email(db, "valid_token")

        assert user.is_email_verified is True


# resend_verification_email
class TestResendVerificationEmail:
    @pytest.mark.asyncio
    async def test_raises_404_when_user_not_found(self):
        db = _make_db(scalar_result=None)
        with pytest.raises(HTTPException) as exc_info:
            await AuthService.resend_verification_email(db, "no@user.com")
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_raises_400_when_already_verified(self):
        user = _make_user(is_email_verified=True)
        db = _make_db(scalar_result=user)
        with pytest.raises(HTTPException) as exc_info:
            await AuthService.resend_verification_email(db, "test@example.com")
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_resends_successfully(self):
        user = _make_user(is_email_verified=False)
        db = _make_db(scalar_result=user)
        db.flush = AsyncMock()
        db.commit = AsyncMock()

        with patch.object(
            EmailService, "generate_verification_token", return_value="new_tok"
        ):
            with patch.object(
                EmailService, "send_verification_email", new_callable=AsyncMock
            ) as mock_send:
                mock_send.return_value = {}
                await AuthService.resend_verification_email(db, "test@example.com")

        assert user.email_verification_token == "new_tok"
        mock_send.assert_called_once()

    @pytest.mark.asyncio
    async def test_raises_500_when_send_fails(self):
        user = _make_user(is_email_verified=False)
        db = _make_db(scalar_result=user)
        db.flush = AsyncMock()
        db.rollback = AsyncMock()

        with patch.object(
            EmailService, "generate_verification_token", return_value="tok"
        ):
            with patch.object(
                EmailService, "send_verification_email", new_callable=AsyncMock
            ) as mock_send:
                mock_send.side_effect = Exception("fail")
                with pytest.raises(HTTPException) as exc_info:
                    await AuthService.resend_verification_email(db, "test@example.com")

        assert exc_info.value.status_code == 500
        db.rollback.assert_called_once()


# authenticate_user
class TestAuthenticateUser:
    @pytest.mark.asyncio
    async def test_raises_401_when_user_not_found(self):
        db = _make_db(scalar_result=None)
        from app.schemas.user import UserLogin

        credentials = MagicMock(spec=UserLogin)
        credentials.email = "no@user.com"
        credentials.password = "pass"
        with pytest.raises(HTTPException) as exc_info:
            await AuthService.authenticate_user(db, credentials)
        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_raises_401_for_wrong_password(self):
        user = _make_user(password_hash=get_password_hash("correct"))
        db = _make_db(scalar_result=user)
        from app.schemas.user import UserLogin

        credentials = MagicMock(spec=UserLogin)
        credentials.email = "test@example.com"
        credentials.password = "wrong"
        with pytest.raises(HTTPException) as exc_info:
            await AuthService.authenticate_user(db, credentials)
        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_raises_403_when_email_not_verified(self):
        user = _make_user(
            is_email_verified=False, password_hash=get_password_hash("pass")
        )
        db = _make_db(scalar_result=user)
        from app.schemas.user import UserLogin

        credentials = MagicMock(spec=UserLogin)
        credentials.email = "test@example.com"
        credentials.password = "pass"
        with pytest.raises(HTTPException) as exc_info:
            await AuthService.authenticate_user(db, credentials)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_returns_user_on_valid_credentials(self):
        user = _make_user(
            is_email_verified=True, password_hash=get_password_hash("pass")
        )
        db = _make_db(scalar_result=user)
        from app.schemas.user import UserLogin

        credentials = MagicMock(spec=UserLogin)
        credentials.email = "test@example.com"
        credentials.password = "pass"
        result = await AuthService.authenticate_user(db, credentials)
        assert result is user

    @pytest.mark.asyncio
    async def test_raises_401_when_no_password_hash(self):
        user = _make_user(password_hash=None)
        db = _make_db(scalar_result=user)
        from app.schemas.user import UserLogin

        credentials = MagicMock(spec=UserLogin)
        credentials.email = "test@example.com"
        credentials.password = "pass"
        with pytest.raises(HTTPException) as exc_info:
            await AuthService.authenticate_user(db, credentials)
        assert exc_info.value.status_code == 401


# google_login_or_register
class TestGoogleLoginOrRegister:
    GOOGLE_DATA = {
        "email": "g@gmail.com",
        "full_name": "Google User",
        "google_id": "gid_123",
        "avatar_url": "http://pic.com/a.jpg",
    }

    @pytest.mark.asyncio
    async def test_returns_existing_user_with_google_id(self):
        user = _make_user(google_id="gid_123", is_email_verified=True)
        db = _make_db(scalar_result=user)
        result = await AuthService.google_login_or_register(db, self.GOOGLE_DATA)
        assert result is user
        db.commit.assert_not_called()

    @pytest.mark.asyncio
    async def test_updates_existing_user_without_google_id(self):
        user = _make_user(google_id=None, is_email_verified=True)
        db = _make_db(scalar_result=user)
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        await AuthService.google_login_or_register(db, self.GOOGLE_DATA)
        assert user.google_id == "gid_123"
        db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_verifies_email_for_existing_unverified_user(self):
        user = _make_user(google_id=None, is_email_verified=False)
        db = _make_db(scalar_result=user)
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        await AuthService.google_login_or_register(db, self.GOOGLE_DATA)
        assert user.is_email_verified is True

    @pytest.mark.asyncio
    async def test_creates_new_user_when_not_found(self):
        db = _make_db(scalar_result=None)
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        result = await AuthService.google_login_or_register(db, self.GOOGLE_DATA)

        db.add.assert_called_once()
        db.commit.assert_called_once()


# create_tokens
class TestCreateTokens:
    def test_returns_access_and_refresh_tokens(self):
        user = _make_user(id="uid", email="e@e.com", role="teacher")
        tokens = AuthService.create_tokens(user)
        assert "access_token" in tokens
        assert "refresh_token" in tokens
        assert isinstance(tokens["access_token"], str)
        assert isinstance(tokens["refresh_token"], str)


# refresh_access_token
class TestRefreshAccessToken:
    def test_returns_new_access_token_from_valid_refresh(self):
        user = _make_user()
        refresh_token = create_refresh_token(
            {"sub": str(user.id), "email": user.email, "role": user.role}
        )
        new_token = AuthService.refresh_access_token(refresh_token)
        assert isinstance(new_token, str)
        assert len(new_token) > 10

    def test_raises_401_for_invalid_token(self):
        with pytest.raises(HTTPException) as exc_info:
            AuthService.refresh_access_token("not.a.valid.token")
        assert exc_info.value.status_code == 401

    def test_raises_401_for_access_token_used_as_refresh(self):
        user = _make_user()
        access_token = create_access_token(
            {"sub": str(user.id), "email": user.email, "role": user.role}
        )
        with pytest.raises(HTTPException) as exc_info:
            AuthService.refresh_access_token(access_token)
        assert exc_info.value.status_code == 401
