import logging
import uuid
from datetime import datetime

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.game_session import GameSession, SessionStatus
from app.models.session_chat import SessionChat
from app.models.session_player import PlayerStatus, SessionPlayer
from app.models.session_progress import ProgressStatus, SessionProgress
from app.schemas.session import ReviewAnswerRequest, SubmitAnswerRequest
from app.services import session_service as svc
from app.services.websocket_manager import manager

logger = logging.getLogger(__name__)


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _progress_dict(p: SessionProgress) -> dict:
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
    msg_type = data.get("type")
    try:
        if msg_type == "submit_answer":
            await _handle_submit_answer(session_id, player_id, data)
        elif msg_type == "mark_viewed":
            await _handle_mark_viewed(session_id, player_id, data)
        elif msg_type == "chat_message":
            await _handle_chat_message(session_id, player_id, data)
        else:
            await manager.send_to_player(
                session_id,
                player_id,
                {"type": "error", "detail": f"Unknown message type: {msg_type}"},
            )
    except Exception as exc:
        logger.exception("Error handling player message type=%s: %s", msg_type, exc)
        await manager.send_to_player(
            session_id, player_id, {"type": "error", "detail": str(exc)}
        )


async def _handle_submit_answer(session_id: str, player_id: str, data: dict) -> None:
    progress_id = uuid.UUID(data["progress_id"])
    request = SubmitAnswerRequest(answer=data["answer"])

    async with AsyncSessionLocal() as db:
        # Load player
        player_result = await db.execute(
            select(SessionPlayer).where(SessionPlayer.id == uuid.UUID(player_id))
        )
        player = player_result.scalar_one_or_none()
        if not player:
            return

        result = await svc.SessionService.submit_answer(
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
                "progress": _progress_dict(await db.get(SessionProgress, progress_id)),
                "correct": correct,
                "score": result.score,
            },
        )

        # Check if a new resource was assigned to the same map_object
        if result.map_object_id:
            new_p_result = await db.execute(
                select(SessionProgress)
                .where(
                    SessionProgress.session_id == uuid.UUID(session_id),
                    SessionProgress.player_id == uuid.UUID(player_id),
                    SessionProgress.map_object_id == result.map_object_id,
                    SessionProgress.status == ProgressStatus.ASSIGNED,
                )
                .order_by(SessionProgress.assigned_at.desc())
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

        # Check session completed
        session_result = await db.execute(
            select(GameSession).where(GameSession.id == uuid.UUID(session_id))
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


async def _handle_mark_viewed(session_id: str, player_id: str, data: dict) -> None:
    progress_id = uuid.UUID(data["progress_id"])

    async with AsyncSessionLocal() as db:
        player_result = await db.execute(
            select(SessionPlayer).where(SessionPlayer.id == uuid.UUID(player_id))
        )
        player = player_result.scalar_one_or_none()
        if not player:
            return

        result = await svc.SessionService.mark_text_viewed(db, progress_id, player)

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

        if player.status == PlayerStatus.FINISHED:
            await manager.broadcast_to_all(
                session_id,
                {
                    "type": "player_finished",
                    "player_id": player_id,
                },
            )

        session_result = await db.execute(
            select(GameSession).where(GameSession.id == uuid.UUID(session_id))
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


async def _handle_chat_message(session_id: str, player_id: str, data: dict) -> None:
    message_text = str(data.get("message", ""))[:500]
    if not message_text.strip():
        return

    async with AsyncSessionLocal() as db:
        player_result = await db.execute(
            select(SessionPlayer).where(SessionPlayer.id == uuid.UUID(player_id))
        )
        player = player_result.scalar_one_or_none()
        if not player:
            return

        chat = SessionChat(
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
    msg_type = data.get("type")
    try:
        if msg_type == "start_session":
            await _handle_start_session(session_id, teacher_id)
        elif msg_type == "stop_session":
            await _handle_stop_session(session_id, teacher_id)
        elif msg_type == "review_answer":
            await _handle_review_answer(session_id, teacher_id, data)
        else:
            await manager.send_to_teacher(
                session_id,
                {"type": "error", "detail": f"Unknown message type: {msg_type}"},
            )
    except Exception as exc:
        logger.exception("Error handling teacher message type=%s: %s", msg_type, exc)
        await manager.send_to_teacher(session_id, {"type": "error", "detail": str(exc)})


async def _handle_start_session(session_id: str, teacher_id: str) -> None:
    async with AsyncSessionLocal() as db:
        result = await svc.SessionService.start_session(
            db, uuid.UUID(session_id), uuid.UUID(teacher_id)
        )

        # Send each player their assigned (visible) progress items
        for player_resp in result.players:
            pid = str(player_resp.id)
            progress_result = await db.execute(
                select(SessionProgress).where(
                    SessionProgress.session_id == uuid.UUID(session_id),
                    SessionProgress.player_id == player_resp.id,
                    SessionProgress.map_object_id != None,  # noqa: E711
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
        await svc.SessionService.stop_session(
            db, uuid.UUID(session_id), uuid.UUID(teacher_id)
        )
    await manager.broadcast_to_all(
        session_id,
        {
            "type": "session_stopped",
            "session_id": session_id,
        },
    )


async def _handle_review_answer(session_id: str, teacher_id: str, data: dict) -> None:
    progress_id = uuid.UUID(data["progress_id"])
    request = ReviewAnswerRequest(
        score=float(data["score"]),
        feedback=data.get("feedback"),
    )

    async with AsyncSessionLocal() as db:
        result = await svc.SessionService.review_answer(
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
