from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.utils.dependencies import get_current_user
from app.schemas.user import UserResponse, UserUpdate, UserUpdateLanguage
from app.models.user import User
from app.services.user_service import UserService


router = APIRouter(prefix="/api/user", tags=["User"])


@router.patch("/language", response_model=UserResponse)
async def update_language(
    data: UserUpdateLanguage,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user's preferred language"""
    return await UserService.update_language(db, current_user, data.language)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user info"""

    return current_user


@router.patch("/profile", response_model=UserResponse)
async def update_profile(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user profile: full_name and/or role"""
    return await UserService.update_profile(db, current_user, data.full_name, data.role)
