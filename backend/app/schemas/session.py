import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.game_session import SessionStatus
from app.models.session_player import PlayerStatus
from app.models.session_progress import ProgressStatus


class SessionCreate(BaseModel):
    quest_id: uuid.UUID
    scheduled_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    max_participants: Optional[int] = None


class JoinSessionRequest(BaseModel):
    session_code: str = Field(..., min_length=6, max_length=6)
    guest_name: Optional[str] = None
    display_name: Optional[str] = None


class SessionPlayerResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    guest_name: Optional[str] = None
    display_name: str
    avatar_color: str
    status: PlayerStatus
    joined_at: datetime
    finished_at: Optional[datetime] = None
    guest_token: str

    model_config = ConfigDict(from_attributes=True)


class SessionProgressResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    player_id: uuid.UUID
    resource_id: Optional[uuid.UUID] = None
    map_object_id: Optional[uuid.UUID] = None
    status: ProgressStatus
    score: Optional[float] = None
    answer: Optional[Dict[str, Any]] = None
    requires_review: bool
    assigned_at: datetime
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class SessionChatMessage(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    player_id: uuid.UUID
    display_name: str
    message: str
    created_at: datetime


class SessionListItem(BaseModel):
    id: uuid.UUID
    quest_id: uuid.UUID
    session_code: str
    status: SessionStatus
    started_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    scheduled_at: Optional[datetime] = None
    max_players: int
    players_count: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class GameSessionResponse(BaseModel):
    id: uuid.UUID
    quest_id: uuid.UUID
    session_code: str
    status: SessionStatus
    started_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    scheduled_at: Optional[datetime] = None
    max_players: int
    created_at: datetime
    players: List[SessionPlayerResponse] = []

    model_config = ConfigDict(from_attributes=True)


class GameSessionDetailResponse(GameSessionResponse):
    progress: List[SessionProgressResponse] = []
    chat_messages: List[SessionChatMessage] = []


class PlayerProgressSummary(BaseModel):
    player: SessionPlayerResponse
    completed: int
    total: int
    score: Optional[float] = None
    pending_review: int


class TeacherMonitorResponse(BaseModel):
    session: GameSessionResponse
    players_progress: List[PlayerProgressSummary]


class SubmitAnswerRequest(BaseModel):
    progress_id: Optional[uuid.UUID] = None
    answer: Dict[str, Any]


class ReviewAnswerRequest(BaseModel):
    score: float = Field(..., ge=0.0, le=1.0)
    feedback: Optional[str] = None


class UpdateGuestNameRequest(BaseModel):
    guest_name: Optional[str] = None


class QuestSettingsPublic(BaseModel):
    time_limit_minutes: Optional[int] = None
    keep_completed_in_materials: bool = True
    show_score_after: bool = True
    show_correct_answers: bool = True


class GameInfoResponse(BaseModel):
    quest_title: str
    map_slug: Optional[str] = None
    settings: Optional[QuestSettingsPublic] = None
