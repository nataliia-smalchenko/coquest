import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import AsyncSessionLocal
from app.models.game_session import GameSession, SessionStatus
from app.models.quest import QuestSettings
from app.models.session_player import PlayerStatus, SessionPlayer
from app.models.user import User, UserRole
from app.schemas.session import GameSessionResponse, SessionPlayerResponse
from app.services.websocket_handlers import (
    handle_player_message,
    handle_teacher_message,
)
from app.services.websocket_manager import manager
from app.utils.security import verify_token

router = APIRouter(prefix="/api/ws", tags=["WebSocket"])

logger = logging.getLogger(__name__)


def _session_dict(session: GameSession) -> dict:
    return {
        "id": str(session.id),
        "quest_id": str(session.quest_id),
        "session_code": session.session_code,
        "status": session.status.value
        if hasattr(session.status, "value")
        else session.status,
        "max_players": session.max_players,
        "allow_solo_in_team": session.allow_solo_in_team,
        "keep_completed_in_materials": session.keep_completed_in_materials,
        "show_feedback_after_answer": session.show_feedback_after_answer,
        "show_score_after": session.show_score_after,
        "show_correct_answers": session.show_correct_answers,
        "allow_change_answers": session.allow_change_answers,
        "players_count": len(session.players),
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "ends_at": session.ends_at.isoformat() if session.ends_at else None,
    }


def _player_dict(player: SessionPlayer) -> dict:
    return {
        "id": str(player.id),
        "display_name": player.display_name,
        "avatar_color": player.avatar_color,
        "status": player.status.value
        if hasattr(player.status, "value")
        else player.status,
        "team_id": str(player.team_id) if player.team_id else None,
        "started_at": player.started_at.isoformat() if player.started_at else None,
    }


@router.websocket("/session/{session_id}/player")
async def ws_player(
    websocket: WebSocket,
    session_id: uuid.UUID,
    guest_token: str = Query(...),
):
    sid = str(session_id)

    async with AsyncSessionLocal() as db:
        # Authenticate via guest_token
        player_result = await db.execute(
            select(SessionPlayer).where(SessionPlayer.guest_token == guest_token)
        )
        player = player_result.scalar_one_or_none()
        if not player:
            await websocket.close(code=4001, reason="Unauthorized: invalid token")
            return

        if player.session_id != session_id:
            await websocket.close(
                code=4002, reason="Forbidden: token does not match session"
            )
            return

        session_result = await db.execute(
            select(GameSession)
            .where(GameSession.id == session_id)
            .options(selectinload(GameSession.players))
        )
        session = session_result.scalar_one_or_none()
        if not session or session.status in (
            SessionStatus.COMPLETED,
            SessionStatus.STOPPED,
        ):
            await websocket.close(code=4003, reason="Session is closed")
            return

        player_id = str(player.id)
        session_data = _session_dict(session)
        player_data = _player_dict(player)
        players_data = [_player_dict(p) for p in session.players]

        # If time limit expired and player is not yet finished, mark them finished
        now = datetime.now(timezone.utc)
        time_expired = session.ends_at is not None and session.ends_at < now
        if not time_expired and player.started_at:
            settings_result = await db.execute(
                select(QuestSettings).where(QuestSettings.quest_id == session.quest_id)
            )
            settings_obj = settings_result.scalar_one_or_none()
            if settings_obj and settings_obj.time_limit_minutes:
                player_ends_at = player.started_at + timedelta(
                    minutes=settings_obj.time_limit_minutes
                )
                if player_ends_at < now:
                    time_expired = True
        already_finished = player.status == PlayerStatus.FINISHED
        if time_expired and not already_finished:
            from datetime import timedelta

            player.status = PlayerStatus.FINISHED
            if not player.finished_at:
                player.finished_at = now
            player.results_available_until = now + timedelta(days=30)
            await db.commit()
            already_finished = True

    await manager.connect_player(sid, player_id, websocket)

    await manager.send_to_player(
        sid,
        player_id,
        {
            "type": "connected",
            "player_id": player_id,
            "team_id": str(player.team_id) if player.team_id else None,
            "session": session_data,
            "players": players_data,
        },
    )

    # Immediately notify the player if they are already finished
    if already_finished:
        await manager.send_to_player(
            sid,
            player_id,
            {"type": "player_finished", "player_id": player_id},
        )

    # broadcast_to_session already notifies the teacher, so no separate send_to_teacher needed
    await manager.broadcast_to_session(
        sid,
        {
            "type": "player_joined",
            "player": player_data,
        },
        exclude_player_id=player_id,
    )

    try:
        while True:
            data = await websocket.receive_json()
            await handle_player_message(sid, player_id, data)
    except WebSocketDisconnect:
        await manager.disconnect_player(sid, player_id)
        await manager.broadcast_to_session(
            sid,
            {
                "type": "player_left",
                "player_id": player_id,
            },
        )
    except Exception as exc:
        logger.exception(
            "Unexpected error in player WS session=%s player=%s: %s",
            sid,
            player_id,
            exc,
        )
        await manager.disconnect_player(sid, player_id)


@router.websocket("/session/{session_id}/teacher")
async def ws_teacher(
    websocket: WebSocket,
    session_id: uuid.UUID,
    token: str = Query(...),
):
    sid = str(session_id)

    # Authenticate JWT
    payload = verify_token(token)
    if not payload:
        await websocket.close(code=4001, reason="Unauthorized: invalid token")
        return

    async with AsyncSessionLocal() as db:
        user_id = payload.get("sub")
        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()

        if not user or user.role != UserRole.TEACHER:
            await websocket.close(
                code=4001, reason="Unauthorized: teacher role required"
            )
            return

        session_result = await db.execute(
            select(GameSession)
            .where(GameSession.id == session_id)
            .options(selectinload(GameSession.players))
        )
        session = session_result.scalar_one_or_none()

        if not session or session.teacher_id != user.id:
            await websocket.close(code=4002, reason="Forbidden: not your session")
            return

        if session.status in (SessionStatus.COMPLETED, SessionStatus.STOPPED):
            await websocket.close(code=4003, reason="Session is closed")
            return

        teacher_id = str(user.id)
        session_data = _session_dict(session)

    await manager.connect_teacher(sid, teacher_id, websocket)

    await manager.send_to_teacher(
        sid,
        {
            "type": "connected",
            "role": "teacher",
            "session": session_data,
        },
    )

    try:
        while True:
            data = await websocket.receive_json()
            await handle_teacher_message(sid, teacher_id, data)
    except WebSocketDisconnect:
        await manager.disconnect_teacher(sid)
    except Exception as exc:
        logger.exception("Unexpected error in teacher WS session=%s: %s", sid, exc)
        await manager.disconnect_teacher(sid)
