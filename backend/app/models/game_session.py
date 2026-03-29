import enum
import uuid
from datetime import datetime
from typing import List, Optional, TYPE_CHECKING

from sqlalchemy import String, Integer, Boolean, DateTime, Enum, ForeignKey, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.quest import Quest
    from app.models.user import User
    from app.models.session_team import SessionTeam
    from app.models.session_player import SessionPlayer
    from app.models.session_progress import SessionProgress
    from app.models.session_chat import SessionChat


class SessionStatus(str, enum.Enum):
    WAITING = "waiting"
    ACTIVE = "active"
    COMPLETED = "completed"
    STOPPED = "stopped"
    SCHEDULED = "scheduled"


class GameSession(Base):
    __tablename__ = "game_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    quest_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("quests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_code: Mapped[str] = mapped_column(
        String(6), nullable=False, unique=True, index=True
    )
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[SessionStatus] = mapped_column(
        Enum(SessionStatus, native_enum=False),
        default=SessionStatus.WAITING,
        nullable=False,
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ends_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    max_players: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    allow_solo_in_team: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    show_feedback_after_answer: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    show_score_after: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    show_correct_answers: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    keep_completed_in_materials: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    allow_change_answers: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    teams: Mapped[List["SessionTeam"]] = relationship(
        "SessionTeam", back_populates="session", cascade="all, delete-orphan"
    )
    players: Mapped[List["SessionPlayer"]] = relationship(
        "SessionPlayer", back_populates="session", cascade="all, delete-orphan"
    )
    progress: Mapped[List["SessionProgress"]] = relationship(
        "SessionProgress", back_populates="session", cascade="all, delete-orphan"
    )
    chat_messages: Mapped[List["SessionChat"]] = relationship(
        "SessionChat", back_populates="session", cascade="all, delete-orphan"
    )
    quest: Mapped["Quest"] = relationship("Quest", back_populates="sessions")
    teacher: Mapped["User"] = relationship(
        "User", back_populates="teaching_sessions", foreign_keys=[teacher_id]
    )

    def __repr__(self) -> str:
        return f"<GameSession code={self.session_code!r} status={self.status!r}>"
