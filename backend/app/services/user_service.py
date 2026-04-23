import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserRole


class UserService:
    @staticmethod
    async def change_role(
        db: AsyncSession,
        user: User,
        new_role: UserRole,
        bypass_checks: bool = False,
    ) -> User:
        """Change a user's role.

        Args:
            db: Async DB session.
            user: The user whose role is being changed.
            new_role: The target role.
            bypass_checks: When ``True``, skip the business rule that prevents
                a teacher with existing content from downgrading to student.
                Pass ``True`` from admin routes; leave ``False`` for
                self-service role changes.

        Returns:
            The updated and refreshed ``User`` instance.

        Raises:
            HTTPException 400: If ``bypass_checks`` is ``False`` and the teacher
                has active resources, quests, or sessions.
        """
        if new_role == user.role:
            return user

        if not bypass_checks and user.role == UserRole.TEACHER and new_role == UserRole.STUDENT:
            # Lazy imports to avoid circular dependencies at module load time.
            from app.models.game_session import GameSession
            from app.models.quest import Quest
            from app.models.resource import Resource

            has_resources = await db.scalar(
                select(func.count(Resource.id)).where(Resource.teacher_id == user.id)
            )
            has_quests = await db.scalar(
                select(func.count(Quest.id)).where(Quest.teacher_id == user.id)
            )
            has_sessions = await db.scalar(
                select(func.count(GameSession.id)).where(
                    GameSession.teacher_id == user.id
                )
            )
            if has_resources or has_quests or has_sessions:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="cannot_change_role",
                )

        user.role = new_role
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

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
