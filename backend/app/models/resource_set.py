import enum
import uuid
from datetime import datetime
from typing import List, Optional, TYPE_CHECKING

from sqlalchemy import (
    String,
    Integer,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    func,
    Uuid,
    UniqueConstraint,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.resource import Resource
    from app.models.game_run import GameRun


class ResourceSetStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class ResourceSet(Base):
    __tablename__ = "resource_sets"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    status: Mapped[ResourceSetStatus] = mapped_column(
        SQLEnum(ResourceSetStatus, native_enum=False),
        default=ResourceSetStatus.DRAFT,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    teacher: Mapped["User"] = relationship("User", back_populates="resource_sets")
    translations: Mapped[List["ResourceSetTranslation"]] = relationship(
        "ResourceSetTranslation",
        back_populates="resource_set",
        cascade="all, delete-orphan",
    )
    settings: Mapped[Optional["ResourceSetSettings"]] = relationship(
        "ResourceSetSettings",
        back_populates="resource_set",
        cascade="all, delete-orphan",
        uselist=False,
    )
    resources: Mapped[List["ResourceSetResource"]] = relationship(
        "ResourceSetResource",
        back_populates="resource_set",
        cascade="all, delete-orphan",
    )
    runs: Mapped[List["GameRun"]] = relationship(
        "GameRun", back_populates="resource_set", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<ResourceSet {self.slug!r} status={self.status!r}>"


class ResourceSetTranslation(Base):
    __tablename__ = "resource_set_translations"
    __table_args__ = (
        UniqueConstraint(
            "resource_set_id",
            "language",
            name="uq_resource_set_translations_resource_set_language",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    resource_set_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("resource_sets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    language: Mapped[str] = mapped_column(String(5), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    resource_set: Mapped["ResourceSet"] = relationship(
        "ResourceSet", back_populates="translations"
    )

    def __repr__(self) -> str:
        return f"<ResourceSetTranslation resource_set_id={self.resource_set_id!r} lang={self.language!r}>"


class ResourceSetSettings(Base):
    __tablename__ = "resource_set_settings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    resource_set_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("resource_sets.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    time_limit_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    random_order: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    max_grade: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Relationships
    resource_set: Mapped["ResourceSet"] = relationship(
        "ResourceSet", back_populates="settings"
    )

    def __repr__(self) -> str:
        return f"<ResourceSetSettings resource_set_id={self.resource_set_id!r}>"


class ResourceSetResource(Base):
    __tablename__ = "resource_set_resources"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    resource_set_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("resource_sets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    resource_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("resources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    resource_set: Mapped["ResourceSet"] = relationship(
        "ResourceSet", back_populates="resources"
    )
    resource: Mapped["Resource"] = relationship("Resource")

    def __repr__(self) -> str:
        return f"<ResourceSetResource resource_set_id={self.resource_set_id!r} resource_id={self.resource_id!r}>"
