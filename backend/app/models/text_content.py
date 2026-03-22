import uuid
from datetime import datetime
from typing import List, Dict, Any, TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, func, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.resource import Resource


class TextContent(Base):
    __tablename__ = "text_contents"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)

    resource_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("resources.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    body: Mapped[Dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default="{}", default=dict
    )

    images: Mapped[List[Any]] = mapped_column(
        JSONB, nullable=False, server_default="[]", default=list
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    resource: Mapped["Resource"] = relationship(
        "Resource", back_populates="text_content"
    )

    def __repr__(self) -> str:
        return f"<TextContent resource_id={self.resource_id}>"
