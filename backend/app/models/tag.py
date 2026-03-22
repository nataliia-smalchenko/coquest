import uuid
from datetime import datetime
from typing import List, TYPE_CHECKING

from sqlalchemy import String, DateTime, ForeignKey, func, Uuid, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.resource import Resource


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)

    teacher_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)

    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#6366f1")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    teacher: Mapped["User"] = relationship("User", back_populates="tags")

    resources: Mapped[List["Resource"]] = relationship(
        "Resource", secondary="resource_tags", back_populates="tags"
    )

    __table_args__ = (
        UniqueConstraint("teacher_id", "name", name="uq_teacher_tag_name"),
    )

    def __repr__(self) -> str:
        return f"<Tag {self.name!r}>"
