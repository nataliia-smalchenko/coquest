"""
Strict Pydantic models for WebSocket message validation.

All incoming WebSocket messages must conform to one of the schemas defined here.
TypeAdapters are built once at module-level and reused across all connections
(no per-request overhead).

Answer shapes:
Three mutually exclusive answer structures mirror the question types in the DB:

  SingleChoiceAnswer  – {"option_id": "<str>"}
  MultipleChoiceAnswer – {"option_ids": ["<str>", ...]}
  TextAnswer          – {"text": "<str>"}   (short / open questions)

``extra="forbid"`` on every answer model prevents clients from slipping
arbitrary keys (potential Stored XSS vector) past validation.
"""

from __future__ import annotations

import uuid
from typing import Annotated, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, TypeAdapter


# Answer shapes
class SingleChoiceAnswer(BaseModel):
    """Answer for single-choice questions: one selected option ID."""

    option_id: str = Field(..., min_length=1, max_length=100)

    model_config = ConfigDict(extra="forbid")


class MultipleChoiceAnswer(BaseModel):
    """Answer for multiple-choice questions: list of selected option IDs."""

    option_ids: List[str] = Field(..., min_length=1, max_length=30)

    model_config = ConfigDict(extra="forbid")


class TextAnswer(BaseModel):
    """
    Answer for short-text and open-ended questions.

    ``text`` has a default so that open questions (which require teacher
    review) can be submitted without text if needed.
    """

    text: Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)] = ""

    model_config = ConfigDict(extra="forbid")


# Resolved left-to-right: SingleChoiceAnswer is tried first (requires
# ``option_id``), then MultipleChoiceAnswer (requires ``option_ids``),
# finally TextAnswer (``text`` is optional).
PlayerAnswer = Annotated[
    Union[SingleChoiceAnswer, MultipleChoiceAnswer, TextAnswer],
    Field(union_mode="left_to_right"),
]


# Player → Server messages
class SubmitAnswerMessage(BaseModel):
    type: Literal["submit_answer"]
    progress_id: uuid.UUID
    answer: PlayerAnswer


class MarkViewedMessage(BaseModel):
    type: Literal["mark_viewed"]
    progress_id: uuid.UUID


class ChatMessage(BaseModel):
    type: Literal["chat_message"]
    # strip_whitespace prevents blank messages slipping past min_length=1
    message: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)
    ]


PlayerMessage = Annotated[
    Union[SubmitAnswerMessage, MarkViewedMessage, ChatMessage],
    Field(discriminator="type"),
]

# Built once at import time — shared across all WebSocket connections.
player_message_adapter: TypeAdapter[PlayerMessage] = TypeAdapter(PlayerMessage)


# Teacher → Server messages
class StartSessionMessage(BaseModel):
    type: Literal["start_session"]


class StopSessionMessage(BaseModel):
    type: Literal["stop_session"]


class ReviewAnswerMessage(BaseModel):
    type: Literal["review_answer"]
    progress_id: uuid.UUID
    score: float = Field(..., ge=0.0, le=1.0)
    feedback: Optional[str] = Field(None, max_length=2000)


TeacherMessage = Annotated[
    Union[StartSessionMessage, StopSessionMessage, ReviewAnswerMessage],
    Field(discriminator="type"),
]

teacher_message_adapter: TypeAdapter[TeacherMessage] = TypeAdapter(TeacherMessage)
