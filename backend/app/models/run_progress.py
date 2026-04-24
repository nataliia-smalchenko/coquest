import enum
import uuid
from datetime import datetime
from typing import Optional, TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.game_run import GameRun
    from app.models.run_team import RunTeam
    from app.models.run_player import RunPlayer
    from app.models.resource import Resource
    from app.models.map import MapObject


class ProgressStatus(str, enum.Enum):
    ASSIGNED = "assigned"
    VIEWED = "viewed"
    ANSWERED = "answered"


class RunProgress(Base):
    __tablename__ = "run_progress"

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
    player_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("run_players.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    resource_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("resources.id", ondelete="SET NULL"), nullable=True, index=True
    )
    map_object_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("map_objects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[ProgressStatus] = mapped_column(
        Enum(ProgressStatus, native_enum=False),
        default=ProgressStatus.ASSIGNED,
        nullable=False,
    )
    step_order: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    answer: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    requires_review: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    run: Mapped["GameRun"] = relationship(
        "GameRun", back_populates="progress"
    )
    team: Mapped[Optional["RunTeam"]] = relationship(
        "RunTeam", back_populates="progress"
    )
    player: Mapped["RunPlayer"] = relationship(
        "RunPlayer", back_populates="progress"
    )
    resource: Mapped[Optional["Resource"]] = relationship(
        "Resource", back_populates="progress_items", foreign_keys=[resource_id]
    )
    map_object: Mapped[Optional["MapObject"]] = relationship(
        "MapObject", back_populates="progress_items", foreign_keys=[map_object_id]
    )

    def __repr__(self) -> str:
        return f"<RunProgress player_id={self.player_id!r} status={self.status!r}>"
