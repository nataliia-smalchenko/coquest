"""Core run lifecycle service: CRUD, session state, player management."""

import random
import secrets
import string
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import delete as sa_delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.game_run import GameRun, SessionStatus
from app.models.map import MapObject
from app.models.quest import Quest, QuestSettings, QuestTranslation
from app.models.run_player import PlayerStatus, RunPlayer
from app.models.run_progress import RunProgress
from app.models.run_team import RunTeam, TeamStatus
from app.models.run_chat import RunChat
from app.models.user import User
from app.config import settings
from app.schemas.run import (
    GameInfoResponse,
    GameRunResponse,
    JoinRunRequest,
    RejoinRunRequest,
    RunCreate,
    RunListItem,
    RunPlayerResponse,
    RunSettingsPublic,
    RunUpdateRequest,
)

AVATAR_COLORS = [
    "#6366f1",
    "#f59e0b",
    "#10b981",
    "#ef4444",
    "#3b82f6",
    "#8b5cf6",
    "#f97316",
    "#ec4899",
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _maybe_expire_session(db: AsyncSession, session: GameRun) -> bool:
    """Auto-stop a session if ends_at has passed. Returns True if expired."""
    if session.status != SessionStatus.ACTIVE or session.ends_at is None:
        return False
    now = _now()
    if session.ends_at >= now:
        return False

    # Skip if another transaction is already expiring this session.
    lock_result = await db.execute(
        select(GameRun.id)
        .where(GameRun.id == session.id, GameRun.status == SessionStatus.ACTIVE)
        .with_for_update(skip_locked=True)
    )
    if lock_result.scalar_one_or_none() is None:
        return False

    session.status = SessionStatus.STOPPED
    results_until = now + timedelta(days=settings.RESULTS_AVAILABLE_DAYS)
    for player in session.players:
        if player.status != PlayerStatus.FINISHED:
            player.status = PlayerStatus.FINISHED
            player.finished_at = now
        player.results_available_until = results_until
    await db.flush()
    return True


def _player_response(player: RunPlayer) -> RunPlayerResponse:
    return RunPlayerResponse(
        id=player.id,
        session_id=player.session_id,
        user_id=player.user_id,
        guest_name=player.guest_name,
        display_name=player.display_name,
        avatar_color=player.avatar_color,
        status=player.status,
        joined_at=player.joined_at,
        started_at=player.started_at,
        finished_at=player.finished_at,
        guest_token=player.guest_token,
        team_id=player.team_id,
    )


def _session_response(session: GameRun) -> GameRunResponse:
    return GameRunResponse(
        id=session.id,
        quest_id=session.quest_id,
        session_code=session.session_code,
        name=session.name,
        status=session.status,
        started_at=session.started_at,
        ends_at=session.ends_at,
        scheduled_at=session.scheduled_at,
        max_players=session.max_players,
        allow_solo_in_team=session.allow_solo_in_team,
        random_teams=session.random_teams,
        show_feedback_after_answer=session.show_feedback_after_answer,
        show_score_after=session.show_score_after,
        show_correct_answers=session.show_correct_answers,
        keep_completed_in_materials=session.keep_completed_in_materials,
        allow_change_answers=session.allow_change_answers,
        created_at=session.created_at,
        players=[_player_response(p) for p in session.players],
    )


async def _load_session(db: AsyncSession, session_id: uuid.UUID) -> GameRun:
    result = await db.execute(
        select(GameRun)
        .where(GameRun.id == session_id)
        .options(selectinload(GameRun.players))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    return session


async def _load_own_session(
    db: AsyncSession, session_id: uuid.UUID, teacher_id: uuid.UUID
) -> GameRun:
    session = await _load_session(db, session_id)
    if session.teacher_id != teacher_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
        )
    return session


class RunCoreService:
    @staticmethod
    async def get_player_by_token(
        db: AsyncSession, token: str
    ) -> Optional[RunPlayer]:
        result = await db.execute(
            select(RunPlayer).where(RunPlayer.guest_token == token)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def list_sessions(
        db: AsyncSession, teacher_id: uuid.UUID
    ) -> List[RunListItem]:
        result = await db.execute(
            select(GameRun)
            .where(GameRun.teacher_id == teacher_id)
            .options(selectinload(GameRun.players))
            .order_by(GameRun.created_at.desc())
        )
        sessions = result.scalars().all()
        expired_any = False
        for s in sessions:
            if await _maybe_expire_session(db, s):
                expired_any = True
        if expired_any:
            await db.commit()
        return [
            RunListItem(
                id=s.id,
                quest_id=s.quest_id,
                session_code=s.session_code,
                name=s.name,
                status=s.status,
                started_at=s.started_at,
                ends_at=s.ends_at,
                scheduled_at=s.scheduled_at,
                max_players=s.max_players,
                players_count=len(s.players),
                created_at=s.created_at,
            )
            for s in sessions
        ]

    @staticmethod
    async def create_session(
        db: AsyncSession, teacher_id: uuid.UUID, data: RunCreate
    ) -> GameRunResponse:
        quest_result = await db.execute(
            select(Quest).where(
                Quest.id == data.quest_id, Quest.teacher_id == teacher_id
            )
        )
        quest = quest_result.scalar_one_or_none()
        if not quest:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Quest not found"
            )
        if quest.status != "published":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Quest must be published to create a session",
            )

        # Generate unique 6-char session code
        code = ""
        for _ in range(10):
            candidate = "".join(
                random.choices(string.ascii_uppercase + string.digits, k=6)
            )
            exists = await db.execute(
                select(GameRun.id).where(GameRun.session_code == candidate)
            )
            if not exists.scalar_one_or_none():
                code = candidate
                break
        if not code:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not generate a unique session code",
            )

        # Resolve default name from quest title (prefer "uk", fallback to any)
        session_name = data.name
        if not session_name:
            title_result = await db.execute(
                select(QuestTranslation.title)
                .where(QuestTranslation.quest_id == data.quest_id)
                .order_by(QuestTranslation.language)
            )
            rows = title_result.scalars().all()
            if rows:
                session_name = rows[0]

        sess_status = (
            SessionStatus.SCHEDULED if data.scheduled_at else SessionStatus.WAITING
        )
        session = GameRun(
            quest_id=data.quest_id,
            teacher_id=teacher_id,
            session_code=code,
            name=session_name,
            status=sess_status,
            scheduled_at=data.scheduled_at,
            ends_at=data.ends_at,
            max_players=data.max_players,
            allow_solo_in_team=data.allow_solo_in_team,
            random_teams=data.random_teams,
            show_feedback_after_answer=data.show_feedback_after_answer,
            show_score_after=data.show_score_after,
            show_correct_answers=data.show_correct_answers,
            keep_completed_in_materials=data.keep_completed_in_materials,
            allow_change_answers=data.allow_change_answers,
        )
        db.add(session)
        await db.commit()

        result = await db.execute(
            select(GameRun)
            .where(GameRun.id == session.id)
            .options(selectinload(GameRun.players))
        )
        return _session_response(result.scalar_one())

    @staticmethod
    async def get_session_by_code(
        db: AsyncSession, session_code: str
    ) -> GameRunResponse:
        result = await db.execute(
            select(GameRun)
            .where(GameRun.session_code == session_code.upper())
            .options(selectinload(GameRun.players))
        )
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
            )
        return _session_response(session)

    @staticmethod
    async def join_session(
        db: AsyncSession,
        data: JoinRunRequest,
        user_id: Optional[uuid.UUID],
    ) -> RunPlayerResponse:
        from app.services.team_service import _cleanup_stale_teams, _find_or_create_team

        result = await db.execute(
            select(GameRun)
            .where(GameRun.session_code == data.session_code.upper())
            .options(selectinload(GameRun.players))
        )
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
            )
        if session.status not in (
            SessionStatus.WAITING,
            SessionStatus.ACTIVE,
            SessionStatus.SCHEDULED,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Session is not accepting new players",
            )

        # Authenticated user: return existing player record if already joined
        if user_id:
            existing = next((p for p in session.players if p.user_id == user_id), None)
            if existing:
                return _player_response(existing)

        # Resolve display_name
        if user_id:
            user_result = await db.execute(select(User).where(User.id == user_id))
            user = user_result.scalar_one_or_none()
            display_name = data.display_name or (user.full_name if user else "Player")
        else:
            if not data.guest_name:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="guest_name is required for unauthenticated users",
                )
            display_name = data.display_name or data.guest_name

        used_colors = {p.avatar_color for p in session.players}
        available = [c for c in AVATAR_COLORS if c not in used_colors]
        avatar_color = (
            random.choice(available) if available else random.choice(AVATAR_COLORS)
        )

        player = RunPlayer(
            session_id=session.id,
            user_id=user_id,
            guest_name=data.guest_name,
            guest_token=secrets.token_urlsafe(32),
            display_name=display_name,
            avatar_color=avatar_color,
            status=PlayerStatus.WAITING,
        )
        db.add(player)
        await db.flush()

        # In team mode, clean up stale teams then assign player to a waiting team
        if session.max_players > 1:
            await _cleanup_stale_teams(db, session)
            team = await _find_or_create_team(db, session)
            player.team_id = team.id

        await db.commit()
        await db.refresh(player)
        return _player_response(player)

    @staticmethod
    async def rejoin_session(
        db: AsyncSession, data: RejoinRunRequest
    ) -> RunPlayerResponse:
        """Look up an existing player by token and session code, reassigning their team if needed."""
        from app.services.team_service import (
            _cleanup_stale_teams,
            _find_or_create_team,
        )

        sess_result = await db.execute(
            select(GameRun)
            .where(GameRun.session_code == data.session_code.upper())
            .options(selectinload(GameRun.players))
        )
        session = sess_result.scalar_one_or_none()
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
            )

        player_result = await db.execute(
            select(RunPlayer).where(
                RunPlayer.guest_token == data.guest_token,
                RunPlayer.session_id == session.id,
            )
        )
        player = player_result.scalar_one_or_none()
        if not player:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Player not found"
            )

        # Already playing or finished → return as-is (frontend redirects accordingly)
        if player.status in (PlayerStatus.PLAYING, PlayerStatus.FINISHED):
            return _player_response(player)

        # Clean up any stale waiting teams before (re)assigning
        if session.max_players > 1:
            await _cleanup_stale_teams(db, session)

        # WAITING player: check if their team has started
        if player.team_id and session.max_players > 1:
            team_result = await db.execute(
                select(RunTeam).where(RunTeam.id == player.team_id)
            )
            team = team_result.scalar_one_or_none()
            if team is None or team.status != TeamStatus.WAITING:
                # Team was deleted by cleanup or already started → reassign
                player.team_id = None
                await db.flush()
                new_team = await _find_or_create_team(db, session)
                player.team_id = new_team.id
                await db.flush()
        elif not player.team_id and session.max_players > 1:
            new_team = await _find_or_create_team(db, session)
            player.team_id = new_team.id
            await db.flush()

        await db.commit()
        await db.refresh(player)
        return _player_response(player)

    @staticmethod
    async def start_session(
        db: AsyncSession, session_id: uuid.UUID, teacher_id: uuid.UUID
    ) -> GameRunResponse:
        from app.services.run_distribution import RunDistributionService

        session = await _load_own_session(db, session_id, teacher_id)
        if session.status not in (SessionStatus.WAITING, SessionStatus.SCHEDULED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Session must be WAITING or SCHEDULED to start",
            )

        await RunDistributionService._distribute_resources(db, session)

        now = _now()
        session.status = SessionStatus.ACTIVE
        session.started_at = now

        for player in session.players:
            if player.status != PlayerStatus.FINISHED:
                player.status = PlayerStatus.PLAYING
                player.started_at = now

        await db.commit()

        result = await db.execute(
            select(GameRun)
            .where(GameRun.id == session.id)
            .options(selectinload(GameRun.players))
        )
        return _session_response(result.scalar_one())

    @staticmethod
    async def player_start_session(
        db: AsyncSession, session_id: uuid.UUID, player: RunPlayer
    ) -> GameRunResponse:
        """Solo mode: start this player's quest. Distributes resources only for the requesting player."""
        from app.services.run_distribution import RunDistributionService

        if player.session_id != session_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
            )

        session = await _load_session(db, session_id)
        if session.status not in (
            SessionStatus.WAITING,
            SessionStatus.SCHEDULED,
            SessionStatus.ACTIVE,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Session is not active",
            )

        await RunDistributionService._distribute_resources_for_player(db, session, player)

        now = _now()
        if session.status != SessionStatus.ACTIVE:
            session.status = SessionStatus.ACTIVE
            session.started_at = now

        player.started_at = now
        player.status = PlayerStatus.PLAYING
        await db.commit()

        result = await db.execute(
            select(GameRun)
            .where(GameRun.id == session.id)
            .options(selectinload(GameRun.players))
        )
        return _session_response(result.scalar_one())

    @staticmethod
    async def player_timeout(
        db: AsyncSession, session_id: uuid.UUID, player: RunPlayer
    ) -> RunPlayer:
        """Mark a player FINISHED due to time limit expiry.

        Idempotent — safe to call even if the player is already FINISHED.
        Does NOT touch the session status.
        """
        if player.session_id != session_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Player does not belong to this session",
            )
        if player.status != PlayerStatus.FINISHED:
            now = _now()
            player.status = PlayerStatus.FINISHED
            player.finished_at = now
            player.results_available_until = now + timedelta(
                days=settings.RESULTS_AVAILABLE_DAYS
            )
            await db.commit()
            await db.refresh(player)
        return player

    @staticmethod
    async def stop_session(
        db: AsyncSession, session_id: uuid.UUID, teacher_id: uuid.UUID
    ) -> GameRunResponse:
        session = await _load_own_session(db, session_id, teacher_id)
        now = _now()
        session.status = SessionStatus.STOPPED
        session.ends_at = now
        results_until = now + timedelta(days=settings.RESULTS_AVAILABLE_DAYS)
        for player in session.players:
            if player.status != PlayerStatus.FINISHED:
                player.status = PlayerStatus.FINISHED
                player.finished_at = now
            player.results_available_until = results_until

        await db.commit()

        result = await db.execute(
            select(GameRun)
            .where(GameRun.id == session.id)
            .options(selectinload(GameRun.players))
        )
        return _session_response(result.scalar_one())

    @staticmethod
    async def delete_session(
        db: AsyncSession, session_id: uuid.UUID, teacher_id: uuid.UUID
    ) -> None:
        session = await _load_own_session(db, session_id, teacher_id)
        if session.status == SessionStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete active session. Stop it first.",
            )
        await db.delete(session)
        await db.commit()

    @staticmethod
    async def update_session_settings(
        db: AsyncSession,
        session_id: uuid.UUID,
        teacher_id: uuid.UUID,
        data: RunUpdateRequest,
    ) -> GameRunResponse:
        session = await _load_own_session(db, session_id, teacher_id)
        update = data.model_dump(exclude_unset=True)
        for field, value in update.items():
            setattr(session, field, value)
        await db.commit()
        result = await db.execute(
            select(GameRun)
            .where(GameRun.id == session.id)
            .options(selectinload(GameRun.players))
        )
        return _session_response(result.scalar_one())

    @staticmethod
    async def restart_session(
        db: AsyncSession, session_id: uuid.UUID, teacher_id: uuid.UUID
    ) -> GameRunResponse:
        session = await _load_own_session(db, session_id, teacher_id)
        if session.status not in (SessionStatus.STOPPED, SessionStatus.COMPLETED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only stopped or completed sessions can be restarted",
            )

        non_finished_ids = [
            p.id for p in session.players if p.status != PlayerStatus.FINISHED
        ]

        if non_finished_ids:
            await db.execute(
                sa_delete(RunProgress).where(
                    RunProgress.player_id.in_(non_finished_ids)
                )
            )

        teams_result = await db.execute(
            select(RunTeam).where(RunTeam.session_id == session_id)
        )
        for team in teams_result.scalars().all():
            team.hint_player_id = None
        await db.flush()

        await db.execute(
            sa_delete(RunTeam).where(RunTeam.session_id == session_id)
        )
        await db.flush()

        db.expire_all()

        players_result = await db.execute(
            select(RunPlayer).where(RunPlayer.session_id == session_id)
        )
        players = players_result.scalars().all()

        for player in players:
            player.team_id = None
            if player.status != PlayerStatus.FINISHED:
                player.status = PlayerStatus.WAITING
                player.started_at = None
                player.finished_at = None

        session.status = SessionStatus.WAITING
        session.started_at = None
        session.ends_at = None

        await db.commit()
        result = await db.execute(
            select(GameRun)
            .where(GameRun.id == session_id)
            .options(selectinload(GameRun.players))
        )
        return _session_response(result.scalar_one())

    @staticmethod
    async def get_game_info(
        db: AsyncSession,
        session_id: uuid.UUID,
        player: RunPlayer,
        lang: str = "uk",
    ) -> GameInfoResponse:
        from app.models.quest import Quest, QuestSettings
        from app.models.map import Map  # noqa: F401

        if player.session_id != session_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden"
            )

        result = await db.execute(
            select(GameRun)
            .where(GameRun.id == session_id)
            .options(
                selectinload(GameRun.quest).selectinload(Quest.translations),
                selectinload(GameRun.quest).selectinload(Quest.settings),
                selectinload(GameRun.quest).selectinload(Quest.map),
            )
        )
        session = result.scalar_one_or_none()
        if not session or not session.quest:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session or quest not found",
            )

        quest = session.quest
        title = next(
            (t.title for t in quest.translations if t.language == lang), None
        ) or next((t.title for t in quest.translations), "Quest")
        map_slug = quest.map.slug if quest.map else None

        quest_settings = quest.settings
        settings_obj = RunSettingsPublic(
            time_limit_minutes=quest_settings.time_limit_minutes
            if quest_settings
            else None,
            keep_completed_in_materials=session.keep_completed_in_materials,
            show_feedback_after_answer=session.show_feedback_after_answer,
            show_score_after=session.show_score_after,
            show_correct_answers=session.show_correct_answers,
            allow_change_answers=session.allow_change_answers,
        )
        return GameInfoResponse(
            quest_title=title, map_slug=map_slug, settings=settings_obj
        )

    @staticmethod
    async def update_player_guest_name(
        db: AsyncSession,
        session_id: uuid.UUID,
        player_id: uuid.UUID,
        teacher_id: uuid.UUID,
        new_guest_name: Optional[str],
    ) -> RunPlayerResponse:
        await _load_own_session(db, session_id, teacher_id)

        player_result = await db.execute(
            select(RunPlayer).where(
                RunPlayer.id == player_id,
                RunPlayer.session_id == session_id,
            )
        )
        player = player_result.scalar_one_or_none()
        if not player:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Player not found"
            )

        if new_guest_name is not None:
            new_guest_name = new_guest_name.strip()
            if len(new_guest_name) < 2:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="guest_name must be at least 2 characters",
                )
            player.guest_name = new_guest_name
            player.display_name = new_guest_name
        else:
            if player.user_id is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Guest must have a name",
                )
            user_result = await db.execute(
                select(User).where(User.id == player.user_id)
            )
            user = user_result.scalar_one_or_none()
            player.guest_name = None
            player.display_name = user.full_name if user else player.display_name

        await db.commit()
        await db.refresh(player)
        return _player_response(player)

    @staticmethod
    async def delete_player(
        db: AsyncSession,
        session_id: uuid.UUID,
        player_id: uuid.UUID,
        teacher_id: uuid.UUID,
    ) -> None:
        await _load_own_session(db, session_id, teacher_id)
        player_result = await db.execute(
            select(RunPlayer).where(
                RunPlayer.id == player_id,
                RunPlayer.session_id == session_id,
            )
        )
        player = player_result.scalar_one_or_none()
        if not player:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Player not found"
            )

        await db.execute(
            sa_delete(RunProgress).where(RunProgress.player_id == player_id)
        )
        await db.execute(
            sa_delete(RunChat).where(RunChat.player_id == player_id)
        )
        await db.delete(player)
        await db.commit()

    # Lightweight read helpers used by route orchestration
    @staticmethod
    async def get_session_with_players(
        db: AsyncSession, session_id: uuid.UUID
    ) -> Optional[GameRun]:
        """Load a session with its players eagerly, returning None if not found."""
        result = await db.execute(
            select(GameRun)
            .where(GameRun.id == session_id)
            .options(selectinload(GameRun.players))
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_quest_settings(
        db: AsyncSession, quest_id: uuid.UUID
    ) -> Optional[QuestSettings]:
        """Load quest settings, returning None if not configured."""
        result = await db.execute(
            select(QuestSettings).where(QuestSettings.quest_id == quest_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_session_timing(db: AsyncSession, session_id: uuid.UUID) -> dict:
        """Return started_at / ends_at for a session as ISO strings."""
        result = await db.execute(
            select(GameRun).where(GameRun.id == session_id)
        )
        session = result.scalar_one_or_none()
        return {
            "started_at": session.started_at.isoformat()
            if session and session.started_at
            else None,
            "ends_at": session.ends_at.isoformat()
            if session and session.ends_at
            else None,
        }

    @staticmethod
    async def get_team_players(db: AsyncSession, team_id: uuid.UUID) -> list:
        """Return all RunPlayer rows that belong to a team."""
        result = await db.execute(
            select(RunPlayer).where(RunPlayer.team_id == team_id)
        )
        return list(result.scalars().all())

    @staticmethod
    async def get_next_progress_for_map_object(
        db: AsyncSession,
        session_id: uuid.UUID,
        player_id: uuid.UUID,
        map_object_id: uuid.UUID,
        exclude_progress_id: uuid.UUID,
    ) -> "RunProgress | None":
        """Return the most recently assigned progress on a map object for a
        player, excluding the progress item that was just answered."""
        result = await db.execute(
            select(RunProgress)
            .where(
                RunProgress.session_id == session_id,
                RunProgress.player_id == player_id,
                RunProgress.map_object_id == map_object_id,
                RunProgress.id != exclude_progress_id,
            )
            .order_by(RunProgress.assigned_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()
