import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.game_session import GameSession
    from app.models.session_player import SessionPlayer


class SessionChat(Base):
    __tablename__ = "session_chat"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("game_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    player_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("session_players.id", ondelete="CASCADE"), nullable=False, index=True
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    session: Mapped["GameSession"] = relationship(
        "GameSession", back_populates="chat_messages"
    )
    player: Mapped["SessionPlayer"] = relationship(
        "SessionPlayer", back_populates="chat_messages"
    )

    def __repr__(self) -> str:
        return f"<SessionChat session_id={self.session_id!r}>"
