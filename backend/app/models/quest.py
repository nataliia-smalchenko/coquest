import enum
import uuid
from datetime import datetime
from typing import List, Optional, TYPE_CHECKING

from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Text, func, Uuid, UniqueConstraint
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.map import Map
    from app.models.resource import Resource


class QuestStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class Quest(Base):
    __tablename__ = "quests"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    map_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("maps.id", ondelete="SET NULL"), nullable=True, index=True
    )
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    status: Mapped[QuestStatus] = mapped_column(
        SQLEnum(QuestStatus, native_enum=False), default=QuestStatus.DRAFT, nullable=False
    )
    max_players: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    teacher: Mapped["User"] = relationship("User", back_populates="quests")
    map: Mapped[Optional["Map"]] = relationship("Map")
    translations: Mapped[List["QuestTranslation"]] = relationship(
        "QuestTranslation", back_populates="quest", cascade="all, delete-orphan"
    )
    settings: Mapped[Optional["QuestSettings"]] = relationship(
        "QuestSettings", back_populates="quest", cascade="all, delete-orphan", uselist=False
    )
    resources: Mapped[List["QuestResource"]] = relationship(
        "QuestResource", back_populates="quest", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Quest {self.slug!r} status={self.status!r}>"


class QuestTranslation(Base):
    __tablename__ = "quest_translations"
    __table_args__ = (
        UniqueConstraint("quest_id", "language", name="uq_quest_translations_quest_language"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    quest_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("quests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    language: Mapped[str] = mapped_column(String(5), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    quest: Mapped["Quest"] = relationship("Quest", back_populates="translations")

    def __repr__(self) -> str:
        return f"<QuestTranslation quest_id={self.quest_id!r} lang={self.language!r}>"


class QuestSettings(Base):
    __tablename__ = "quest_settings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    quest_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("quests.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    time_limit_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    random_order: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    show_all_texts: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    keep_completed_in_materials: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    show_score_after: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    show_correct_answers: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    distribute_texts_in_team: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    quest: Mapped["Quest"] = relationship("Quest", back_populates="settings")

    def __repr__(self) -> str:
        return f"<QuestSettings quest_id={self.quest_id!r}>"


class QuestResource(Base):
    __tablename__ = "quest_resources"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    quest_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("quests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    resource_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("resources.id", ondelete="CASCADE"), nullable=False
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    quest: Mapped["Quest"] = relationship("Quest", back_populates="resources")
    resource: Mapped["Resource"] = relationship("Resource")

    def __repr__(self) -> str:
        return f"<QuestResource quest_id={self.quest_id!r} resource_id={self.resource_id!r}>"
