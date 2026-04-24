import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.game_run import GameRun, SessionStatus
from app.models.run_player import PlayerStatus, RunPlayer
from app.models.user import UserRole
from app.schemas.run import GameRunResponse, RunPlayerResponse
from app.services.run_service import RunService
from app.services.user_service import UserService
from app.services.websocket_handlers import (
    handle_player_message,
    handle_teacher_message,
)
from app.services.websocket_manager import manager
from app.utils.security import verify_token

router = APIRouter(prefix="/api/ws", tags=["WebSocket"])

logger = logging.getLogger(__name__)


# Heartbeat helpers
async def _player_heartbeat(sid: str, player_id: str) -> None:
    """Send periodic pings to a player to detect zombie connections.

    Runs as a background asyncio task alongside the main receive loop.
    If the underlying WebSocket is dead (e.g. mobile network drop without
    a proper TCP FIN), ``manager.send_to_player`` will fail, log the error,
    and call ``disconnect_player``, evicting the stale entry from
    ConnectionManager and preventing a memory leak.

    The task is always cancelled via ``finally`` in the route handler, so
    ``asyncio.CancelledError`` on a healthy disconnect is expected and silent.
    """
    interval = settings.WS_HEARTBEAT_INTERVAL_SECONDS
    try:
        while True:
            await asyncio.sleep(interval)
            await manager.send_to_player(sid, player_id, {"type": "ping"})
    except asyncio.CancelledError:
        pass  # normal shutdown — no action needed


async def _teacher_heartbeat(sid: str) -> None:
    """Send periodic pings to the teacher connection to detect zombie sockets."""
    interval = settings.WS_HEARTBEAT_INTERVAL_SECONDS
    try:
        while True:
            await asyncio.sleep(interval)
            await manager.send_to_teacher(sid, {"type": "ping"})
    except asyncio.CancelledError:
        pass  # normal shutdown — no action needed


def _session_dict(session: GameRun) -> dict:
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


def _player_dict(player: RunPlayer) -> dict:
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
        player = await RunService.get_player_by_token(db, guest_token)
        if not player:
            await websocket.close(code=4001, reason="Unauthorized: invalid token")
            return

        if player.session_id != session_id:
            await websocket.close(
                code=4002, reason="Forbidden: token does not match session"
            )
            return

        session = await RunService.get_session_with_players(db, session_id)
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
            settings_obj = await RunService.get_quest_settings(db, session.quest_id)
            if settings_obj and settings_obj.time_limit_minutes:
                player_ends_at = player.started_at + timedelta(
                    minutes=settings_obj.time_limit_minutes
                )
                if player_ends_at < now:
                    time_expired = True
        already_finished = player.status == PlayerStatus.FINISHED
        if time_expired and not already_finished:
            player = await RunService.player_timeout(db, session_id, player)
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

    heartbeat_task = asyncio.create_task(_player_heartbeat(sid, player_id))
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "pong":
                # Heartbeat acknowledgement from client — no further processing needed.
                continue
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
    finally:
        heartbeat_task.cancel()


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
        user = await UserService.get_user_by_id(db, user_id)

        if not user or user.role != UserRole.TEACHER:
            await websocket.close(
                code=4001, reason="Unauthorized: teacher role required"
            )
            return

        session = await RunService.get_session_with_players(db, session_id)

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

    heartbeat_task = asyncio.create_task(_teacher_heartbeat(sid))
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "pong":
                # Heartbeat acknowledgement from client — no further processing needed.
                continue
            await handle_teacher_message(sid, teacher_id, data)
    except WebSocketDisconnect:
        await manager.disconnect_teacher(sid)
    except Exception as exc:
        logger.exception("Unexpected error in teacher WS session=%s: %s", sid, exc)
        await manager.disconnect_teacher(sid)
    finally:
        heartbeat_task.cancel()
