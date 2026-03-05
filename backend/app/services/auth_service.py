from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from app.models.user import User, AuthProvider
from app.schemas.user import UserCreate, UserLogin
from app.utils.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    create_refresh_token,
    verify_token,
)
from app.services.email_service import EmailService
from datetime import datetime, timezone


class AuthService:
    @staticmethod
    async def register_user(db: AsyncSession, user_data: UserCreate) -> User:
        """Register new user with email verification"""

        result = await db.execute(select(User).where(User.email == user_data.email))
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
            )

        verification_token = EmailService.generate_verification_token()
        hashed_password = get_password_hash(user_data.password)

        db_user = User(
            email=user_data.email,
            password_hash=hashed_password,
            full_name=user_data.full_name,
            role=user_data.role,
            auth_provider=AuthProvider.EMAIL,
            is_email_verified=False,
            email_verification_token=verification_token,
            email_verification_sent_at=datetime.now(timezone.utc),
        )

        db.add(db_user)

        try:
            await db.flush()
            await EmailService.send_verification_email(
                email=db_user.email,
                full_name=db_user.full_name,
                token=verification_token,
            )
            await db.commit()
            await db.refresh(db_user)
            return db_user
        except Exception as e:
            await db.rollback()
            print(f"Registration error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send verification email",
            )

    @staticmethod
    async def verify_email(db: AsyncSession, token: str) -> User:
        """Verify user email"""
        result = await db.execute(
            select(User).where(User.email_verification_token == token)
        )
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid verification token",
            )

        if user.is_email_verified:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Email already verified"
            )

        if EmailService.is_token_expired(user.email_verification_sent_at):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Verification token expired",
            )

        user.is_email_verified = True
        user.email_verification_token = None
        user.email_verification_sent_at = None

        await db.commit()
        await db.refresh(user)

        try:
            await EmailService.send_welcome_email(
                email=user.email, full_name=user.full_name
            )
        except Exception as e:
            print(f"Failed to send welcome email: {e}")

        return user

    @staticmethod
    async def resend_verification_email(db: AsyncSession, email: str):
        """Resend verification email"""
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
            )

        if user.is_email_verified:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Email already verified"
            )

        verification_token = EmailService.generate_verification_token()
        user.email_verification_token = verification_token
        user.email_verification_sent_at = datetime.now(timezone.utc)

        try:
            await db.flush()
            await EmailService.send_verification_email(
                email=user.email, full_name=user.full_name, token=verification_token
            )
            await db.commit()
        except Exception as e:
            await db.rollback()
            print(f"Resend verification error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to resend verification email",
            )

    @staticmethod
    async def authenticate_user(db: AsyncSession, credentials: UserLogin) -> User:
        """Authenticate user (email/password only)"""
        result = await db.execute(select(User).where(User.email == credentials.email))
        user = result.scalar_one_or_none()

        if not user or not user.password_hash:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
            )

        if not verify_password(credentials.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
            )

        if not user.is_email_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Please verify your email before logging in",
            )

        return user

    @staticmethod
    async def google_login_or_register(db: AsyncSession, google_data: dict) -> User:
        """
        Login or register user via Google OAuth.
        google_data should contain: email, full_name, google_id, avatar_url
        """
        result = await db.execute(
            select(User).where(User.email == google_data["email"])
        )
        user = result.scalar_one_or_none()

        if user:
            if not user.google_id:
                user.google_id = google_data["google_id"]
                if not user.avatar_url and google_data.get("avatar_url"):
                    user.avatar_url = google_data.get("avatar_url")

                if not user.is_email_verified:
                    user.is_email_verified = True
                    user.email_verification_token = None

                await db.commit()
                await db.refresh(user)
            return user

        # New user from Google
        new_user = User(
            email=google_data["email"],
            full_name=google_data["full_name"],
            google_id=google_data["google_id"],
            avatar_url=google_data.get("avatar_url"),
            role="student",  # Default role
            auth_provider=AuthProvider.GOOGLE,
            is_email_verified=True,  # Google already verified this email
            password_hash=None,  # No password for Google users
        )

        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)
        return new_user

    @staticmethod
    def create_tokens(user: User) -> dict:
        """Create access and refresh tokens"""
        token_data = {"sub": str(user.id), "email": user.email, "role": user.role}

        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token(token_data)

        return {"access_token": access_token, "refresh_token": refresh_token}

    @staticmethod
    def refresh_access_token(refresh_token: str) -> str:
        """Create new access token from refresh token"""
        payload = verify_token(refresh_token, token_type="refresh")

        if not payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
            )

        token_data = {
            "sub": payload["sub"],
            "email": payload["email"],
            "role": payload["role"],
        }

        return create_access_token(token_data)
