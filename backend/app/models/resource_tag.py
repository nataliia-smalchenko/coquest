import uuid
from sqlalchemy import ForeignKey, Uuid
from sqlalchemy.orm import mapped_column, Mapped
from app.database import Base


class ResourceTag(Base):
    __tablename__ = "resource_tags"

    resource_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("resources.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    )
