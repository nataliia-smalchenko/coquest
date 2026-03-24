import uuid
from datetime import datetime
from typing import List, Optional, TYPE_CHECKING

from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Text, func, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    pass


class Map(Base):
    __tablename__ = "maps"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    original_width: Mapped[int] = mapped_column(Integer, nullable=False)
    original_height: Mapped[int] = mapped_column(Integer, nullable=False)
    landscape_only_mobile: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    translations: Mapped[List["MapTranslation"]] = relationship(
        "MapTranslation", back_populates="map", cascade="all, delete-orphan"
    )
    objects: Mapped[List["MapObject"]] = relationship(
        "MapObject", back_populates="map", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Map {self.slug!r}>"


class MapTranslation(Base):
    __tablename__ = "map_translations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    map_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("maps.id", ondelete="CASCADE"), nullable=False, index=True
    )
    language: Mapped[str] = mapped_column(String(5), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    map: Mapped["Map"] = relationship("Map", back_populates="translations")


class MapObject(Base):
    __tablename__ = "map_objects"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    map_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("maps.id", ondelete="CASCADE"), nullable=False, index=True
    )
    slug: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    x: Mapped[int] = mapped_column(Integer, nullable=False)
    y: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)

    z_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_interactive: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    order_index: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False, index=True
    )

    map: Mapped["Map"] = relationship("Map", back_populates="objects")
    hints: Mapped[List["MapObjectHint"]] = relationship(
        "MapObjectHint", back_populates="object", cascade="all, delete-orphan"
    )


class MapObjectHint(Base):
    __tablename__ = "map_object_hints"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    object_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("map_objects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    language: Mapped[str] = mapped_column(String(5), nullable=False, index=True)

    hint_text: Mapped[str] = mapped_column(Text, nullable=False)

    object: Mapped["MapObject"] = relationship("MapObject", back_populates="hints")
