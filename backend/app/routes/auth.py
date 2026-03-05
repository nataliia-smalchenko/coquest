from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
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
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", response_model=dict, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),  # AsyncSession!
):
    """Register new user"""
    user = await AuthService.register_user(db, user_data)

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
async def google_auth(request: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    """Login or register with Google"""
    # Verify token with Google public keys (cached in Redis)
    google_user_info = await OAuthService.verify_google_token(request.token)

    # Add requested role to the data if it's a new user
    google_user_info["requested_role"] = request.role

    # Handle registration or login logic
    user = await AuthService.google_login_or_register(db, google_user_info)
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
