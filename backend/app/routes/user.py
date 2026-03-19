from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.utils.dependencies import get_current_user
from app.schemas.user import UserResponse, UserUpdateLanguage
from app.models.user import User

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
