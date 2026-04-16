from fastapi import APIRouter, Depends, status, Header
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.database import get_db
from app.schemas.user import (
    UserCreate,
    UserLogin,
    GoogleAuthRequest,
    TokenResponse,
    UserResponse,
    EmailVerificationRequest,
    ResendVerificationRequest,
    RefreshTokenRequest,
)
from app.services.auth_service import AuthService
from app.services.oauth_service import OAuthService
from app.services.i18n_service import I18nService
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def get_language(accept_language: Optional[str] = Header(None)) -> str:
    """Extracts and detects language from Accept-Language header automatically"""
    return I18nService.detect_language_from_header(accept_language)


@router.post("/register", response_model=dict, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),
    language: str = Depends(get_language),
):
    """Register new user"""

    final_language = getattr(user_data, "language", None) or language

    user = await AuthService.register_user(db, user_data, final_language)

    return {
        "message": "Registration successful. Please check your email.",
        "email": user.email,
    }


@router.post("/verify-email", response_model=UserResponse)
async def verify_email(
    request: EmailVerificationRequest, db: AsyncSession = Depends(get_db)
):
    """Verify user email"""
    user = await AuthService.verify_email(db, request.token)
    return user


@router.post("/resend-verification")
async def resend_verification(
    request: ResendVerificationRequest, db: AsyncSession = Depends(get_db)
):
    """Resend verification email"""
    await AuthService.resend_verification_email(db, request.email)
    return {"message": "Verification email sent"}


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    """Login with email/password"""
    user = await AuthService.authenticate_user(db, credentials)
    tokens = AuthService.create_tokens(user)

    return {**tokens, "user": user}


@router.post("/google", response_model=TokenResponse)
async def google_auth(
    request: GoogleAuthRequest,
    db: AsyncSession = Depends(get_db),
    language: str = Depends(get_language),
):
    """Login or register with Google"""
    # Verify ID token locally using Google public keys cached in Redis
    google_user_info = await OAuthService.verify_google_id_token(request.credential)

    # Add requested role to the data if it's a new user
    google_user_info["requested_role"] = getattr(request, "role", "student")

    # Pass the browser language to save if this is a new registration
    user = await AuthService.google_login_or_register(db, google_user_info, language)
    tokens = AuthService.create_tokens(user)

    return {**tokens, "user": user}


@router.post("/refresh")
async def refresh_token(request: RefreshTokenRequest):
    """Refresh access token"""
    new_access_token = AuthService.refresh_access_token(request.refresh_token)

    return {"access_token": new_access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user=Depends(get_current_user)):
    """Get current user info"""
    return current_user
