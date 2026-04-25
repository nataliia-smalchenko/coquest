import enum
import uuid
from datetime import datetime
from typing import List, Optional, TYPE_CHECKING

from sqlalchemy import String, DateTime, Enum, ForeignKey, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.game_run import GameRun
    from app.models.run_team import RunTeam
    from app.models.user import User
    from app.models.run_progress import RunProgress
    from app.models.run_chat import RunChat


class PlayerStatus(str, enum.Enum):
    WAITING = "waiting"
    PLAYING = "playing"
    FINISHED = "finished"


class RunPlayer(Base):
    __tablename__ = "run_players"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("game_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    team_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid,
        ForeignKey("run_teams.id", ondelete="SET NULL"),
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
    run: Mapped["GameRun"] = relationship("GameRun", back_populates="players")
    team: Mapped[Optional["RunTeam"]] = relationship(
        "RunTeam",
        back_populates="players",
        foreign_keys="[RunPlayer.team_id]",
    )
    user: Mapped[Optional["User"]] = relationship(
        "User", back_populates="game_runs", foreign_keys=[user_id]
    )
    progress: Mapped[List["RunProgress"]] = relationship(
        "RunProgress", back_populates="player", cascade="all, delete-orphan"
    )
    chat_messages: Mapped[List["RunChat"]] = relationship(
        "RunChat", back_populates="player", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<RunPlayer {self.display_name!r} status={self.status!r}>"
