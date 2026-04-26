import uuid
import enum
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import String, DateTime, Enum, ForeignKey, func, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.resource_folder import ResourceFolder
    from app.models.tag import Tag
    from app.models.text_content import TextContent
    from app.models.question import Question
    from app.models.run_progress import RunProgress


class ResourceType(str, enum.Enum):
    TEXT = "text"
    QUESTION = "question"


class Resource(Base):
    __tablename__ = "resources"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)

    teacher_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    folder_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid,
        ForeignKey("resource_folders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    type: Mapped[ResourceType] = mapped_column(
        Enum(ResourceType, native_enum=True), nullable=False, index=True
    )

    title: Mapped[str] = mapped_column(String(500), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    teacher: Mapped["User"] = relationship("User", back_populates="resources")
    folder: Mapped[Optional["ResourceFolder"]] = relationship(
        "ResourceFolder", back_populates="resources"
    )
    tags: Mapped[List["Tag"]] = relationship(
        "Tag", secondary="resource_tags", back_populates="resources"
    )
    text_content: Mapped[Optional["TextContent"]] = relationship(
        "TextContent",
        back_populates="resource",
        uselist=False,
        cascade="all, delete-orphan",
    )
    question: Mapped[Optional["Question"]] = relationship(
        "Question",
        back_populates="resource",
        uselist=False,
        cascade="all, delete-orphan",
    )
    progress_items: Mapped[List["RunProgress"]] = relationship(
        "RunProgress", back_populates="resource"
    )

    # Populated at query time, not stored in DB
    has_content: bool = False

    def __repr__(self) -> str:
        return f"<Resource {self.title!r} type={self.type}>"
