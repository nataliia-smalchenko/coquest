import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.question import DifficultyLevel, QuestionType
from app.models.resource import ResourceType


class FolderCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    parent_id: Optional[uuid.UUID] = None


class FolderResponse(BaseModel):
    id: uuid.UUID
    name: str
    parent_id: Optional[uuid.UUID] = None
    created_at: datetime
    children_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class FolderTreeResponse(FolderResponse):
    children: List["FolderTreeResponse"] = []


class TagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: str = Field(default="#6366f1", pattern=r"^#[0-9a-fA-F]{6}$")


class TagResponse(BaseModel):
    id: uuid.UUID
    name: str
    color: str

    model_config = ConfigDict(from_attributes=True)


class ResourceCreate(BaseModel):
    type: ResourceType
    title: str = Field(..., min_length=1, max_length=500)
    folder_id: Optional[uuid.UUID] = None
    tag_ids: List[uuid.UUID] = Field(default_factory=list)


class ResourceUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    folder_id: Optional[uuid.UUID] = None
    tag_ids: Optional[List[uuid.UUID]] = None


class ResourceResponse(BaseModel):
    id: uuid.UUID
    type: ResourceType
    title: str
    folder_id: Optional[uuid.UUID] = None
    tags: List[TagResponse] = []
    has_content: bool = False
    difficulty: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TextContentCreate(BaseModel):
    body: Dict[str, Any] = Field(default_factory=dict)
    images: List[Dict[str, Any]] = Field(default_factory=list)


class TextContentResponse(BaseModel):
    id: uuid.UUID
    resource_id: uuid.UUID
    body: Dict[str, Any]
    images: List[Dict[str, Any]]

    model_config = ConfigDict(from_attributes=True)


class QuestionOption(BaseModel):
    id: str = Field(..., description="Unique ID for the option within the question")
    text: str = Field(default="")
    image_url: Optional[str] = None
    is_correct: bool = False


class QuestionPublicOption(BaseModel):
    """Option without correctness info — sent to players during a game."""

    id: str
    text: str = ""
    image_url: Optional[str] = None


class QuestionCreate(BaseModel):
    question_type: QuestionType
    body: str = Field(..., min_length=1)
    explanation: Optional[str] = None
    options: List[QuestionOption] = Field(default_factory=list)
    correct_answers: List[str] = Field(default_factory=list)
    requires_review: bool = False
    difficulty: Optional[DifficultyLevel] = None


class QuestionResponse(BaseModel):
    id: uuid.UUID
    resource_id: uuid.UUID
    question_type: QuestionType
    body: str
    explanation: Optional[str] = None
    options: List[QuestionOption]
    correct_answers: List[str]
    requires_review: bool
    difficulty: Optional[DifficultyLevel] = None

    model_config = ConfigDict(from_attributes=True)


class ResourceDetailResponse(ResourceResponse):
    text_content: Optional[TextContentResponse] = None
    question: Optional[QuestionResponse] = None


class QuestionPublicResponse(BaseModel):
    """Question without correct answers — sent to players during a game."""

    id: uuid.UUID
    resource_id: uuid.UUID
    question_type: QuestionType
    body: str
    explanation: Optional[str] = None
    options: List[QuestionPublicOption]
    requires_review: bool
    difficulty: Optional[DifficultyLevel] = None

    model_config = ConfigDict(from_attributes=True)


class ResourceDetailPublicResponse(ResourceResponse):
    """Resource detail without correct answers — sent to players during a game."""

    text_content: Optional[TextContentResponse] = None
    question: Optional[QuestionPublicResponse] = None


# Cloudinary


class CloudinarySignatureRequest(BaseModel):
    folder: str


class CloudinarySignatureResponse(BaseModel):
    signature: str
    timestamp: int
    api_key: str
    cloud_name: str
    folder: str
    upload_preset: str


FolderTreeResponse.model_rebuild()
