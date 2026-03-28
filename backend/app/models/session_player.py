import enum
import uuid
from datetime import datetime
from typing import List, Optional, TYPE_CHECKING

from sqlalchemy import String, DateTime, Enum, ForeignKey, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.game_session import GameSession
    from app.models.session_team import SessionTeam
    from app.models.user import User
    from app.models.session_progress import SessionProgress
    from app.models.session_chat import SessionChat


class PlayerStatus(str, enum.Enum):
    WAITING = "waiting"
    PLAYING = "playing"
    FINISHED = "finished"


class SessionPlayer(Base):
    __tablename__ = "session_players"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("game_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    team_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid,
        ForeignKey("session_teams.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    guest_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    guest_token: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True, index=True
    )
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar_color: Mapped[str] = mapped_column(
        String(7), default="#6366f1", nullable=False
    )
    status: Mapped[PlayerStatus] = mapped_column(
        Enum(PlayerStatus, native_enum=False),
        default=PlayerStatus.WAITING,
        nullable=False,
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    results_available_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    session: Mapped["GameSession"] = relationship(
        "GameSession", back_populates="players"
    )
    team: Mapped[Optional["SessionTeam"]] = relationship(
        "SessionTeam", back_populates="players"
    )
    user: Mapped[Optional["User"]] = relationship(
        "User", back_populates="game_sessions", foreign_keys=[user_id]
    )
    progress: Mapped[List["SessionProgress"]] = relationship(
        "SessionProgress", back_populates="player", cascade="all, delete-orphan"
    )
    chat_messages: Mapped[List["SessionChat"]] = relationship(
        "SessionChat", back_populates="player", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<SessionPlayer {self.display_name!r} status={self.status!r}>"
