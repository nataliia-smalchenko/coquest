import logging
import uuid
from datetime import datetime

from pydantic import ValidationError
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.game_run import GameRun, SessionStatus
from app.models.run_chat import RunChat
from app.models.run_player import PlayerStatus, RunPlayer
from app.models.run_progress import ProgressStatus, RunProgress
from app.models.run_team import RunTeam, TeamStatus
from app.schemas.run import ReviewAnswerRequest, SubmitAnswerRequest
from app.schemas.websocket import (
    ChatMessage,
    MarkViewedMessage,
    ReviewAnswerMessage,
    StartSessionMessage,
    StopSessionMessage,
    SubmitAnswerMessage,
    player_message_adapter,
    teacher_message_adapter,
)
from app.services import run_service as svc
from app.services.websocket_manager import manager

logger = logging.getLogger(__name__)


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _progress_dict(p: RunProgress) -> dict:
    return {
        "id": str(p.id),
        "session_id": str(p.session_id),
        "player_id": str(p.player_id),
        "resource_id": str(p.resource_id) if p.resource_id else None,
        "map_object_id": str(p.map_object_id) if p.map_object_id else None,
        "status": p.status.value if hasattr(p.status, "value") else p.status,
        "score": p.score,
        "answer": p.answer,
        "requires_review": p.requires_review,
        "assigned_at": _iso(p.assigned_at),
        "completed_at": _iso(p.completed_at),
    }


# player messages
async def handle_player_message(session_id: str, player_id: str, data: dict) -> None:
    try:
        msg = player_message_adapter.validate_python(data)
    except ValidationError as exc:
        logger.warning(
            "Invalid player WS message session=%s player=%s: %s",
            session_id,
            player_id,
            exc,
        )
        await manager.send_to_player(
            session_id, player_id, {"type": "error", "detail": "Invalid message format"}
        )
        return

    try:
        if isinstance(msg, SubmitAnswerMessage):
            await _handle_submit_answer(session_id, player_id, msg)
        elif isinstance(msg, MarkViewedMessage):
            await _handle_mark_viewed(session_id, player_id, msg)
        elif isinstance(msg, ChatMessage):
            await _handle_chat_message(session_id, player_id, msg)
    except Exception as exc:
        logger.exception(
            "Error handling player message type=%s session=%s player=%s: %s",
            msg.type,
            session_id,
            player_id,
            exc,
        )
        await manager.send_to_player(
            session_id, player_id, {"type": "error", "detail": str(exc)}
        )


async def _handle_submit_answer(
    session_id: str, player_id: str, msg: SubmitAnswerMessage
) -> None:
    progress_id = msg.progress_id
    # msg.answer is a typed Pydantic model; model_dump() gives the plain dict
    # that the service layer expects and stores directly in JSONB.
    request = SubmitAnswerRequest(answer=msg.answer.model_dump())

    async with AsyncSessionLocal() as db:
        # Load player
        player_result = await db.execute(
            select(RunPlayer).where(RunPlayer.id == uuid.UUID(player_id))
        )
        player = player_result.scalar_one_or_none()
        if not player:
            return

        result, team_step_info = await svc.RunService.submit_answer(
            db, progress_id, player, request
        )

        # Determine correct flag for non-open questions
        correct: bool | None = None
        if result.score is not None:
            correct = result.score >= 1.0

        await manager.send_to_player(
            session_id,
            player_id,
            {
                "type": "answer_result",
                "progress": _progress_dict(await db.get(RunProgress, progress_id)),
                "correct": correct,
                "score": result.score,
            },
        )

        if player.team_id and team_step_info:
            team_players_result = await db.execute(
                select(RunPlayer).where(RunPlayer.team_id == player.team_id)
            )
            team_players = team_players_result.scalars().all()
            step_event = {
                "type": "team_step_advanced",
                **team_step_info,
                "completed_by_progress": result.model_dump(mode="json"),
            }
            for tp in team_players:
                await manager.send_to_player(session_id, str(tp.id), step_event)

        # Check if a new resource was assigned to the same map_object (solo only)
        if not player.team_id and result.map_object_id:
            new_p_result = await db.execute(
                select(RunProgress)
                .where(
                    RunProgress.session_id == uuid.UUID(session_id),
                    RunProgress.player_id == uuid.UUID(player_id),
                    RunProgress.map_object_id == result.map_object_id,
                    RunProgress.status == ProgressStatus.ASSIGNED,
                )
                .order_by(RunProgress.assigned_at.desc())
                .limit(1)
            )
            new_p = new_p_result.scalar_one_or_none()
            if new_p:
                await manager.send_to_player(
                    session_id,
                    player_id,
                    {
                        "type": "object_updated",
                        "map_object_id": str(result.map_object_id),
                        "new_progress_id": str(new_p.id),
                        "resource_type": None,  # loaded lazily by client
                    },
                )

        # Notify teacher
        await manager.send_to_teacher(
            session_id,
            {
                "type": "player_answered",
                "player_id": player_id,
                "progress_id": str(result.id),
                "requires_review": result.requires_review,
            },
        )

        # Check player finished
        player_finished = player.status == PlayerStatus.FINISHED
        if player_finished:
            await manager.broadcast_to_all(
                session_id,
                {
                    "type": "player_finished",
                    "player_id": player_id,
                },
            )

        if player_finished and player.team_id:
            async with AsyncSessionLocal() as db2:
                team_result = await db2.execute(
                    select(RunTeam).where(RunTeam.id == player.team_id)
                )
                team = team_result.scalar_one_or_none()
                if team and team.status == TeamStatus.COMPLETED:
                    await manager.broadcast_to_all(
                        session_id,
                        {
                            "type": "team_completed",
                            "team_id": str(player.team_id),
                        },
                    )

        # Check session completed
        session_result = await db.execute(
            select(GameRun).where(GameRun.id == uuid.UUID(session_id))
        )
        session = session_result.scalar_one_or_none()
        if session and session.status == SessionStatus.COMPLETED:
            await manager.broadcast_to_all(
                session_id,
                {
                    "type": "session_completed",
                    "session_id": session_id,
                },
            )


async def _handle_mark_viewed(
    session_id: str, player_id: str, msg: MarkViewedMessage
) -> None:
    progress_id = msg.progress_id

    async with AsyncSessionLocal() as db:
        player_result = await db.execute(
            select(RunPlayer).where(RunPlayer.id == uuid.UUID(player_id))
        )
        player = player_result.scalar_one_or_none()
        if not player:
            return

        result, team_step_info, viewers = await svc.RunService.mark_text_viewed(
            db, progress_id, player
        )

        if player.team_id:
            team_players_result = await db.execute(
                select(RunPlayer).where(RunPlayer.team_id == player.team_id)
            )
            team_players = team_players_result.scalars().all()

            viewed_event = {
                "type": "team_text_viewed",
                "viewer_id": player_id,
                "viewers": viewers or [player_id],
            }
            for tp in team_players:
                await manager.send_to_player(session_id, str(tp.id), viewed_event)

            if team_step_info:
                step_event = {
                    "type": "team_step_advanced",
                    **team_step_info,
                    "completed_by_progress": None,
                }
                for tp in team_players:
                    await manager.send_to_player(session_id, str(tp.id), step_event)
        else:
            await manager.send_to_player(
                session_id,
                player_id,
                {
                    "type": "text_viewed",
                    "progress_id": str(result.id),
                },
            )

        await manager.send_to_teacher(
            session_id,
            {
                "type": "player_viewed_text",
                "player_id": player_id,
                "progress_id": str(result.id),
            },
        )

        player_finished = player.status == PlayerStatus.FINISHED
        if player_finished:
            await manager.broadcast_to_all(
                session_id,
                {
                    "type": "player_finished",
                    "player_id": player_id,
                },
            )

        if player_finished and player.team_id:
            async with AsyncSessionLocal() as db2:
                team_result = await db2.execute(
                    select(RunTeam).where(RunTeam.id == player.team_id)
                )
                team = team_result.scalar_one_or_none()
                if team and team.status == TeamStatus.COMPLETED:
                    await manager.broadcast_to_all(
                        session_id,
                        {
                            "type": "team_completed",
                            "team_id": str(player.team_id),
                        },
                    )

        session_result = await db.execute(
            select(GameRun).where(GameRun.id == uuid.UUID(session_id))
        )
        session = session_result.scalar_one_or_none()
        if session and session.status == SessionStatus.COMPLETED:
            await manager.broadcast_to_all(
                session_id,
                {
                    "type": "session_completed",
                    "session_id": session_id,
                },
            )


async def _handle_chat_message(
    session_id: str, player_id: str, msg: ChatMessage
) -> None:
    # msg.message is already validated: non-empty, max 500 chars, stripped.
    message_text = msg.message

    async with AsyncSessionLocal() as db:
        player_result = await db.execute(
            select(RunPlayer).where(RunPlayer.id == uuid.UUID(player_id))
        )
        player = player_result.scalar_one_or_none()
        if not player:
            return

        chat = RunChat(
            session_id=uuid.UUID(session_id),
            player_id=uuid.UUID(player_id),
            message=message_text,
        )
        db.add(chat)
        await db.commit()
        await db.refresh(chat)

    await manager.broadcast_to_session(
        session_id,
        {
            "type": "chat_message",
            "player_id": player_id,
            "display_name": player.display_name,
            "message": message_text,
            "created_at": _iso(chat.created_at),
        },
    )


# teacher messages
async def handle_teacher_message(session_id: str, teacher_id: str, data: dict) -> None:
    try:
        msg = teacher_message_adapter.validate_python(data)
    except ValidationError as exc:
        logger.warning(
            "Invalid teacher WS message session=%s teacher=%s: %s",
            session_id,
            teacher_id,
            exc,
        )
        await manager.send_to_teacher(
            session_id, {"type": "error", "detail": "Invalid message format"}
        )
        return

    try:
        if isinstance(msg, StartSessionMessage):
            await _handle_start_session(session_id, teacher_id)
        elif isinstance(msg, StopSessionMessage):
            await _handle_stop_session(session_id, teacher_id)
        elif isinstance(msg, ReviewAnswerMessage):
            await _handle_review_answer(session_id, teacher_id, msg)
    except Exception as exc:
        logger.exception(
            "Error handling teacher message type=%s session=%s: %s",
            msg.type,
            session_id,
            exc,
        )
        await manager.send_to_teacher(session_id, {"type": "error", "detail": str(exc)})


async def _handle_start_session(session_id: str, teacher_id: str) -> None:
    async with AsyncSessionLocal() as db:
        result = await svc.RunService.start_session(
            db, uuid.UUID(session_id), uuid.UUID(teacher_id)
        )

        # Send each player their assigned (visible) progress items
        for player_resp in result.players:
            pid = str(player_resp.id)
            progress_result = await db.execute(
                select(RunProgress).where(
                    RunProgress.session_id == uuid.UUID(session_id),
                    RunProgress.player_id == player_resp.id,
                    RunProgress.map_object_id != None,  # noqa: E711
                )
            )
            visible = progress_result.scalars().all()
            await manager.send_to_player(
                session_id,
                pid,
                {
                    "type": "session_started",
                    "progress": [_progress_dict(p) for p in visible],
                },
            )

        await manager.send_to_teacher(
            session_id,
            {
                "type": "session_started",
                "session": {
                    "id": str(result.id),
                    "status": result.status.value
                    if hasattr(result.status, "value")
                    else result.status,
                    "started_at": _iso(result.started_at),
                    "ends_at": _iso(result.ends_at),
                },
            },
        )


async def _handle_stop_session(session_id: str, teacher_id: str) -> None:
    async with AsyncSessionLocal() as db:
        await svc.RunService.stop_session(
            db, uuid.UUID(session_id), uuid.UUID(teacher_id)
        )
    await manager.broadcast_to_all(
        session_id,
        {
            "type": "session_stopped",
            "session_id": session_id,
        },
    )


async def _handle_review_answer(
    session_id: str, teacher_id: str, msg: ReviewAnswerMessage
) -> None:
    progress_id = msg.progress_id
    request = ReviewAnswerRequest(score=msg.score, feedback=msg.feedback)

    async with AsyncSessionLocal() as db:
        result = await svc.RunService.review_answer(
            db, progress_id, uuid.UUID(teacher_id), request
        )

    await manager.send_to_player(
        session_id,
        str(result.player_id),
        {
            "type": "answer_reviewed",
            "progress_id": str(result.id),
            "score": result.score,
        },
    )
