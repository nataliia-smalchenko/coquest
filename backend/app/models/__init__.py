from app.database import Base
from app.models.user import User, UserRole, AuthProvider
from app.models.resource_folder import ResourceFolder
from app.models.tag import Tag
from app.models.resource import Resource, ResourceType
from app.models.resource_tag import ResourceTag
from app.models.text_content import TextContent
from app.models.question import Question, QuestionType
from app.models.map import Map, MapTranslation, MapObject, MapObjectHint
from app.models.quest import Quest, QuestStatus, QuestTranslation, QuestSettings, QuestResource

__all__ = [
    "Base",
    "User",
    "UserRole",
    "AuthProvider",
    "ResourceFolder",
    "Tag",
    "Resource",
    "ResourceType",
    "ResourceTag",
    "TextContent",
    "Question",
    "QuestionType",
    "Map",
    "MapTranslation",
    "MapObject",
    "MapObjectHint",
    "Quest",
    "QuestStatus",
    "QuestTranslation",
    "QuestSettings",
    "QuestResource",
]
