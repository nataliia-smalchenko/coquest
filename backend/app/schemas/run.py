import uuid
from datetime import datetime
from typing import Annotated, Any, Dict, List, Optional

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, ValidationError

from app.models.game_run import SessionStatus
from app.models.run_player import PlayerStatus
from app.models.run_progress import ProgressStatus
from app.models.run_team import TeamStatus
from app.schemas.websocket import (
    MultipleChoiceAnswer,
    SingleChoiceAnswer,
    TextAnswer,
)


def _validate_player_answer(v: Any) -> Dict[str, Any]:
    """
    Validate that the answer dict conforms to one of the known question shapes.

    Tried in order:
      1. SingleChoiceAnswer  → {"option_id": "<str>"}
      2. MultipleChoiceAnswer → {"option_ids": ["<str>", ...]}
      3. TextAnswer           → {"text": "<str>"} or {}

    ``extra="forbid"`` on each model ensures no unexpected keys pass through,
    which prevents arbitrary data (potential Stored XSS) from reaching the DB.
    """
    if not isinstance(v, dict):
        raise ValueError("answer must be a JSON object")
    for model_class in (SingleChoiceAnswer, MultipleChoiceAnswer, TextAnswer):
        try:
            model_class.model_validate(v)
            return v  # return original dict so the service layer receives a plain dict
        except ValidationError:
            continue
    raise ValueError(
        "answer must match one of: "
        "{option_id: str} for single-choice, "
        "{option_ids: [str]} for multiple-choice, "
        "or {text: str} for open/short answers"
    )


# Dict[str, Any] at runtime (service layer stores it directly in JSONB),
# but validated against the known answer shapes before the value is accepted.
ValidatedAnswer = Annotated[Dict[str, Any], BeforeValidator(_validate_player_answer)]


class RunCreate(BaseModel):
    quest_id: uuid.UUID
    name: Optional[str] = None
    # Game mode
    max_players: int = Field(
        default=1, ge=1, le=30, description="1 = individual, 2+ = team"
    )
    allow_solo_in_team: bool = Field(
        default=True, description="Allow solo play in team mode"
    )
    random_teams: bool = Field(
        default=False, description="Hide player names and prevent manual team switching"
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


class JoinRunRequest(BaseModel):
    session_code: str = Field(..., min_length=6, max_length=6)
    guest_name: Optional[str] = None
    display_name: Optional[str] = None


class RejoinRunRequest(BaseModel):
    session_code: str = Field(..., min_length=6, max_length=6)
    guest_token: str


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


class RunPlayerResponse(BaseModel):
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


class RunProgressResponse(BaseModel):
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


class RunChatMessage(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    player_id: uuid.UUID
    display_name: str
    message: str
    created_at: datetime


class RunListItem(BaseModel):
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


class LeaveTeamResponse(BaseModel):
    player: RunPlayerResponse
    team: TeamResponse

    model_config = ConfigDict(from_attributes=True)


class GameRunResponse(BaseModel):
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
    random_teams: bool = False
    show_feedback_after_answer: bool = False
    show_score_after: bool = True
    show_correct_answers: bool = True
    keep_completed_in_materials: bool = True
    allow_change_answers: bool = True
    created_at: datetime
    players: List[RunPlayerResponse] = []

    model_config = ConfigDict(from_attributes=True)


class GameRunDetailResponse(GameRunResponse):
    progress: List[RunProgressResponse] = []
    chat_messages: List[RunChatMessage] = []


class QuestionResultOption(BaseModel):
    id: str
    text: str
    image_url: Optional[str] = None
    is_correct: bool


class QuestionResultData(BaseModel):
    body: str
    question_type: str
    options: List[QuestionResultOption]
    correct_answers: List[str]
    points: int = 1


class RunProgressResultResponse(RunProgressResponse):
    resource_title: Optional[str] = None
    question: Optional[QuestionResultData] = None


class GameRunResultResponse(GameRunResponse):
    progress: List[RunProgressResultResponse] = []
    chat_messages: List[RunChatMessage] = []
    max_grade: Optional[int] = None
    total_question_points: Optional[int] = None


class PlayerProgressSummary(BaseModel):
    player: RunPlayerResponse
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
    session: GameRunResponse
    players_progress: List[PlayerProgressSummary]


class SubmitAnswerRequest(BaseModel):
    progress_id: Optional[uuid.UUID] = None
    answer: ValidatedAnswer


class RunUpdateRequest(BaseModel):
    name: Optional[str] = None
    show_feedback_after_answer: Optional[bool] = None
    show_score_after: Optional[bool] = None
    show_correct_answers: Optional[bool] = None
    keep_completed_in_materials: Optional[bool] = None
    allow_change_answers: Optional[bool] = None
    ends_at: Optional[datetime] = None
    scheduled_at: Optional[datetime] = None


class ReviewAnswerRequest(BaseModel):
    score: float = Field(..., ge=0.0, le=1.0)
    feedback: Optional[str] = None


class UpdateGuestNameRequest(BaseModel):
    guest_name: Optional[str] = None


class RunSettingsPublic(BaseModel):
    time_limit_minutes: Optional[int] = None
    keep_completed_in_materials: bool = True
    show_feedback_after_answer: bool = False
    show_score_after: bool = True
    show_correct_answers: bool = True
    allow_change_answers: bool = True


class GameInfoResponse(BaseModel):
    quest_title: str
    map_slug: Optional[str] = None
    settings: Optional[RunSettingsPublic] = None
