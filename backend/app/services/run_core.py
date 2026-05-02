"""Core run lifecycle service: CRUD, run state, player management."""

import random
import secrets
import string
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import delete as sa_delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.game_run import GameRun, RunStatus, RunType, TestMode
from app.models.resource_set import (
    ResourceSet,
    ResourceSetSettings,
    ResourceSetTranslation,
)
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


async def _maybe_expire_run(db: AsyncSession, run: GameRun) -> bool:
    """Auto-stop a run if ends_at has passed. Returns True if expired."""
    if run.status != RunStatus.ACTIVE or run.ends_at is None:
        return False
    now = _now()
    if run.ends_at >= now:
        return False

    # Skip if another transaction is already expiring this run.
    lock_result = await db.execute(
        select(GameRun.id)
        .where(GameRun.id == run.id, GameRun.status == RunStatus.ACTIVE)
        .with_for_update(skip_locked=True)
    )
    if lock_result.scalar_one_or_none() is None:
        return False

    run.status = RunStatus.STOPPED
    results_until = now + timedelta(days=settings.RESULTS_AVAILABLE_DAYS)
    for player in run.players:
        if player.status != PlayerStatus.FINISHED:
            player.status = PlayerStatus.FINISHED
            player.finished_at = now
        player.results_available_until = results_until
    await db.flush()
    return True


def _player_response(player: RunPlayer) -> RunPlayerResponse:
    return RunPlayerResponse(
        id=player.id,
        run_id=player.run_id,
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


def _run_response(run: GameRun) -> GameRunResponse:
    return GameRunResponse(
        id=run.id,
        resource_set_id=run.resource_set_id,
        join_code=run.join_code,
        name=run.name,
        status=run.status,
        run_type=run.run_type,
        test_mode=run.test_mode,
        map_id=run.map_id,
        current_step_order=run.current_step_order,
        started_at=run.started_at,
        ends_at=run.ends_at,
        scheduled_at=run.scheduled_at,
        max_players=run.max_players,
        allow_solo_in_team=run.allow_solo_in_team,
        random_teams=run.random_teams,
        show_feedback_after_answer=run.show_feedback_after_answer,
        show_score_after=run.show_score_after,
        show_correct_answers=run.show_correct_answers,
        keep_completed_in_materials=run.keep_completed_in_materials,
        allow_change_answers=run.allow_change_answers,
        created_at=run.created_at,
        players=[_player_response(p) for p in run.players],
    )


async def _load_run(db: AsyncSession, run_id: uuid.UUID) -> GameRun:
    result = await db.execute(
        select(GameRun)
        .where(GameRun.id == run_id)
        .options(selectinload(GameRun.players))
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Run not found"
        )
    return run


async def _load_own_run(
    db: AsyncSession, run_id: uuid.UUID, teacher_id: uuid.UUID
) -> GameRun:
    run = await _load_run(db, run_id)
    if run.teacher_id != teacher_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
        )
    return run


async def _reload_run_response(db: AsyncSession, run_id: uuid.UUID) -> GameRunResponse:
    """Reload a run with players after mutations and return the response schema."""
    result = await db.execute(
        select(GameRun)
        .where(GameRun.id == run_id)
        .options(selectinload(GameRun.players))
    )
    return _run_response(result.scalar_one())


class RunCoreService:
    @staticmethod
    async def get_player_by_token(db: AsyncSession, token: str) -> Optional[RunPlayer]:
        result = await db.execute(
            select(RunPlayer).where(RunPlayer.guest_token == token)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def list_runs(db: AsyncSession, teacher_id: uuid.UUID) -> List[RunListItem]:
        result = await db.execute(
            select(GameRun)
            .where(GameRun.teacher_id == teacher_id)
            .options(selectinload(GameRun.players))
            .order_by(GameRun.created_at.desc())
        )
        runs = result.scalars().all()
        expired_any = False
        for s in runs:
            if await _maybe_expire_run(db, s):
                expired_any = True
        if expired_any:
            await db.commit()
        return [
            RunListItem(
                id=s.id,
                resource_set_id=s.resource_set_id,
                join_code=s.join_code,
                name=s.name,
                status=s.status,
                run_type=s.run_type,
                started_at=s.started_at,
                ends_at=s.ends_at,
                scheduled_at=s.scheduled_at,
                max_players=s.max_players,
                players_count=len(s.players),
                created_at=s.created_at,
            )
            for s in runs
        ]

    @staticmethod
    async def create_run(
        db: AsyncSession, teacher_id: uuid.UUID, data: RunCreate
    ) -> GameRunResponse:
        resource_set_result = await db.execute(
            select(ResourceSet).where(
                ResourceSet.id == data.resource_set_id,
                ResourceSet.teacher_id == teacher_id,
            )
        )
        resource_set = resource_set_result.scalar_one_or_none()
        if not resource_set:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Resource set not found",
            )
        if resource_set.status != "published":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Resource set must be published to create a run",
            )

        # Validate run_type-specific fields
        if data.run_type == "quest" and not data.map_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="map_id is required for quest runs",
            )
        if data.run_type == "test" and not data.test_mode:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="test_mode is required for test runs",
            )

        # Generate unique 6-char join code
        code = ""
        for _ in range(10):
            candidate = "".join(
                random.choices(string.ascii_uppercase + string.digits, k=6)
            )
            exists = await db.execute(
                select(GameRun.id).where(GameRun.join_code == candidate)
            )
            if not exists.scalar_one_or_none():
                code = candidate
                break
        if not code:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not generate a unique join code",
            )

        # Resolve default name from resource set title (prefer "uk", fallback to any)
        run_name = data.name
        if not run_name:
            title_result = await db.execute(
                select(ResourceSetTranslation.title)
                .where(ResourceSetTranslation.resource_set_id == data.resource_set_id)
                .order_by(ResourceSetTranslation.language)
            )
            rows = title_result.scalars().all()
            if rows:
                run_name = rows[0]

        run_status = RunStatus.SCHEDULED if data.scheduled_at else RunStatus.WAITING
        run = GameRun(
            resource_set_id=data.resource_set_id,
            teacher_id=teacher_id,
            join_code=code,
            name=run_name,
            status=run_status,
            run_type=data.run_type,
            test_mode=data.test_mode,
            map_id=data.map_id,
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
        db.add(run)
        await db.commit()
        return await _reload_run_response(db, run.id)

    @staticmethod
    async def get_run_by_code(db: AsyncSession, join_code: str) -> GameRunResponse:
        result = await db.execute(
            select(GameRun)
            .where(GameRun.join_code == join_code.upper())
            .options(selectinload(GameRun.players))
        )
        run = result.scalar_one_or_none()
        if not run:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Run not found"
            )
        return _run_response(run)

    @staticmethod
    async def join_run(
        db: AsyncSession,
        data: JoinRunRequest,
        user_id: Optional[uuid.UUID],
    ) -> RunPlayerResponse:
        from app.services.team_service import _cleanup_stale_teams, _find_or_create_team

        result = await db.execute(
            select(GameRun)
            .where(GameRun.join_code == data.join_code.upper())
            .options(selectinload(GameRun.players))
        )
        run = result.scalar_one_or_none()
        if not run:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Run not found"
            )
        if run.status not in (
            RunStatus.WAITING,
            RunStatus.ACTIVE,
            RunStatus.SCHEDULED,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Run is not accepting new players",
            )

        # Authenticated user: return existing player record if already joined
        if user_id:
            existing = next((p for p in run.players if p.user_id == user_id), None)
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

        used_colors = {p.avatar_color for p in run.players}
        available = [c for c in AVATAR_COLORS if c not in used_colors]
        avatar_color = (
            random.choice(available) if available else random.choice(AVATAR_COLORS)
        )

        player = RunPlayer(
            run_id=run.id,
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
        if run.max_players > 1:
            await _cleanup_stale_teams(db, run)
            team = await _find_or_create_team(db, run)
            player.team_id = team.id

        await db.commit()
        await db.refresh(player)
        return _player_response(player)

    @staticmethod
    async def rejoin_run(db: AsyncSession, data: RejoinRunRequest) -> RunPlayerResponse:
        """Look up an existing player by token and join code, reassigning their team if needed."""
        from app.services.team_service import (
            _cleanup_stale_teams,
            _find_or_create_team,
        )

        run_result = await db.execute(
            select(GameRun)
            .where(GameRun.join_code == data.join_code.upper())
            .options(selectinload(GameRun.players))
        )
        run = run_result.scalar_one_or_none()
        if not run:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Run not found"
            )

        player_result = await db.execute(
            select(RunPlayer).where(
                RunPlayer.guest_token == data.guest_token,
                RunPlayer.run_id == run.id,
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
        if run.max_players > 1:
            await _cleanup_stale_teams(db, run)

        # WAITING player: check if their team has started
        if player.team_id and run.max_players > 1:
            team_result = await db.execute(
                select(RunTeam).where(RunTeam.id == player.team_id)
            )
            team = team_result.scalar_one_or_none()
            if team is None or team.status != TeamStatus.WAITING:
                # Team was deleted by cleanup or already started → reassign
                player.team_id = None
                await db.flush()
                new_team = await _find_or_create_team(db, run)
                player.team_id = new_team.id
                await db.flush()
        elif not player.team_id and run.max_players > 1:
            new_team = await _find_or_create_team(db, run)
            player.team_id = new_team.id
            await db.flush()

        await db.commit()
        await db.refresh(player)
        return _player_response(player)

    @staticmethod
    async def start_run(
        db: AsyncSession, run_id: uuid.UUID, teacher_id: uuid.UUID
    ) -> GameRunResponse:
        from app.services.run_distribution import RunDistributionService

        run = await _load_own_run(db, run_id, teacher_id)
        if run.status not in (RunStatus.WAITING, RunStatus.SCHEDULED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Run must be WAITING or SCHEDULED to start",
            )

        await RunDistributionService._distribute_resources(db, run)

        # For teacher-managed tests, start at step 0 so only the first question is visible
        if run.run_type == RunType.TEST and run.test_mode == TestMode.TEACHER_MANAGED:
            run.current_step_order = 0

        now = _now()
        run.status = RunStatus.ACTIVE
        run.started_at = now

        for player in run.players:
            if player.status != PlayerStatus.FINISHED:
                player.status = PlayerStatus.PLAYING
                player.started_at = now

        await db.commit()
        return await _reload_run_response(db, run.id)

    @staticmethod
    async def player_start_run(
        db: AsyncSession, run_id: uuid.UUID, player: RunPlayer
    ) -> GameRunResponse:
        """Solo mode: start this player's quest. Distributes resources only for the requesting player."""
        from app.services.run_distribution import RunDistributionService

        if player.run_id != run_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
            )

        run = await _load_run(db, run_id)
        if run.status not in (
            RunStatus.WAITING,
            RunStatus.SCHEDULED,
            RunStatus.ACTIVE,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Run is not active",
            )

        await RunDistributionService._distribute_resources_for_player(db, run, player)

        now = _now()
        if run.status != RunStatus.ACTIVE:
            run.status = RunStatus.ACTIVE
            run.started_at = now

        player.started_at = now
        player.status = PlayerStatus.PLAYING
        await db.commit()
        return await _reload_run_response(db, run.id)

    @staticmethod
    async def player_timeout(
        db: AsyncSession, run_id: uuid.UUID, player: RunPlayer
    ) -> RunPlayer:
        """Mark a player FINISHED due to time limit expiry.

        Idempotent — safe to call even if the player is already FINISHED.
        Does NOT touch the run status.
        """
        if player.run_id != run_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Player does not belong to this run",
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
    async def stop_run(
        db: AsyncSession, run_id: uuid.UUID, teacher_id: uuid.UUID
    ) -> GameRunResponse:
        run = await _load_own_run(db, run_id, teacher_id)
        now = _now()
        run.status = RunStatus.STOPPED
        run.ends_at = now
        results_until = now + timedelta(days=settings.RESULTS_AVAILABLE_DAYS)
        for player in run.players:
            if player.status != PlayerStatus.FINISHED:
                player.status = PlayerStatus.FINISHED
                player.finished_at = now
            player.results_available_until = results_until

        await db.commit()
        return await _reload_run_response(db, run.id)

    @staticmethod
    async def delete_run(
        db: AsyncSession, run_id: uuid.UUID, teacher_id: uuid.UUID
    ) -> None:
        run = await _load_own_run(db, run_id, teacher_id)
        if run.status == RunStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete active run. Stop it first.",
            )
        await db.delete(run)
        await db.commit()

    @staticmethod
    async def update_run_settings(
        db: AsyncSession,
        run_id: uuid.UUID,
        teacher_id: uuid.UUID,
        data: RunUpdateRequest,
    ) -> GameRunResponse:
        run = await _load_own_run(db, run_id, teacher_id)
        update = data.model_dump(exclude_unset=True)
        for field, value in update.items():
            setattr(run, field, value)
        await db.commit()
        return await _reload_run_response(db, run.id)

    @staticmethod
    async def restart_run(
        db: AsyncSession, run_id: uuid.UUID, teacher_id: uuid.UUID
    ) -> GameRunResponse:
        run = await _load_own_run(db, run_id, teacher_id)
        if run.status not in (RunStatus.STOPPED, RunStatus.COMPLETED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only stopped or completed runs can be restarted",
            )

        non_finished_ids = [
            p.id for p in run.players if p.status != PlayerStatus.FINISHED
        ]

        if non_finished_ids:
            await db.execute(
                sa_delete(RunProgress).where(
                    RunProgress.player_id.in_(non_finished_ids)
                )
            )

        teams_result = await db.execute(select(RunTeam).where(RunTeam.run_id == run_id))
        for team in teams_result.scalars().all():
            team.hint_player_id = None
        await db.flush()

        await db.execute(sa_delete(RunTeam).where(RunTeam.run_id == run_id))
        await db.flush()

        db.expire_all()

        players_result = await db.execute(
            select(RunPlayer).where(RunPlayer.run_id == run_id)
        )
        players = players_result.scalars().all()

        for player in players:
            player.team_id = None
            if player.status != PlayerStatus.FINISHED:
                player.status = PlayerStatus.WAITING
                player.started_at = None
                player.finished_at = None

        run.status = RunStatus.WAITING
        run.started_at = None
        run.ends_at = None

        await db.commit()
        return await _reload_run_response(db, run_id)

    @staticmethod
    async def get_game_info(
        db: AsyncSession,
        run_id: uuid.UUID,
        player: RunPlayer,
        lang: str = "uk",
    ) -> GameInfoResponse:
        from app.models.map import Map  # noqa: F401

        if player.run_id != run_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden"
            )

        result = await db.execute(
            select(GameRun)
            .where(GameRun.id == run_id)
            .options(
                selectinload(GameRun.resource_set).selectinload(
                    ResourceSet.translations
                ),
                selectinload(GameRun.resource_set).selectinload(ResourceSet.settings),
                selectinload(GameRun.map),
            )
        )
        run = result.scalar_one_or_none()
        if not run or not run.resource_set:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Run or resource set not found",
            )

        rs = run.resource_set
        title = next(
            (t.title for t in rs.translations if t.language == lang), None
        ) or next((t.title for t in rs.translations), "Resource Set")
        map_slug = run.map.slug if run.map else None

        rs_settings = rs.settings
        settings_obj = RunSettingsPublic(
            time_limit_minutes=rs_settings.time_limit_minutes if rs_settings else None,
            keep_completed_in_materials=run.keep_completed_in_materials,
            show_feedback_after_answer=run.show_feedback_after_answer,
            show_score_after=run.show_score_after,
            show_correct_answers=run.show_correct_answers,
            allow_change_answers=run.allow_change_answers,
        )
        return GameInfoResponse(
            resource_set_title=title,
            map_slug=map_slug,
            settings=settings_obj,
            run_type=run.run_type,
            test_mode=run.test_mode,
        )

    @staticmethod
    async def update_player_guest_name(
        db: AsyncSession,
        run_id: uuid.UUID,
        player_id: uuid.UUID,
        teacher_id: uuid.UUID,
        new_guest_name: Optional[str],
    ) -> RunPlayerResponse:
        await _load_own_run(db, run_id, teacher_id)

        player_result = await db.execute(
            select(RunPlayer).where(
                RunPlayer.id == player_id,
                RunPlayer.run_id == run_id,
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
            user = await db.get(User, player.user_id)
            player.guest_name = None
            player.display_name = user.full_name if user else player.display_name

        await db.commit()
        await db.refresh(player)
        return _player_response(player)

    @staticmethod
    async def delete_player(
        db: AsyncSession,
        run_id: uuid.UUID,
        player_id: uuid.UUID,
        teacher_id: uuid.UUID,
    ) -> None:
        await _load_own_run(db, run_id, teacher_id)
        player_result = await db.execute(
            select(RunPlayer).where(
                RunPlayer.id == player_id,
                RunPlayer.run_id == run_id,
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
        await db.execute(sa_delete(RunChat).where(RunChat.player_id == player_id))
        await db.delete(player)
        await db.commit()

    # Lightweight read helpers used by route orchestration
    @staticmethod
    async def get_run_with_players(
        db: AsyncSession, run_id: uuid.UUID
    ) -> Optional[GameRun]:
        """Load a run with its players eagerly, returning None if not found."""
        result = await db.execute(
            select(GameRun)
            .where(GameRun.id == run_id)
            .options(selectinload(GameRun.players))
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_resource_set_settings(
        db: AsyncSession, resource_set_id: uuid.UUID
    ) -> Optional[ResourceSetSettings]:
        """Load resource set settings, returning None if not configured."""
        result = await db.execute(
            select(ResourceSetSettings).where(
                ResourceSetSettings.resource_set_id == resource_set_id
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_run_timing(db: AsyncSession, run_id: uuid.UUID) -> dict:
        """Return started_at / ends_at for a run as ISO strings."""
        result = await db.execute(select(GameRun).where(GameRun.id == run_id))
        run = result.scalar_one_or_none()
        return {
            "started_at": run.started_at.isoformat()
            if run and run.started_at
            else None,
            "ends_at": run.ends_at.isoformat() if run and run.ends_at else None,
        }

    @staticmethod
    async def get_team_players(db: AsyncSession, team_id: uuid.UUID) -> list:
        """Return all RunPlayer rows that belong to a team."""
        result = await db.execute(select(RunPlayer).where(RunPlayer.team_id == team_id))
        return list(result.scalars().all())

    @staticmethod
    async def get_next_progress_for_map_object(
        db: AsyncSession,
        run_id: uuid.UUID,
        player_id: uuid.UUID,
        map_object_id: uuid.UUID,
        exclude_progress_id: uuid.UUID,
    ) -> "RunProgress | None":
        """Return the most recently assigned progress on a map object for a
        player, excluding the progress item that was just answered."""
        result = await db.execute(
            select(RunProgress)
            .where(
                RunProgress.run_id == run_id,
                RunProgress.player_id == player_id,
                RunProgress.map_object_id == map_object_id,
                RunProgress.id != exclude_progress_id,
            )
            .order_by(RunProgress.assigned_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()
