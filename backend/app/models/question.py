import uuid
import enum
from datetime import datetime
from typing import Optional, List, Any, TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Text, func, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.resource import Resource


class QuestionType(str, enum.Enum):
    SINGLE = "single"
    MULTIPLE = "multiple"
    SHORT = "short"
    OPEN = "open"


class DifficultyLevel(str, enum.Enum):
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    SUFFICIENT = "sufficient"
    ADVANCED = "advanced"


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)

    resource_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("resources.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,  # Гарантує One-to-One
        index=True,
    )

    question_type: Mapped[QuestionType] = mapped_column(
        Enum(QuestionType, native_enum=True), nullable=False, index=True
    )

    body: Mapped[str] = mapped_column(Text, nullable=False)

    explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    options: Mapped[List[Any]] = mapped_column(
        JSONB, nullable=False, server_default="[]", default=list
    )

    correct_answers: Mapped[List[Any]] = mapped_column(
        JSONB, nullable=False, server_default="[]", default=list
    )

    difficulty: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    requires_review: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    resource: Mapped["Resource"] = relationship("Resource", back_populates="question")

    def __repr__(self) -> str:
        body_preview = (self.body[:30] + "..") if len(self.body) > 30 else self.body
        return (
            f"<Question id={self.id} type={self.question_type!r} body={body_preview!r}>"
        )
