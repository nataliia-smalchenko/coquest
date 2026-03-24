import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.quest import QuestStatus


# Settings
class QuestSettingsCreate(BaseModel):
    time_limit_minutes: Optional[int] = None
    random_order: bool = False
    show_all_texts: bool = False
    keep_completed_in_materials: bool = True
    show_score_after: bool = True
    show_correct_answers: bool = True
    distribute_texts_in_team: bool = False


class QuestSettingsResponse(BaseModel):
    time_limit_minutes: Optional[int] = None
    random_order: bool
    show_all_texts: bool
    keep_completed_in_materials: bool
    show_score_after: bool
    show_correct_answers: bool
    distribute_texts_in_team: bool

    model_config = ConfigDict(from_attributes=True)


# Resources
class QuestResourceItem(BaseModel):
    """One resource attached to a quest.

    Example:
        {"resource_id": "30bbc28f-...", "order_index": 0}
    """

    resource_id: uuid.UUID = Field(..., description="UUID ресурсу з бібліотеки вчителя")
    order_index: int = Field(default=0, ge=0, description="Порядок відображення (0, 1, 2, ...)")


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
    map_id: uuid.UUID = Field(..., description="UUID карти (обов'язково)")
    title: str = Field(..., min_length=1, max_length=500, description="Назва квесту")
    description: Optional[str] = Field(default=None, description="Опис квесту (необов'язково)")
    language: str = Field(default="uk", description="Мова перекладу title/description: 'uk' або 'en'")
    max_players: int = Field(default=1, ge=1, le=5, description="1 = соло, 2–5 = команда")
    settings: QuestSettingsCreate = Field(
        default_factory=QuestSettingsCreate,
        description="Налаштування квесту",
    )
    resources: List[QuestResourceItem] = Field(
        default=[],
        description=(
            "Список ресурсів квесту. Кожен елемент: "
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
                "max_players": 4,
                "settings": {
                    "time_limit_minutes": None,
                    "random_order": False,
                    "show_all_texts": False,
                    "keep_completed_in_materials": True,
                    "show_score_after": True,
                    "show_correct_answers": True,
                    "distribute_texts_in_team": False,
                },
                "resources": [
                    {"resource_id": "30bbc28f-22d3-4b91-8c5c-3539bad06cac", "order_index": 0},
                    {"resource_id": "b27ff721-bf0b-4ee1-a09c-65ecccc2cb4e", "order_index": 1},
                ],
            }
        }
    )


class QuestUpdate(BaseModel):
    map_id: Optional[uuid.UUID] = None
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    description: Optional[str] = None
    language: Optional[str] = None
    max_players: Optional[int] = Field(default=None, ge=1, le=5)
    settings: Optional[QuestSettingsCreate] = None
    resources: Optional[List[QuestResourceItem]] = None


# Responses
class QuestResponse(BaseModel):
    id: uuid.UUID
    slug: str
    status: QuestStatus
    map_id: Optional[uuid.UUID] = None
    max_players: int
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
