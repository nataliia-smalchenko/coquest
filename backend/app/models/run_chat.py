import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.game_run import GameRun
    from app.models.run_player import RunPlayer


class RunChat(Base):
    __tablename__ = "run_chats"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("game_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    player_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("run_players.id", ondelete="CASCADE"), nullable=False, index=True
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    run: Mapped["GameRun"] = relationship(
        "GameRun", back_populates="chat_messages"
    )
    player: Mapped["RunPlayer"] = relationship(
        "RunPlayer", back_populates="chat_messages"
    )

    def __repr__(self) -> str:
        return f"<RunChat session_id={self.session_id!r}>"
