from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.utils.dependencies import get_current_user
from app.schemas.user import UserResponse, UserUpdate, UserUpdateLanguage
from app.models.user import User, UserRole

router = APIRouter(prefix="/api/user", tags=["User"])


@router.patch("/language", response_model=UserResponse)
async def update_language(
    data: UserUpdateLanguage,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user's preferred language"""

    db.add(current_user)

    current_user.preferred_language = data.language

    await db.commit()
    await db.refresh(current_user)

    return current_user


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
    if data.full_name is not None:
        current_user.full_name = data.full_name

    if data.role is not None and data.role != current_user.role:
        if current_user.role == UserRole.TEACHER and data.role == UserRole.STUDENT:
            from app.models.game_session import GameSession
            from app.models.quest import Quest
            from app.models.resource import Resource

            has_resources = await db.scalar(
                select(func.count(Resource.id)).where(
                    Resource.teacher_id == current_user.id
                )
            )
            has_quests = await db.scalar(
                select(func.count(Quest.id)).where(Quest.teacher_id == current_user.id)
            )
            has_sessions = await db.scalar(
                select(func.count(GameSession.id)).where(
                    GameSession.teacher_id == current_user.id
                )
            )
            if has_resources or has_quests or has_sessions:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="cannot_change_role",
                )
        current_user.role = data.role

    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return current_user
