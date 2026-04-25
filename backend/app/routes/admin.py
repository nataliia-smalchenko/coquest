import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.user import AdminChangeRoleRequest, AdminUserListResponse, UserResponse
from app.services.user_service import UserService
from app.utils.dependencies import get_current_admin

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.get("/users", response_model=AdminUserListResponse)
async def list_users(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    _: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return a paginated list of all users."""
    users, total = await UserService.list_users(db, offset=offset, limit=limit)
    return AdminUserListResponse(users=users, total=total, offset=offset, limit=limit)


@router.patch("/users/{user_id}/role", response_model=UserResponse)
async def change_user_role(
    user_id: uuid.UUID,
    data: AdminChangeRoleRequest,
    _: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Change the role of any user.

    Admins bypass the business-rule checks that prevent teachers with
    existing content from switching to the student role.
    """
    user = await UserService.get_user_or_404(db, user_id)
    return await UserService.change_role(db, user, data.role, bypass_checks=True)


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: uuid.UUID,
    _: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete a user and all their associated data.

    Cascade deletes (resources, quests, sessions, etc.) are handled by the
    SQLAlchemy ``cascade="all, delete-orphan"`` relationships on the User model.
    """
    user = await UserService.get_user_or_404(db, user_id)
    await UserService.delete_user(db, user)
