import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.quest import QuestStatus


# Settings
class QuestSettingsCreate(BaseModel):
    time_limit_minutes: Optional[int] = None
    random_order: bool = False
    max_grade: Optional[int] = None


class QuestSettingsResponse(BaseModel):
    time_limit_minutes: Optional[int] = None
    random_order: bool
    max_grade: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


# Resources
class QuestResourceItem(BaseModel):
    """One resource attached to a quest.

    Example:
        {"resource_id": "30bbc28f-...", "order_index": 0}
    """

    resource_id: uuid.UUID = Field(
        ..., description="Resource UUID from the teacher's library"
    )
    order_index: int = Field(
        default=0, ge=0, description="Display order (0, 1, 2, ...)"
    )


class QuestResourceResponse(BaseModel):
    id: uuid.UUID
    resource_id: uuid.UUID
    order_index: int

    model_config = ConfigDict(from_attributes=True)


# Translations
class QuestTranslationResponse(BaseModel):
    language: str
    title: str
    description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# Create / Update
class QuestCreate(BaseModel):
    map_id: uuid.UUID = Field(..., description="Map UUID (required)")
    title: str = Field(..., min_length=1, max_length=500, description="Quest title")
    description: Optional[str] = Field(
        default=None, description="Quest description (optional)"
    )
    language: str = Field(
        default="uk", description="Translation language: 'uk' or 'en'"
    )
    settings: QuestSettingsCreate = Field(
        default_factory=QuestSettingsCreate,
        description="Quest settings (time limit, random order)",
    )
    resources: List[QuestResourceItem] = Field(
        default=[],
        description=(
            "Quest resource list. Each item: "
            '{"resource_id": "<uuid>", "order_index": 0}'
        ),
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "map_id": "d7b66ec5-ea2c-48b6-83ee-b45fc446446e",
                "title": "Python Lists",
                "description": "A quest about working with lists",
                "language": "en",
                "settings": {
                    "time_limit_minutes": None,
                    "random_order": False,
                },
                "resources": [
                    {
                        "resource_id": "30bbc28f-22d3-4b91-8c5c-3539bad06cac",
                        "order_index": 0,
                    },
                    {
                        "resource_id": "b27ff721-bf0b-4ee1-a09c-65ecccc2cb4e",
                        "order_index": 1,
                    },
                ],
            }
        }
    )


class QuestUpdate(BaseModel):
    map_id: Optional[uuid.UUID] = None
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    description: Optional[str] = None
    language: Optional[str] = None
    settings: Optional[QuestSettingsCreate] = None
    resources: Optional[List[QuestResourceItem]] = None


# Responses
class QuestResponse(BaseModel):
    id: uuid.UUID
    slug: str
    status: QuestStatus
    map_id: Optional[uuid.UUID] = None
    translations: List[QuestTranslationResponse] = []
    settings: Optional[QuestSettingsResponse] = None
    resources: List[QuestResourceResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class QuestListItem(BaseModel):
    id: uuid.UUID
    slug: str
    status: QuestStatus
    map_id: Optional[uuid.UUID] = None
    map_name: Optional[str] = None
    title: str
    created_at: datetime
    resources_count: int
