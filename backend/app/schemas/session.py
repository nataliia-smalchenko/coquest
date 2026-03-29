import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.game_session import SessionStatus
from app.models.session_player import PlayerStatus
from app.models.session_progress import ProgressStatus
from app.models.session_team import TeamStatus


class SessionCreate(BaseModel):
    quest_id: uuid.UUID
    name: Optional[str] = None
    # Game mode
    max_players: int = Field(
        default=1, ge=1, le=30, description="1 = individual, 2+ = team"
    )
    allow_solo_in_team: bool = Field(
        default=True, description="Allow solo play in team mode"
    )
    # Gameplay settings
    show_feedback_after_answer: bool = False
    show_score_after: bool = True
    show_correct_answers: bool = True
    keep_completed_in_materials: bool = True
    allow_change_answers: bool = True
    # Scheduling
    scheduled_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class JoinSessionRequest(BaseModel):
    session_code: str = Field(..., min_length=6, max_length=6)
    guest_name: Optional[str] = None
    display_name: Optional[str] = None


class TeamPlayerResponse(BaseModel):
    id: uuid.UUID
    display_name: str
    avatar_color: str
    status: PlayerStatus
    started_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class TeamResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    status: TeamStatus
    players: List[TeamPlayerResponse]
    created_at: datetime
    started_at: Optional[datetime] = None
    hint_player_id: Optional[uuid.UUID] = None

    model_config = ConfigDict(from_attributes=True)


class SessionPlayerResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    guest_name: Optional[str] = None
    display_name: str
    avatar_color: str
    status: PlayerStatus
    joined_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    guest_token: str
    team_id: Optional[uuid.UUID] = None

    model_config = ConfigDict(from_attributes=True)


class SessionProgressResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    player_id: uuid.UUID
    resource_id: Optional[uuid.UUID] = None
    map_object_id: Optional[uuid.UUID] = None
    status: ProgressStatus
    step_order: Optional[int] = None
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
    name: Optional[str] = None
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
    name: Optional[str] = None
    status: SessionStatus
    started_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    scheduled_at: Optional[datetime] = None
    max_players: int
    allow_solo_in_team: bool = True
    show_feedback_after_answer: bool = False
    show_score_after: bool = True
    show_correct_answers: bool = True
    keep_completed_in_materials: bool = True
    allow_change_answers: bool = True
    created_at: datetime
    players: List[SessionPlayerResponse] = []

    model_config = ConfigDict(from_attributes=True)


class GameSessionDetailResponse(GameSessionResponse):
    progress: List[SessionProgressResponse] = []
    chat_messages: List[SessionChatMessage] = []


class QuestionResultOption(BaseModel):
    id: str
    text: str
    is_correct: bool


class QuestionResultData(BaseModel):
    body: str
    question_type: str
    options: List[QuestionResultOption]
    correct_answers: List[str]
    points: int = 1


class SessionProgressResultResponse(SessionProgressResponse):
    resource_title: Optional[str] = None
    question: Optional[QuestionResultData] = None


class GameSessionResultResponse(GameSessionResponse):
    progress: List[SessionProgressResultResponse] = []
    chat_messages: List[SessionChatMessage] = []
    max_grade: Optional[int] = None
    total_question_points: Optional[int] = None


class PlayerProgressSummary(BaseModel):
    player: SessionPlayerResponse
    completed: int
    total: int
    score: Optional[float] = None
    total_score: Optional[float] = None
    max_score: Optional[int] = None
    grade: Optional[float] = None
    max_grade: Optional[int] = None
    pending_review: int
    correct: int = 0
    incorrect: int = 0
    viewed: int = 0


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


class SessionSettingsPublic(BaseModel):
    time_limit_minutes: Optional[int] = None
    keep_completed_in_materials: bool = True
    show_feedback_after_answer: bool = False
    show_score_after: bool = True
    show_correct_answers: bool = True
    allow_change_answers: bool = True


class GameInfoResponse(BaseModel):
    quest_title: str
    map_slug: Optional[str] = None
    settings: Optional[SessionSettingsPublic] = None
