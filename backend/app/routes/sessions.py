import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db

from app.models.session_player import PlayerStatus, SessionPlayer
from app.models.user import User
from app.schemas.resource import ResourceDetailPublicResponse
from app.schemas.session import (
    GameInfoResponse,
    GameSessionDetailResponse,
    GameSessionResultResponse,
    GameSessionResponse,
    JoinSessionRequest,
    LeaveTeamResponse,
    RejoinSessionRequest,
    ReviewAnswerRequest,
    SessionCreate,
    SessionListItem,
    SessionPlayerResponse,
    SessionProgressResponse,
    SessionProgressResultResponse,
    SessionUpdateRequest,
    SubmitAnswerRequest,
    TeacherMonitorResponse,
    TeamResponse,
    UpdateGuestNameRequest,
)
from app.services.session_service import SessionService
from app.services.team_service import TeamService
from app.services.progress_service import ProgressService
from app.services.websocket_manager import manager
from app.utils.dependencies import get_current_teacher
from app.utils.security import verify_token


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


router = APIRouter(prefix="/api/sessions", tags=["Sessions"])

_optional_bearer = HTTPBearer(auto_error=False)


async def _get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_optional_bearer),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    if not credentials:
        return None
    payload = verify_token(credentials.credentials)
    if not payload:
        return None
    user_id = payload.get("sub")
    from app.services.auth_service import AuthService

    return await AuthService.get_user_by_id(db, user_id)


async def _get_player_by_token(
    x_guest_token: Optional[str] = Header(None),
    guest_token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
) -> SessionPlayer:
    token = x_guest_token or guest_token
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Guest token required"
        )
    player = await SessionService.get_player_by_token(db, token)
    if not player:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid guest token"
        )
    return player


@router.get("/", response_model=List[SessionListItem])
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await SessionService.list_sessions(db, teacher.id)


@router.post(
    "/", response_model=GameSessionResponse, status_code=status.HTTP_201_CREATED
)
async def create_session(
    data: SessionCreate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await SessionService.create_session(db, teacher.id, data)


@router.get("/code/{session_code}", response_model=GameSessionResponse)
async def get_session_by_code(
    session_code: str,
    db: AsyncSession = Depends(get_db),
):
    return await SessionService.get_session_by_code(db, session_code)


@router.post("/join", response_model=SessionPlayerResponse)
async def join_session(
    data: JoinSessionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(_get_optional_user),
):
    user_id = current_user.id if current_user else None
    return await SessionService.join_session(db, data, user_id)


@router.post("/rejoin", response_model=SessionPlayerResponse)
async def rejoin_session(
    data: RejoinSessionRequest,
    db: AsyncSession = Depends(get_db),
):
    return await SessionService.rejoin_session(db, data)


@router.post("/{session_id}/teams/leave", response_model=LeaveTeamResponse)
async def leave_team(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    player: SessionPlayer = Depends(_get_player_by_token),
):
    player_resp, new_team, old_member_ids = await TeamService.leave_team(
        db, session_id, player
    )
    sid = str(session_id)
    pid = str(player.id)

    # Notify old teammates that this player left
    for old_pid in old_member_ids:
        await manager.send_to_player(
            sid, old_pid, {"type": "player_left", "player_id": pid}
        )

    # Notify new team members that this player joined
    player_data = {
        "id": pid,
        "session_id": str(player_resp.session_id),
        "display_name": player_resp.display_name,
        "avatar_color": player_resp.avatar_color,
        "status": player_resp.status.value
        if hasattr(player_resp.status, "value")
        else player_resp.status,
        "team_id": str(player_resp.team_id) if player_resp.team_id else None,
        "joined_at": player_resp.joined_at.isoformat(),
        "started_at": None,
        "finished_at": None,
        "guest_name": player_resp.guest_name,
        "user_id": None,
    }
    for member in new_team.players:
        new_pid = str(member.id)
        if new_pid != pid:
            await manager.send_to_player(
                sid, new_pid, {"type": "player_joined", "player": player_data}
            )

    return LeaveTeamResponse(player=player_resp, team=new_team)


@router.post("/{session_id}/start", response_model=GameSessionResponse)
async def start_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await SessionService.start_session(db, session_id, teacher.id)


@router.post("/{session_id}/player-start", response_model=GameSessionResponse)
async def player_start_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    player: SessionPlayer = Depends(_get_player_by_token),
):
    result = await SessionService.player_start_session(db, session_id, player)

    # Broadcast session_started to all connected WebSocket clients
    sid = str(session_id)
    for player_resp in result.players:
        pid = str(player_resp.id)
        visible = await ProgressService.get_player_visible_progress(
            db, session_id, player_resp.id
        )
        await manager.send_to_player(
            sid,
            pid,
            {
                "type": "session_started",
                "session": {
                    "started_at": _iso(result.started_at),
                    "ends_at": _iso(result.ends_at),
                },
                "player_started_at": _iso(player_resp.started_at),
                "progress": [
                    {
                        "id": str(p.id),
                        "session_id": str(p.session_id),
                        "player_id": str(p.player_id),
                        "resource_id": str(p.resource_id) if p.resource_id else None,
                        "map_object_id": str(p.map_object_id)
                        if p.map_object_id
                        else None,
                        "status": p.status.value
                        if hasattr(p.status, "value")
                        else p.status,
                        "score": p.score,
                        "answer": p.answer,
                        "requires_review": p.requires_review,
                        "assigned_at": _iso(p.assigned_at),
                        "completed_at": _iso(p.completed_at),
                    }
                    for p in visible
                ],
            },
        )

    await manager.send_to_teacher(
        sid,
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
    return result


@router.get("/{session_id}/teams/{team_id}", response_model=TeamResponse)
async def get_team(
    session_id: uuid.UUID,
    team_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    player: SessionPlayer = Depends(_get_player_by_token),
):
    return await TeamService.get_team(db, session_id, team_id, player)


@router.get("/{session_id}/teams/{team_id}/step-info")
async def get_team_step_info(
    session_id: uuid.UUID,
    team_id: uuid.UUID,
    player: SessionPlayer = Depends(_get_player_by_token),
    db: AsyncSession = Depends(get_db),
):
    """Return current active step info for the team (hint player, active player, map object)."""
    if player.team_id != team_id or player.session_id != session_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return await TeamService.get_team_step_info(db, session_id, team_id)


@router.post("/{session_id}/teams/{team_id}/start", response_model=TeamResponse)
async def start_team(
    session_id: uuid.UUID,
    team_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    player: SessionPlayer = Depends(_get_player_by_token),
):
    team = await TeamService.start_team(db, session_id, team_id, player)

    sid = str(session_id)
    tid = str(team_id)

    from app.models.game_session import GameSession as _GS
    from sqlalchemy import select

    sess_row = await db.execute(select(_GS).where(_GS.id == session_id))
    started_session = sess_row.scalar_one_or_none()
    session_timing = {
        "started_at": _iso(started_session.started_at) if started_session else None,
        "ends_at": _iso(started_session.ends_at) if started_session else None,
    }

    # Get current step info for hint/active player broadcast
    step_info = await TeamService.get_team_step_info(db, session_id, team_id)

    # Notify all team members with their visible progress + step info
    for p in team.players:
        pid = str(p.id)
        visible = await ProgressService.get_player_visible_progress(
            db, session_id, p.id
        )
        await manager.send_to_player(
            sid,
            pid,
            {
                "type": "team_started",
                "team_id": tid,
                "session": session_timing,
                "player_started_at": _iso(p.started_at),
                "step_info": step_info,
                "progress": [
                    {
                        "id": str(pr.id),
                        "session_id": str(pr.session_id),
                        "player_id": str(pr.player_id),
                        "resource_id": str(pr.resource_id) if pr.resource_id else None,
                        "map_object_id": str(pr.map_object_id)
                        if pr.map_object_id
                        else None,
                        "step_order": pr.step_order,
                        "status": pr.status.value
                        if hasattr(pr.status, "value")
                        else pr.status,
                        "score": pr.score,
                        "answer": pr.answer,
                        "requires_review": pr.requires_review,
                        "assigned_at": _iso(pr.assigned_at),
                        "completed_at": _iso(pr.completed_at),
                    }
                    for pr in visible
                ],
            },
        )

    # Notify teacher
    await manager.send_to_teacher(
        sid,
        {
            "type": "team_started",
            "team_id": tid,
            "players": [str(p.id) for p in team.players],
        },
    )
    return team


@router.post("/{session_id}/player-timeout", status_code=204)
async def player_timeout(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    player: SessionPlayer = Depends(_get_player_by_token),
):
    player = await SessionService.player_timeout(db, session_id, player)
    pid = str(player.id)
    sid = str(session_id)
    await manager.broadcast_to_all(sid, {"type": "player_finished", "player_id": pid})


@router.post("/{session_id}/stop", response_model=GameSessionResponse)
async def stop_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    result = await SessionService.stop_session(db, session_id, teacher.id)
    await manager.broadcast_to_all(
        str(session_id), {"type": "session_stopped", "session_id": str(session_id)}
    )
    return result


@router.patch("/{session_id}/settings", response_model=GameSessionResponse)
async def update_session_settings(
    session_id: uuid.UUID,
    data: SessionUpdateRequest,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await SessionService.update_session_settings(
        db, session_id, teacher.id, data
    )


@router.post("/{session_id}/restart", response_model=GameSessionResponse)
async def restart_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    result = await SessionService.restart_session(db, session_id, teacher.id)
    await manager.broadcast_to_all(
        str(session_id),
        {"type": "session_restarted", "session_id": str(session_id)},
    )
    return result


@router.get("/{session_id}/monitor", response_model=TeacherMonitorResponse)
async def get_teacher_monitor(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await SessionService.get_teacher_monitor(db, session_id, teacher.id)


@router.get(
    "/{session_id}/players/{player_id}/progress",
    response_model=List[SessionProgressResultResponse],
)
async def get_player_progress_detail(
    session_id: uuid.UUID,
    player_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await ProgressService.get_player_progress_detail(
        db, session_id, player_id, teacher.id
    )


@router.post("/progress/{progress_id}/answer", response_model=SessionProgressResponse)
async def submit_answer(
    progress_id: uuid.UUID,
    data: SubmitAnswerRequest,
    db: AsyncSession = Depends(get_db),
    player: SessionPlayer = Depends(_get_player_by_token),
):
    result, team_step_info = await ProgressService.submit_answer(
        db, progress_id, player, data
    )
    sid = str(player.session_id)
    pid = str(player.id)

    correct: bool | None = None
    if result.score is not None:
        correct = result.score >= 1.0

    if player.team_id:
        # Team mode: send answer_result to answering player
        await manager.send_to_player(
            sid,
            pid,
            {
                "type": "answer_result",
                "progress": result.model_dump(mode="json"),
                "correct": correct,
                "score": result.score,
            },
        )

        # Broadcast step advance to all team members
        if team_step_info:
            from sqlalchemy import select

            team_players_q = await db.execute(
                select(SessionPlayer).where(SessionPlayer.team_id == player.team_id)
            )
            team_players = team_players_q.scalars().all()
            step_event = {
                "type": "team_step_advanced",
                **team_step_info,
                "completed_by_progress": result.model_dump(mode="json"),
            }
            for tp in team_players:
                await manager.send_to_player(sid, str(tp.id), step_event)
    else:
        # Solo mode: existing behavior
        await manager.send_to_player(
            sid,
            pid,
            {
                "type": "answer_result",
                "progress": result.model_dump(mode="json"),
                "correct": correct,
                "score": result.score,
            },
        )
        # New resource on same map object
        if result.map_object_id:
            from sqlalchemy import select
            from app.models.session_progress import SessionProgress

            new_prog = await db.execute(
                select(SessionProgress)
                .where(
                    SessionProgress.session_id == player.session_id,
                    SessionProgress.player_id == player.id,
                    SessionProgress.map_object_id == result.map_object_id,
                    SessionProgress.id != progress_id,
                )
                .order_by(SessionProgress.assigned_at.desc())
                .limit(1)
            )
            new_p = new_prog.scalar_one_or_none()
            if new_p:
                await manager.send_to_player(
                    sid,
                    pid,
                    {
                        "type": "object_updated",
                        "map_object_id": str(result.map_object_id),
                        "new_progress_id": str(new_p.id),
                        "resource_type": None,
                    },
                )

    await manager.send_to_teacher(
        sid,
        {
            "type": "player_answered",
            "player_id": pid,
            "progress_id": str(result.id),
            "requires_review": result.requires_review,
        },
    )

    if player.status == PlayerStatus.FINISHED:
        await manager.broadcast_to_all(
            sid, {"type": "player_finished", "player_id": pid}
        )

    return result


@router.post("/progress/{progress_id}/viewed", response_model=SessionProgressResponse)
async def mark_text_viewed(
    progress_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    player: SessionPlayer = Depends(_get_player_by_token),
):
    result, team_step_info, viewers = await ProgressService.mark_text_viewed(
        db, progress_id, player
    )
    sid = str(player.session_id)
    pid = str(player.id)

    if player.team_id:
        # Team mode: broadcast who has viewed to all team members
        from sqlalchemy import select

        team_players_q = await db.execute(
            select(SessionPlayer).where(SessionPlayer.team_id == player.team_id)
        )
        team_players = team_players_q.scalars().all()

        viewed_event = {
            "type": "team_text_viewed",
            "viewer_id": pid,
            "viewers": viewers or [pid],
        }
        for tp in team_players:
            await manager.send_to_player(sid, str(tp.id), viewed_event)

        # If all viewed, broadcast step advance
        if team_step_info:
            step_event = {
                "type": "team_step_advanced",
                **team_step_info,
                "completed_by_progress": None,
            }
            for tp in team_players:
                await manager.send_to_player(sid, str(tp.id), step_event)
    else:
        # Solo mode
        await manager.send_to_player(
            sid,
            pid,
            {"type": "text_viewed", "progress_id": str(result.id)},
        )

    await manager.send_to_teacher(
        sid,
        {"type": "player_viewed_text", "player_id": pid, "progress_id": str(result.id)},
    )

    if player.status == PlayerStatus.FINISHED:
        await manager.broadcast_to_all(
            sid, {"type": "player_finished", "player_id": pid}
        )

    return result


@router.post("/progress/{progress_id}/review", response_model=SessionProgressResponse)
async def review_answer(
    progress_id: uuid.UUID,
    data: ReviewAnswerRequest,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await ProgressService.review_answer(db, progress_id, teacher.id, data)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    await SessionService.delete_session(db, session_id, teacher.id)


@router.patch(
    "/{session_id}/players/{player_id}/guest-name",
    response_model=SessionPlayerResponse,
)
async def update_player_guest_name(
    session_id: uuid.UUID,
    player_id: uuid.UUID,
    data: UpdateGuestNameRequest,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await SessionService.update_player_guest_name(
        db, session_id, player_id, teacher.id, data.guest_name
    )


@router.delete(
    "/{session_id}/players/{player_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_player(
    session_id: uuid.UUID,
    player_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    await SessionService.delete_player(db, session_id, player_id, teacher.id)


@router.get("/{session_id}/game-info", response_model=GameInfoResponse)
async def get_game_info(
    session_id: uuid.UUID,
    lang: str = Query("uk"),
    db: AsyncSession = Depends(get_db),
    player: SessionPlayer = Depends(_get_player_by_token),
):
    return await SessionService.get_game_info(db, session_id, player, lang)


@router.get("/{session_id}/my-progress", response_model=List[SessionProgressResponse])
async def get_my_progress(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    player: SessionPlayer = Depends(_get_player_by_token),
):
    return await ProgressService.get_my_progress(db, session_id, player)


@router.get("/{session_id}/team-progress", response_model=List[SessionProgressResponse])
async def get_team_progress(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    player: SessionPlayer = Depends(_get_player_by_token),
):
    """Team mode: return all teammates' completed progress items for materials panel."""
    return await ProgressService.get_team_progress(db, session_id, player)


@router.get(
    "/progress/{progress_id}/resource", response_model=ResourceDetailPublicResponse
)
async def get_progress_resource(
    progress_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    player: SessionPlayer = Depends(_get_player_by_token),
):
    return await ProgressService.get_progress_resource(db, progress_id, player)


@router.get("/{session_id}/results", response_model=GameSessionResultResponse)
async def get_session_results(
    session_id: uuid.UUID,
    guest_token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    return await SessionService.get_session_results(db, session_id, guest_token)
