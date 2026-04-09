import random
import uuid
from typing import Dict, List, Optional, Tuple
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import delete as sa_delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.game_session import GameSession, SessionStatus
from app.models.session_chat import SessionChat
from app.models.session_player import PlayerStatus, SessionPlayer
from app.models.session_progress import SessionProgress
from app.models.session_team import SessionTeam, TeamStatus
from app.schemas.session import (
    TeamPlayerResponse,
    TeamResponse,
)


def _now():
    from datetime import datetime, timezone

    return datetime.now(timezone.utc)


def _team_response(team: SessionTeam) -> TeamResponse:
    return TeamResponse(
        id=team.id,
        session_id=team.session_id,
        status=team.status,
        players=[
            TeamPlayerResponse(
                id=p.id,
                display_name=p.display_name,
                avatar_color=p.avatar_color,
                status=p.status,
            )
            for p in team.players
        ],
        created_at=team.created_at,
        started_at=team.started_at,
    )


async def _find_or_create_team(db: AsyncSession, session: GameSession) -> SessionTeam:
    """Find a waiting team with an open slot, or create a new one."""
    return await _find_or_create_team_excluding(db, session, None)


async def _find_or_create_team_excluding(
    db: AsyncSession,
    session: GameSession,
    exclude_team_id: Optional[uuid.UUID],
) -> SessionTeam:
    """Find a waiting team with an open slot (excluding a given team), or create a new one."""
    query = (
        select(SessionTeam)
        .where(
            SessionTeam.session_id == session.id,
            SessionTeam.status == TeamStatus.WAITING,
        )
        .options(selectinload(SessionTeam.players))
        .order_by(SessionTeam.created_at)
    )
    if exclude_team_id is not None:
        query = query.where(SessionTeam.id != exclude_team_id)
    result = await db.execute(query)
    waiting_teams = list(result.scalars().all())
    team = next(
        (t for t in waiting_teams if len(t.players) < session.max_players), None
    )
    if not team:
        team = SessionTeam(session_id=session.id)
        db.add(team)
        await db.flush()
    return team


async def _cleanup_stale_teams(
    db: AsyncSession, session: GameSession, max_wait_minutes: int = 30
) -> bool:
    """Delete WAITING teams (and all their players) that have not started within the given window.

    Returns True if anything was deleted.
    """
    cutoff = _now() - timedelta(minutes=max_wait_minutes)
    stale_result = await db.execute(
        select(SessionTeam)
        .where(
            SessionTeam.session_id == session.id,
            SessionTeam.status == TeamStatus.WAITING,
            SessionTeam.created_at < cutoff,
        )
        .options(selectinload(SessionTeam.players))
    )
    stale_teams = list(stale_result.scalars().all())
    if not stale_teams:
        return False

    for team in stale_teams:
        player_ids = [p.id for p in team.players]
        if player_ids:
            # Detach hint_player_id FK before deleting players
            team.hint_player_id = None
            await db.flush()
            await db.execute(
                sa_delete(SessionProgress).where(
                    SessionProgress.player_id.in_(player_ids)
                )
            )
            await db.execute(
                sa_delete(SessionChat).where(SessionChat.player_id.in_(player_ids))
            )
            await db.execute(
                sa_delete(SessionPlayer).where(SessionPlayer.id.in_(player_ids))
            )
        await db.delete(team)

    await db.flush()
    return True


class TeamService:
    @staticmethod
    async def get_team(
        db: AsyncSession,
        session_id: uuid.UUID,
        team_id: uuid.UUID,
        player: SessionPlayer,
    ) -> TeamResponse:
        if player.team_id != team_id or player.session_id != session_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
            )
        result = await db.execute(
            select(SessionTeam)
            .where(SessionTeam.id == team_id, SessionTeam.session_id == session_id)
            .options(selectinload(SessionTeam.players))
        )
        team = result.scalar_one_or_none()
        if not team:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Team not found"
            )
        return _team_response(team)

    @staticmethod
    async def leave_team(
        db: AsyncSession, session_id: uuid.UUID, player: SessionPlayer
    ) -> tuple:
        """Move a player from their current waiting team to a different team.

        Returns (updated_player, new_team, old_team_member_ids).
        """
        from app.services.session_service import _player_response

        if player.session_id != session_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
            )

        if not player.team_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Not in a team"
            )

        # Load old team with its members
        old_team_result = await db.execute(
            select(SessionTeam)
            .where(SessionTeam.id == player.team_id)
            .options(selectinload(SessionTeam.players))
        )
        old_team = old_team_result.scalar_one_or_none()

        if not old_team or old_team.status != TeamStatus.WAITING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot leave a team that has already started",
            )

        old_team_id = old_team.id
        old_member_ids = [str(p.id) for p in old_team.players if p.id != player.id]

        # Load session for team lookup
        session_result = await db.execute(
            select(GameSession)
            .where(GameSession.id == session_id)
            .options(selectinload(GameSession.players))
        )
        session = session_result.scalar_one_or_none()

        # Remove player from old team
        player.team_id = None
        await db.flush()

        # Delete old team if now empty
        count_result = await db.execute(
            select(func.count()).where(SessionPlayer.team_id == old_team_id)
        )
        if count_result.scalar_one() == 0:
            stale_team = await db.get(SessionTeam, old_team_id)
            if stale_team:
                await db.delete(stale_team)
                await db.flush()

        # Assign to a new waiting team
        new_team = await _find_or_create_team_excluding(db, session, old_team_id)
        player.team_id = new_team.id
        await db.flush()

        await db.commit()
        await db.refresh(player)

        # Reload new team with current players
        new_team_result = await db.execute(
            select(SessionTeam)
            .where(SessionTeam.id == new_team.id)
            .options(selectinload(SessionTeam.players))
        )
        new_team_loaded = new_team_result.scalar_one()

        return _player_response(player), _team_response(new_team_loaded), old_member_ids

    @staticmethod
    async def start_team(
        db: AsyncSession,
        session_id: uuid.UUID,
        team_id: uuid.UUID,
        player: SessionPlayer,
    ) -> TeamResponse:
        """Team mode: player starts their team's quest."""
        from app.services.session_service import SessionService

        if player.team_id != team_id or player.session_id != session_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
            )

        result = await db.execute(
            select(SessionTeam)
            .where(SessionTeam.id == team_id, SessionTeam.session_id == session_id)
            .options(selectinload(SessionTeam.players))
        )
        team = result.scalar_one_or_none()
        if not team:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Team not found"
            )
        if team.status != TeamStatus.WAITING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Team already started"
            )

        from app.services.session_service import _load_session

        session = await _load_session(db, session_id)
        if session.status not in (
            SessionStatus.WAITING,
            SessionStatus.SCHEDULED,
            SessionStatus.ACTIVE,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Session is not active"
            )

        if not session.allow_solo_in_team and len(team.players) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Need at least one teammate to start",
            )

        await SessionService._distribute_resources_for_team(db, session, team)

        now = _now()
        team.status = TeamStatus.ACTIVE
        team.started_at = now

        if session.status != SessionStatus.ACTIVE:
            session.status = SessionStatus.ACTIVE
            session.started_at = now

        for p in team.players:
            p.status = PlayerStatus.PLAYING
            p.started_at = now

        await db.commit()

        result = await db.execute(
            select(SessionTeam)
            .where(SessionTeam.id == team_id)
            .options(selectinload(SessionTeam.players))
        )
        return _team_response(result.scalar_one())

    @staticmethod
    async def get_team_step_info(
        db: AsyncSession,
        session_id: uuid.UUID,
        team_id: uuid.UUID,
    ) -> Dict:
        """Return current active step info for a team (for WS events on start)."""
        from app.models.resource import Resource
        from app.models.session_progress import ProgressStatus

        # Find first ASSIGNED record with map_object_id (current active step)
        active_result = await db.execute(
            select(SessionProgress)
            .where(
                SessionProgress.session_id == session_id,
                SessionProgress.team_id == team_id,
                SessionProgress.map_object_id != None,  # noqa: E711
                SessionProgress.status == ProgressStatus.ASSIGNED,
            )
            .order_by(SessionProgress.step_order)
            .limit(1)
        )
        active_rec = active_result.scalar_one_or_none()
        if not active_rec:
            return {}

        step_order = active_rec.step_order
        resource_id = active_rec.resource_id
        resource = await db.get(Resource, resource_id)
        resource_type = resource.type if resource else "question"

        team_obj = await db.get(SessionTeam, team_id)
        hint_pid = (
            str(team_obj.hint_player_id)
            if team_obj and team_obj.hint_player_id
            else None
        )

        if resource_type == "text" or (
            hasattr(resource_type, "value") and resource_type.value == "text"
        ):
            active_pid = None
        else:
            active_pid = str(active_rec.player_id)

        return {
            "resource_type": resource_type.value
            if hasattr(resource_type, "value")
            else resource_type,
            "active_player_id": active_pid,
            "hint_player_id": hint_pid,
            "map_object_id": str(active_rec.map_object_id),
            "step_order": step_order,
        }
