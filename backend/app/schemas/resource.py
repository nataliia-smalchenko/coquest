import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator

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


def _validate_cloudinary_url(url: str) -> str:
    """Ensure a URL is a valid HTTPS Cloudinary URL."""
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise ValueError("URL must use HTTPS")
    if not parsed.netloc.endswith("cloudinary.com"):
        raise ValueError("URL must be from cloudinary.com")
    return url


class CloudinaryImageCreate(BaseModel):
    """Typed input for a Cloudinary image reference stored in JSONB."""

    url: str
    public_id: str
    width: Optional[int] = None
    height: Optional[int] = None
    size_bytes: Optional[int] = None

    @field_validator("url")
    @classmethod
    def url_must_be_cloudinary_https(cls, v: str) -> str:
        return _validate_cloudinary_url(v)


class QuestionOption(BaseModel):
    id: str = Field(..., min_length=1, max_length=100)
    text: str = Field(default="", max_length=1_000)
    image_url: Optional[str] = None
    is_correct: bool = False

    @field_validator("image_url")
    @classmethod
    def image_url_must_be_cloudinary_https(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return _validate_cloudinary_url(v)


class TextContentCreate(BaseModel):
    body: Dict[str, Any] = Field(default_factory=dict)
    images: List[CloudinaryImageCreate] = Field(default_factory=list)

    @field_validator("body")
    @classmethod
    def body_must_be_tiptap_doc(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        if v.get("type") != "doc":
            raise ValueError("body must be a Tiptap document with type 'doc'")
        if not isinstance(v.get("content"), list):
            raise ValueError("body must contain a 'content' list")
        return v


class TextContentResponse(BaseModel):
    id: uuid.UUID
    resource_id: uuid.UUID
    body: Dict[str, Any]
    images: List[Dict[str, Any]]

    model_config = ConfigDict(from_attributes=True)


class QuestionPublicOption(BaseModel):
    """Option without correctness info — sent to players during a game."""

    id: str
    text: str = ""
    image_url: Optional[str] = None


class QuestionCreate(BaseModel):
    question_type: QuestionType
    # body is HTML produced by Tiptap's getHTML(). XSS is prevented on the
    # frontend via DOMPurify (sanitizeHtml). max_length guards against DoS.
    body: str = Field(..., min_length=1, max_length=10_000)
    explanation: Optional[str] = Field(None, max_length=2_000)
    options: List[QuestionOption] = Field(default_factory=list, max_length=30)
    correct_answers: List[str] = Field(default_factory=list, max_length=30)
    requires_review: bool = False
    difficulty: Optional[DifficultyLevel] = None
    points: int = Field(default=1, ge=1, le=100)

    @field_validator("correct_answers")
    @classmethod
    def correct_answers_no_empty_strings(cls, v: List[str]) -> List[str]:
        for ans in v:
            if not ans.strip():
                raise ValueError("correct_answers must not contain empty strings")
            if len(ans) > 500:
                raise ValueError("each correct answer must be at most 500 characters")
        return v


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
    points: int = 1

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
    points: int = 1

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
