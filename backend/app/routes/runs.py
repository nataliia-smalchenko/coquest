import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import limiter
from app.database import get_db

from app.models.run_player import PlayerStatus, RunPlayer
from app.models.user import User
from app.schemas.resource import ResourceDetailPublicResponse
from app.schemas.run import (
    GameInfoResponse,
    GameRunDetailResponse,
    GameRunResultResponse,
    GameRunResponse,
    JoinRunRequest,
    LeaveTeamResponse,
    RejoinRunRequest,
    ReviewAnswerRequest,
    RunCreate,
    RunListItem,
    RunPlayerResponse,
    RunProgressResponse,
    RunProgressResultResponse,
    RunUpdateRequest,
    SubmitAnswerRequest,
    TeacherMonitorResponse,
    TeamResponse,
    UpdateGuestNameRequest,
)
from app.services.run_service import RunService
from app.services.team_service import TeamService
from app.services.progress_service import ProgressService
from app.services.websocket_manager import manager
from app.utils.dependencies import get_current_teacher
from app.utils.security import verify_token


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


router = APIRouter(prefix="/api/runs", tags=["Runs"])

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
) -> RunPlayer:
    token = x_guest_token or guest_token
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Guest token required"
        )
    player = await RunService.get_player_by_token(db, token)
    if not player:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid guest token"
        )
    return player


@router.get("/", response_model=List[RunListItem])
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await RunService.list_sessions(db, teacher.id)


@router.post(
    "/", response_model=GameRunResponse, status_code=status.HTTP_201_CREATED
)
@limiter.limit("20/minute")
async def create_session(
    request: Request,
    data: RunCreate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await RunService.create_session(db, teacher.id, data)


@router.get("/code/{session_code}", response_model=GameRunResponse)
async def get_session_by_code(
    session_code: str,
    db: AsyncSession = Depends(get_db),
):
    return await RunService.get_session_by_code(db, session_code)


@router.post("/join", response_model=RunPlayerResponse)
async def join_session(
    data: JoinRunRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(_get_optional_user),
):
    user_id = current_user.id if current_user else None
    return await RunService.join_session(db, data, user_id)


@router.post("/rejoin", response_model=RunPlayerResponse)
async def rejoin_session(
    data: RejoinRunRequest,
    db: AsyncSession = Depends(get_db),
):
    return await RunService.rejoin_session(db, data)


@router.post("/{session_id}/teams/leave", response_model=LeaveTeamResponse)
async def leave_team(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    player: RunPlayer = Depends(_get_player_by_token),
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


@router.post("/{session_id}/start", response_model=GameRunResponse)
async def start_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await RunService.start_session(db, session_id, teacher.id)


@router.post("/{session_id}/player-start", response_model=GameRunResponse)
async def player_start_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    player: RunPlayer = Depends(_get_player_by_token),
):
    result = await RunService.player_start_session(db, session_id, player)

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
    player: RunPlayer = Depends(_get_player_by_token),
):
    return await TeamService.get_team(db, session_id, team_id, player)


@router.get("/{session_id}/teams/{team_id}/step-info")
async def get_team_step_info(
    session_id: uuid.UUID,
    team_id: uuid.UUID,
    player: RunPlayer = Depends(_get_player_by_token),
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
    player: RunPlayer = Depends(_get_player_by_token),
):
    team = await TeamService.start_team(db, session_id, team_id, player)

    sid = str(session_id)
    tid = str(team_id)

    session_timing = await RunService.get_session_timing(db, session_id)

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
    player: RunPlayer = Depends(_get_player_by_token),
):
    player = await RunService.player_timeout(db, session_id, player)
    pid = str(player.id)
    sid = str(session_id)
    await manager.broadcast_to_all(sid, {"type": "player_finished", "player_id": pid})


@router.post("/{session_id}/stop", response_model=GameRunResponse)
async def stop_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    result = await RunService.stop_session(db, session_id, teacher.id)
    await manager.broadcast_to_all(
        str(session_id), {"type": "session_stopped", "session_id": str(session_id)}
    )
    return result


@router.patch("/{session_id}/settings", response_model=GameRunResponse)
async def update_session_settings(
    session_id: uuid.UUID,
    data: RunUpdateRequest,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await RunService.update_session_settings(
        db, session_id, teacher.id, data
    )


@router.post("/{session_id}/restart", response_model=GameRunResponse)
async def restart_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    result = await RunService.restart_session(db, session_id, teacher.id)
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
    return await RunService.get_teacher_monitor(db, session_id, teacher.id)


@router.get(
    "/{session_id}/players/{player_id}/progress",
    response_model=List[RunProgressResultResponse],
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


@router.post("/progress/{progress_id}/answer", response_model=RunProgressResponse)
async def submit_answer(
    progress_id: uuid.UUID,
    data: SubmitAnswerRequest,
    db: AsyncSession = Depends(get_db),
    player: RunPlayer = Depends(_get_player_by_token),
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
            team_players = await RunService.get_team_players(db, player.team_id)
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
            new_p = await RunService.get_next_progress_for_map_object(
                db, player.session_id, player.id, result.map_object_id, progress_id
            )
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


@router.post("/progress/{progress_id}/viewed", response_model=RunProgressResponse)
async def mark_text_viewed(
    progress_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    player: RunPlayer = Depends(_get_player_by_token),
):
    result, team_step_info, viewers = await ProgressService.mark_text_viewed(
        db, progress_id, player
    )
    sid = str(player.session_id)
    pid = str(player.id)

    if player.team_id:
        # Team mode: broadcast who has viewed to all team members
        team_players = await RunService.get_team_players(db, player.team_id)

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


@router.post("/progress/{progress_id}/review", response_model=RunProgressResponse)
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
    await RunService.delete_session(db, session_id, teacher.id)


@router.patch(
    "/{session_id}/players/{player_id}/guest-name",
    response_model=RunPlayerResponse,
)
async def update_player_guest_name(
    session_id: uuid.UUID,
    player_id: uuid.UUID,
    data: UpdateGuestNameRequest,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await RunService.update_player_guest_name(
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
    await RunService.delete_player(db, session_id, player_id, teacher.id)


@router.get("/{session_id}/game-info", response_model=GameInfoResponse)
async def get_game_info(
    session_id: uuid.UUID,
    lang: str = Query("uk"),
    db: AsyncSession = Depends(get_db),
    player: RunPlayer = Depends(_get_player_by_token),
):
    return await RunService.get_game_info(db, session_id, player, lang)


@router.get("/{session_id}/my-progress", response_model=List[RunProgressResponse])
async def get_my_progress(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    player: RunPlayer = Depends(_get_player_by_token),
):
    return await ProgressService.get_my_progress(db, session_id, player)


@router.get("/{session_id}/team-progress", response_model=List[RunProgressResponse])
async def get_team_progress(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    player: RunPlayer = Depends(_get_player_by_token),
):
    """Team mode: return all teammates' completed progress items for materials panel."""
    return await ProgressService.get_team_progress(db, session_id, player)


@router.get(
    "/progress/{progress_id}/resource", response_model=ResourceDetailPublicResponse
)
async def get_progress_resource(
    progress_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    player: RunPlayer = Depends(_get_player_by_token),
):
    return await ProgressService.get_progress_resource(db, progress_id, player)


@router.get("/{session_id}/results", response_model=GameRunResultResponse)
async def get_session_results(
    session_id: uuid.UUID,
    guest_token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    return await RunService.get_session_results(db, session_id, guest_token)
