import uuid
import enum
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import String, DateTime, Enum, Boolean, func, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.resource_folder import ResourceFolder
    from app.models.tag import Tag
    from app.models.resource import Resource
    from app.models.quest import Quest
    from app.models.game_run import GameRun
    from app.models.run_player import RunPlayer


class UserRole(str, enum.Enum):
    TEACHER = "teacher"
    STUDENT = "student"
    ADMIN = "admin"


class UserLanguage(str, enum.Enum):
    UK = "uk"
    EN = "en"


class AuthProvider(str, enum.Enum):
    EMAIL = "email"
    GOOGLE = "google"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)

    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )

    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    full_name: Mapped[str] = mapped_column(String(255), nullable=False)

    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, native_enum=True), nullable=False, index=True
    )

    # OAuth fields
    auth_provider: Mapped[AuthProvider] = mapped_column(
        Enum(AuthProvider), default=AuthProvider.EMAIL, nullable=False
    )
    google_id: Mapped[Optional[str]] = mapped_column(
        String(255), unique=True, nullable=True, index=True
    )

    # Email verification
    is_email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    email_verification_token: Mapped[Optional[str]] = mapped_column(String(255))
    email_verification_sent_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )

    # Profile
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500))

    # Language preference
    preferred_language: Mapped[UserLanguage] = mapped_column(
        Enum(UserLanguage, native_enum=True), default=UserLanguage.UK, nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    resource_folders: Mapped[List["ResourceFolder"]] = relationship(
        "ResourceFolder", back_populates="teacher", cascade="all, delete-orphan"
    )
    tags: Mapped[List["Tag"]] = relationship(
        "Tag", back_populates="teacher", cascade="all, delete-orphan"
    )
    resources: Mapped[List["Resource"]] = relationship(
        "Resource", back_populates="teacher", cascade="all, delete-orphan"
    )
    quests: Mapped[List["Quest"]] = relationship(
        "Quest", back_populates="teacher", cascade="all, delete-orphan"
    )
    teaching_runs: Mapped[List["GameRun"]] = relationship(
        "GameRun",
        back_populates="teacher",
        foreign_keys="GameRun.teacher_id",
        cascade="all, delete-orphan",
    )
    game_runs: Mapped[List["RunPlayer"]] = relationship(
        "RunPlayer", back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User {self.email!r} role={self.role.value!r}>"
