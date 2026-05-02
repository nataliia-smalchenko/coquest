import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.resource_set import ResourceSetStatus


# Settings
class ResourceSetSettingsCreate(BaseModel):
    time_limit_minutes: Optional[int] = None
    random_order: bool = False
    max_grade: Optional[int] = None


class ResourceSetSettingsResponse(BaseModel):
    time_limit_minutes: Optional[int] = None
    random_order: bool
    max_grade: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


# Resources
class ResourceSetResourceItem(BaseModel):
    """One resource attached to a resource set.

    Example:
        {"resource_id": "30bbc28f-...", "order_index": 0}
    """

    resource_id: uuid.UUID = Field(
        ..., description="Resource UUID from the teacher's library"
    )
    order_index: int = Field(
        default=0, ge=0, description="Display order (0, 1, 2, ...)"
    )


class ResourceSetResourceResponse(BaseModel):
    id: uuid.UUID
    resource_id: uuid.UUID
    order_index: int

    model_config = ConfigDict(from_attributes=True)


# Translations
class ResourceSetTranslationResponse(BaseModel):
    language: str
    title: str
    description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# Create / Update
class ResourceSetCreate(BaseModel):
    title: str = Field(
        ..., min_length=1, max_length=500, description="Resource set title"
    )
    description: Optional[str] = Field(
        default=None, description="Resource set description (optional)"
    )
    language: str = Field(
        default="uk", description="Translation language: 'uk' or 'en'"
    )
    settings: ResourceSetSettingsCreate = Field(
        default_factory=ResourceSetSettingsCreate,
        description="Resource set settings (time limit, random order)",
    )
    resources: List[ResourceSetResourceItem] = Field(
        default=[],
        description=(
            'Resource list. Each item: {"resource_id": "<uuid>", "order_index": 0}'
        ),
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "title": "Python Lists",
                "description": "A set of resources about working with lists",
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


class ResourceSetUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    description: Optional[str] = None
    language: Optional[str] = None
    settings: Optional[ResourceSetSettingsCreate] = None
    resources: Optional[List[ResourceSetResourceItem]] = None


# Responses
class ResourceSetResponse(BaseModel):
    id: uuid.UUID
    slug: str
    status: ResourceSetStatus
    translations: List[ResourceSetTranslationResponse] = []
    settings: Optional[ResourceSetSettingsResponse] = None
    resources: List[ResourceSetResourceResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ResourceSetListItem(BaseModel):
    id: uuid.UUID
    slug: str
    status: ResourceSetStatus
    title: str
    created_at: datetime
    resources_count: int
