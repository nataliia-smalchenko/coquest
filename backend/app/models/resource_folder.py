import uuid
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import String, DateTime, ForeignKey, func, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.resource import Resource


class ResourceFolder(Base):
    __tablename__ = "resource_folders"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)

    teacher_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid,
        ForeignKey("resource_folders.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    teacher: Mapped["User"] = relationship("User", back_populates="resource_folders")

    parent: Mapped[Optional["ResourceFolder"]] = relationship(
        "ResourceFolder", back_populates="children", remote_side="ResourceFolder.id"
    )

    children: Mapped[List["ResourceFolder"]] = relationship(
        "ResourceFolder",
        back_populates="parent",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    resources: Mapped[List["Resource"]] = relationship(
        "Resource",
        back_populates="folder",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self) -> str:
        return f"<ResourceFolder {self.name!r} (id={self.id})>"
