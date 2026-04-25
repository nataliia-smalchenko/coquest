import uuid
from typing import Optional, Tuple, List

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserRole


class UserService:
    @staticmethod
    async def check_role_change(
        db: AsyncSession,
        user: User,
        new_role: UserRole,
        bypass_checks: bool = False,
    ) -> None:
        """Validate that a role change is allowed without mutating anything.

        Raises HTTPException 400 if ``bypass_checks`` is ``False`` and the
        teacher has resources, quests, or sessions that would be orphaned.
        Does nothing when ``new_role == user.role`` or when the transition is
        not restricted.

        Call this before making any other changes so that the validation and
        the subsequent writes can share a single ``db.commit()``.
        """
        if new_role == user.role:
            return

        if (
            not bypass_checks
            and user.role == UserRole.TEACHER
            and new_role == UserRole.STUDENT
        ):
            # Lazy imports to avoid circular dependencies at module load time.
            from app.models.game_run import GameRun
            from app.models.quest import Quest
            from app.models.resource import Resource

            has_resources = await db.scalar(
                select(func.count(Resource.id)).where(Resource.teacher_id == user.id)
            )
            has_quests = await db.scalar(
                select(func.count(Quest.id)).where(Quest.teacher_id == user.id)
            )
            has_sessions = await db.scalar(
                select(func.count(GameRun.id)).where(GameRun.teacher_id == user.id)
            )
            if has_resources or has_quests or has_sessions:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="cannot_change_role",
                )

    @staticmethod
    async def change_role(
        db: AsyncSession,
        user: User,
        new_role: UserRole,
        bypass_checks: bool = False,
    ) -> User:
        """Validate, apply, and persist a role change in one call.

        Delegates validation to ``check_role_change``, then commits.
        Use this from admin routes or any place where role is the only
        field being updated. For combined profile updates (name + role),
        call ``check_role_change`` first, mutate all fields, then commit
        once in the caller to avoid multiple round-trips.
        """
        await UserService.check_role_change(db, user, new_role, bypass_checks)
        if new_role == user.role:
            return user
        user.role = new_role
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    @staticmethod
    async def update_language(db: AsyncSession, user: User, language: str) -> User:
        """Persist a new preferred language for the user."""
        user.preferred_language = language
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    @staticmethod
    async def update_profile(
        db: AsyncSession,
        user: User,
        full_name: Optional[str],
        new_role: Optional[UserRole],
    ) -> User:
        """Update full_name and/or role in a single transaction.

        Role validation (``check_role_change``) is run before any mutation so
        that the commit only happens when all changes are valid.
        """
        if new_role is not None:
            await UserService.check_role_change(db, user, new_role, bypass_checks=False)
            user.role = new_role

        if full_name is not None:
            user.full_name = full_name

        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    @staticmethod
    async def list_users(
        db: AsyncSession, offset: int = 0, limit: int = 50
    ) -> Tuple[List[User], int]:
        """Return a page of users and the total count."""
        total = await db.scalar(select(func.count(User.id)))
        result = await db.execute(
            select(User).order_by(User.created_at.desc()).offset(offset).limit(limit)
        )
        return list(result.scalars().all()), total or 0

    @staticmethod
    async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> Optional[User]:
        """Load a user by ID, returning None if not found."""
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_user_or_404(db: AsyncSession, user_id: uuid.UUID) -> User:
        """Load a user by ID or raise HTTP 404."""
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
            )
        return user

    @staticmethod
    async def delete_user(db: AsyncSession, user: User) -> None:
        """Hard-delete a user and all cascade-related data.

        Cascade behaviour is defined on the SQLAlchemy relationships
        (``cascade="all, delete-orphan"``), so related resources, quests,
        sessions, etc. are removed automatically.

        Note: soft-delete (``is_active`` flag) can be added in a future
        migration if the product requires it.
        """
        await db.delete(user)
        await db.commit()
