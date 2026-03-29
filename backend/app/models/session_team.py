import enum
import uuid
from datetime import datetime
from typing import List, Optional, TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Uuid, func
from sqlalchemy import Integer  # noqa: F401 (imported for type consistency)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.game_session import GameSession
    from app.models.session_player import SessionPlayer
    from app.models.session_progress import SessionProgress


class TeamStatus(str, enum.Enum):
    WAITING = "waiting"
    ACTIVE = "active"
    COMPLETED = "completed"


class SessionTeam(Base):
    __tablename__ = "session_teams"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("game_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[TeamStatus] = mapped_column(
        Enum(TeamStatus, native_enum=False),
        default=TeamStatus.WAITING,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    hint_player_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid,
        ForeignKey(
            "session_players.id",
            ondelete="SET NULL",
            use_alter=True,
        ),
        nullable=True,
    )

    # Relationships
    session: Mapped["GameSession"] = relationship("GameSession", back_populates="teams")
    players: Mapped[List["SessionPlayer"]] = relationship(
        "SessionPlayer",
        back_populates="team",
        foreign_keys="[SessionPlayer.team_id]",
    )
    progress: Mapped[List["SessionProgress"]] = relationship(
        "SessionProgress", back_populates="team"
    )

    def __repr__(self) -> str:
        return f"<SessionTeam id={self.id!r} status={self.status!r}>"
