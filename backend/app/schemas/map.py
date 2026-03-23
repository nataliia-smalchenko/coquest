import uuid
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class MapObjectHintResponse(BaseModel):
    id: uuid.UUID
    language: str
    hint_text: str

    model_config = ConfigDict(from_attributes=True)


class MapObjectResponse(BaseModel):
    id: uuid.UUID
    slug: str
    x: int
    y: int
    width: int
    height: int
    z_index: int
    is_interactive: bool
    order_index: int
    hints: List[MapObjectHintResponse] = []

    model_config = ConfigDict(from_attributes=True)


class MapTranslationResponse(BaseModel):
    language: str
    name: str
    description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class MapResponse(BaseModel):
    id: uuid.UUID
    slug: str
    original_width: int
    original_height: int
    landscape_only_mobile: bool
    translations: List[MapTranslationResponse] = []
    objects: List[MapObjectResponse] = []

    model_config = ConfigDict(from_attributes=True)


class MapListItem(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    description: Optional[str] = None
