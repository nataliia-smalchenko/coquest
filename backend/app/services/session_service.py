import random
import secrets
import string
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import delete as sa_delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.game_session import GameSession, SessionStatus
from app.models.map import MapObject
from app.models.quest import Quest, QuestSettings, QuestTranslation
from app.models.resource import Resource
from app.models.session_chat import SessionChat
from app.models.session_player import PlayerStatus, SessionPlayer
from app.models.session_progress import ProgressStatus, SessionProgress
from app.models.session_team import SessionTeam, TeamStatus
from app.models.user import User
from app.schemas.session import (
    GameInfoResponse,
    GameSessionDetailResponse,
    GameSessionResponse,
    JoinSessionRequest,
    LeaveTeamResponse,
    PlayerProgressSummary,
    SessionSettingsPublic,
    ReviewAnswerRequest,
    RejoinSessionRequest,
    SessionChatMessage,
    SessionCreate,
    SessionListItem,
    SessionPlayerResponse,
    SessionProgressResponse,
    SessionUpdateRequest,
    SubmitAnswerRequest,
    TeacherMonitorResponse,
    TeamPlayerResponse,
    TeamResponse,
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


async def _maybe_expire_session(db: AsyncSession, session: GameSession) -> bool:
    """Auto-stop a session if ends_at has passed. Returns True if the session was expired."""
    if session.status != SessionStatus.ACTIVE or session.ends_at is None:
        return False
    now = _now()
    if session.ends_at >= now:
        return False
    session.status = SessionStatus.STOPPED
    results_until = now + timedelta(days=30)
    for player in session.players:
        if player.status != PlayerStatus.FINISHED:
            player.status = PlayerStatus.FINISHED
            player.finished_at = now
        player.results_available_until = results_until
    await db.flush()
    return True


def _player_response(player: SessionPlayer) -> SessionPlayerResponse:
    return SessionPlayerResponse(
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


def _session_response(session: GameSession) -> GameSessionResponse:
    return GameSessionResponse(
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


async def _load_session(db: AsyncSession, session_id: uuid.UUID) -> GameSession:
    result = await db.execute(
        select(GameSession)
        .where(GameSession.id == session_id)
        .options(selectinload(GameSession.players))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    return session


async def _load_own_session(
    db: AsyncSession, session_id: uuid.UUID, teacher_id: uuid.UUID
) -> GameSession:
    session = await _load_session(db, session_id)
    if session.teacher_id != teacher_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
        )
    return session


class SessionService:
    @staticmethod
    async def get_player_by_token(
        db: AsyncSession, token: str
    ) -> Optional[SessionPlayer]:
        result = await db.execute(
            select(SessionPlayer).where(SessionPlayer.guest_token == token)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def list_sessions(
        db: AsyncSession, teacher_id: uuid.UUID
    ) -> List[SessionListItem]:
        result = await db.execute(
            select(GameSession)
            .where(GameSession.teacher_id == teacher_id)
            .options(selectinload(GameSession.players))
            .order_by(GameSession.created_at.desc())
        )
        sessions = result.scalars().all()
        expired_any = False
        for s in sessions:
            if await _maybe_expire_session(db, s):
                expired_any = True
        if expired_any:
            await db.commit()
        return [
            SessionListItem(
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
        db: AsyncSession, teacher_id: uuid.UUID, data: SessionCreate
    ) -> GameSessionResponse:
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
                select(GameSession.id).where(GameSession.session_code == candidate)
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
        session = GameSession(
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
            select(GameSession)
            .where(GameSession.id == session.id)
            .options(selectinload(GameSession.players))
        )
        return _session_response(result.scalar_one())

    @staticmethod
    async def get_session_by_code(
        db: AsyncSession, session_code: str
    ) -> GameSessionResponse:
        result = await db.execute(
            select(GameSession)
            .where(GameSession.session_code == session_code.upper())
            .options(selectinload(GameSession.players))
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
        data: JoinSessionRequest,
        user_id: Optional[uuid.UUID],
    ) -> SessionPlayerResponse:
        from app.services.team_service import _cleanup_stale_teams, _find_or_create_team

        result = await db.execute(
            select(GameSession)
            .where(GameSession.session_code == data.session_code.upper())
            .options(selectinload(GameSession.players))
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

        player = SessionPlayer(
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
        db: AsyncSession, data: RejoinSessionRequest
    ) -> SessionPlayerResponse:
        """Look up an existing player by token and session code, reassigning their team if needed."""
        from app.services.team_service import (
            _cleanup_stale_teams,
            _find_or_create_team,
        )

        sess_result = await db.execute(
            select(GameSession)
            .where(GameSession.session_code == data.session_code.upper())
            .options(selectinload(GameSession.players))
        )
        session = sess_result.scalar_one_or_none()
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
            )

        player_result = await db.execute(
            select(SessionPlayer).where(
                SessionPlayer.guest_token == data.guest_token,
                SessionPlayer.session_id == session.id,
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
                select(SessionTeam).where(SessionTeam.id == player.team_id)
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
    ) -> GameSessionResponse:
        session = await _load_own_session(db, session_id, teacher_id)
        if session.status not in (SessionStatus.WAITING, SessionStatus.SCHEDULED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Session must be WAITING or SCHEDULED to start",
            )

        await SessionService._distribute_resources(db, session)

        now = _now()
        session.status = SessionStatus.ACTIVE
        session.started_at = now

        for player in session.players:
            if player.status != PlayerStatus.FINISHED:
                player.status = PlayerStatus.PLAYING
                player.started_at = now

        await db.commit()

        result = await db.execute(
            select(GameSession)
            .where(GameSession.id == session.id)
            .options(selectinload(GameSession.players))
        )
        return _session_response(result.scalar_one())

    @staticmethod
    async def player_start_session(
        db: AsyncSession, session_id: uuid.UUID, player: SessionPlayer
    ) -> GameSessionResponse:
        """Solo mode: start this player's quest. Distributes resources only for the requesting player."""
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

        await SessionService._distribute_resources_for_player(db, session, player)

        now = _now()
        if session.status != SessionStatus.ACTIVE:
            session.status = SessionStatus.ACTIVE
            session.started_at = now

        player.started_at = now
        player.status = PlayerStatus.PLAYING
        await db.commit()

        result = await db.execute(
            select(GameSession)
            .where(GameSession.id == session.id)
            .options(selectinload(GameSession.players))
        )
        return _session_response(result.scalar_one())

    @staticmethod
    async def _distribute_resources(db: AsyncSession, session: GameSession) -> None:
        quest_result = await db.execute(
            select(Quest)
            .where(Quest.id == session.quest_id)
            .options(
                selectinload(Quest.settings),
                selectinload(Quest.resources),
            )
        )
        quest = quest_result.scalar_one()

        objects_result = await db.execute(
            select(MapObject)
            .where(
                MapObject.map_id == quest.map_id,
                MapObject.is_interactive == True,  # noqa: E712
            )
            .order_by(MapObject.order_index)
        )
        interactive_objects: List[MapObject] = list(objects_result.scalars().all())

        # Only distribute to players who are waiting (skip those already finished)
        players = [p for p in session.players if p.status != PlayerStatus.FINISHED]
        if not players:
            return

        resources = sorted(quest.resources, key=lambda r: r.order_index)
        settings = quest.settings
        random_order = settings.random_order if settings else False

        for player in players:
            player_resources = list(resources)
            if random_order:
                random.shuffle(player_resources)
            first_obj = (
                random.choice(interactive_objects) if interactive_objects else None
            )
            for i, qr in enumerate(player_resources):
                db.add(
                    SessionProgress(
                        session_id=session.id,
                        player_id=player.id,
                        resource_id=qr.resource_id,
                        map_object_id=first_obj.id if i == 0 and first_obj else None,
                        status=ProgressStatus.ASSIGNED,
                    )
                )

        await db.flush()

    @staticmethod
    async def _distribute_resources_for_player(
        db: AsyncSession, session: GameSession, player: SessionPlayer
    ) -> None:
        """Solo mode: give all quest resources to one player."""
        quest_result = await db.execute(
            select(Quest)
            .where(Quest.id == session.quest_id)
            .options(selectinload(Quest.settings), selectinload(Quest.resources))
        )
        quest = quest_result.scalar_one()

        objects_result = await db.execute(
            select(MapObject)
            .where(
                MapObject.map_id == quest.map_id,
                MapObject.is_interactive == True,  # noqa: E712
            )
            .order_by(MapObject.order_index)
        )
        interactive_objects = list(objects_result.scalars().all())

        resources = sorted(quest.resources, key=lambda r: r.order_index)
        if quest.settings and quest.settings.random_order:
            random.shuffle(resources)

        first_obj = random.choice(interactive_objects) if interactive_objects else None
        for i, qr in enumerate(resources):
            db.add(
                SessionProgress(
                    session_id=session.id,
                    player_id=player.id,
                    resource_id=qr.resource_id,
                    map_object_id=first_obj.id if i == 0 and first_obj else None,
                    status=ProgressStatus.ASSIGNED,
                )
            )
        await db.flush()

    @staticmethod
    async def _distribute_resources_for_team(
        db: AsyncSession, session: GameSession, team: SessionTeam
    ) -> None:
        """Team mode: texts go to ALL players, questions balanced by points among players."""
        quest_result = await db.execute(
            select(Quest)
            .where(Quest.id == session.quest_id)
            .options(selectinload(Quest.settings), selectinload(Quest.resources))
        )
        quest = quest_result.scalar_one()

        objects_result = await db.execute(
            select(MapObject)
            .where(
                MapObject.map_id == quest.map_id,
                MapObject.is_interactive == True,  # noqa: E712
            )
            .order_by(MapObject.order_index)
        )
        interactive_objects = list(objects_result.scalars().all())

        players = list(team.players)
        if not players:
            return

        resources = sorted(quest.resources, key=lambda r: r.order_index)
        if quest.settings and quest.settings.random_order:
            random.shuffle(resources)

        # Load resource types and question points
        resource_ids = [qr.resource_id for qr in resources]
        if not resource_ids:
            return
        res_result = await db.execute(
            select(Resource)
            .where(Resource.id.in_(resource_ids))
            .options(selectinload(Resource.question))
        )
        resource_map: Dict[uuid.UUID, Resource] = {
            r.id: r for r in res_result.scalars().all()
        }

        # Greedy balance: assign questions to players with fewest total points
        player_points: Dict[uuid.UUID, float] = {p.id: 0.0 for p in players}
        question_assignment: Dict[int, uuid.UUID] = {}
        for i, qr in enumerate(resources):
            res = resource_map.get(qr.resource_id)
            if res and res.type == "question":
                points = float(res.question.points if res and res.question else 1)
                min_pid = min(player_points, key=lambda pid: player_points[pid])
                player_points[min_pid] += points
                question_assignment[i] = min_pid

        first_obj = random.choice(interactive_objects) if interactive_objects else None

        for step_order, qr in enumerate(resources):
            res = resource_map.get(qr.resource_id)
            if not res:
                continue
            is_first_step = step_order == 0
            obj_id = first_obj.id if is_first_step and first_obj else None

            if res.type == "text":
                for player in players:
                    db.add(
                        SessionProgress(
                            session_id=session.id,
                            team_id=team.id,
                            player_id=player.id,
                            resource_id=qr.resource_id,
                            step_order=step_order,
                            map_object_id=obj_id,
                            status=ProgressStatus.ASSIGNED,
                        )
                    )
            else:
                assigned_pid = question_assignment.get(step_order)
                if assigned_pid:
                    db.add(
                        SessionProgress(
                            session_id=session.id,
                            team_id=team.id,
                            player_id=assigned_pid,
                            resource_id=qr.resource_id,
                            step_order=step_order,
                            map_object_id=obj_id,
                            status=ProgressStatus.ASSIGNED,
                        )
                    )

        await db.flush()

        if resources:
            res0 = resource_map.get(resources[0].resource_id)
            if res0 and res0.type == "question":
                active_pid = question_assignment.get(0)
                other = [p for p in players if p.id != active_pid]
                hint_pid = random.choice(other).id if other else active_pid
            else:
                hint_pid = random.choice(players).id

            team.hint_player_id = hint_pid
            await db.flush()

    @staticmethod
    async def player_timeout(
        db: AsyncSession, session_id: uuid.UUID, player: SessionPlayer
    ) -> SessionPlayer:
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
            player.results_available_until = now + timedelta(days=30)
            await db.commit()
            await db.refresh(player)
        return player

    @staticmethod
    async def stop_session(
        db: AsyncSession, session_id: uuid.UUID, teacher_id: uuid.UUID
    ) -> GameSessionResponse:
        session = await _load_own_session(db, session_id, teacher_id)
        now = _now()
        session.status = SessionStatus.STOPPED
        session.ends_at = now
        results_until = now + timedelta(days=30)
        for player in session.players:
            if player.status != PlayerStatus.FINISHED:
                player.status = PlayerStatus.FINISHED
                player.finished_at = now
            player.results_available_until = results_until

        await db.commit()

        result = await db.execute(
            select(GameSession)
            .where(GameSession.id == session.id)
            .options(selectinload(GameSession.players))
        )
        return _session_response(result.scalar_one())

    @staticmethod
    async def get_session_results(
        db: AsyncSession, session_id: uuid.UUID, guest_token: str
    ) -> "GameSessionResultResponse":
        from app.schemas.session import (
            GameSessionResultResponse,
            QuestionResultData,
            QuestionResultOption,
            SessionProgressResultResponse,
        )

        player_result = await db.execute(
            select(SessionPlayer).where(
                SessionPlayer.guest_token == guest_token,
                SessionPlayer.session_id == session_id,
            )
        )
        player = player_result.scalar_one_or_none()
        if not player:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Invalid token or session"
            )
        now = _now()
        session_for_check_result = await db.execute(
            select(GameSession).where(GameSession.id == session_id)
        )
        session_for_check = session_for_check_result.scalar_one_or_none()
        time_expired = False
        if session_for_check:
            if (
                session_for_check.ends_at is not None
                and session_for_check.ends_at < now
            ):
                time_expired = True
            if not time_expired and player.started_at:
                settings_res = await db.execute(
                    select(QuestSettings).where(
                        QuestSettings.quest_id == session_for_check.quest_id
                    )
                )
                settings_obj = settings_res.scalar_one_or_none()
                if settings_obj and settings_obj.time_limit_minutes:
                    player_ends_at = player.started_at + timedelta(
                        minutes=settings_obj.time_limit_minutes
                    )
                    if player_ends_at < now:
                        time_expired = True

        if not player.results_available_until and not time_expired:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Results not yet available",
            )
        if (
            player.results_available_until
            and player.results_available_until < now
            and not time_expired
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Results have expired"
            )

        if time_expired and not player.results_available_until:
            player.results_available_until = now + timedelta(days=30)
            await db.flush()

        result = await db.execute(
            select(GameSession)
            .where(GameSession.id == session_id)
            .options(
                selectinload(GameSession.players),
                selectinload(GameSession.progress)
                .selectinload(SessionProgress.resource)
                .selectinload(Resource.question),
                selectinload(GameSession.chat_messages).selectinload(
                    SessionChat.player
                ),
            )
        )
        session = result.scalar_one()
        show_correct = session.show_correct_answers

        chat_messages = [
            SessionChatMessage(
                id=m.id,
                session_id=m.session_id,
                player_id=m.player_id,
                display_name=m.player.display_name,
                message=m.message,
                created_at=m.created_at,
            )
            for m in session.chat_messages
        ]

        enriched_progress: List[SessionProgressResultResponse] = []
        for p in session.progress:
            question_data: Optional[QuestionResultData] = None
            resource_title: Optional[str] = None
            if p.resource and p.resource.question:
                resource_title = p.resource.title
                q = p.resource.question
                options = [
                    QuestionResultOption(
                        id=str(opt.get("id", "")),
                        text=str(opt.get("text", "")),
                        image_url=opt.get("image_url") or None,
                        is_correct=bool(opt.get("is_correct", False))
                        if show_correct
                        else False,
                    )
                    for opt in (q.options or [])
                ]
                correct_answers = (
                    [str(a) for a in (q.correct_answers or [])] if show_correct else []
                )
                question_data = QuestionResultData(
                    body=q.body or "",
                    question_type=q.question_type,
                    options=options,
                    correct_answers=correct_answers,
                    points=q.points if hasattr(q, "points") else 1,
                )
            enriched_progress.append(
                SessionProgressResultResponse(
                    **SessionProgressResponse.model_validate(p).model_dump(),
                    resource_title=resource_title,
                    question=question_data,
                )
            )

        settings_res2 = await db.execute(
            select(QuestSettings).where(QuestSettings.quest_id == session.quest_id)
        )
        quest_settings = settings_res2.scalar_one_or_none()
        result_max_grade = quest_settings.max_grade if quest_settings else None

        seen_resource_ids: set = set()
        total_question_points = 0
        for p in session.progress:
            if (
                p.resource
                and p.resource.question
                and p.resource_id not in seen_resource_ids
            ):
                seen_resource_ids.add(p.resource_id)
                total_question_points += p.resource.question.points

        return GameSessionResultResponse(
            id=session.id,
            quest_id=session.quest_id,
            session_code=session.session_code,
            status=session.status,
            started_at=session.started_at,
            ends_at=session.ends_at,
            scheduled_at=session.scheduled_at,
            max_players=session.max_players,
            allow_solo_in_team=session.allow_solo_in_team,
            show_feedback_after_answer=session.show_feedback_after_answer,
            show_score_after=session.show_score_after,
            show_correct_answers=session.show_correct_answers,
            keep_completed_in_materials=session.keep_completed_in_materials,
            allow_change_answers=session.allow_change_answers,
            created_at=session.created_at,
            players=[_player_response(p) for p in session.players],
            progress=enriched_progress,
            chat_messages=chat_messages,
            max_grade=result_max_grade,
            total_question_points=total_question_points
            if total_question_points > 0
            else None,
        )

    @staticmethod
    async def get_teacher_monitor(
        db: AsyncSession, session_id: uuid.UUID, teacher_id: uuid.UUID
    ) -> TeacherMonitorResponse:
        session = await _load_own_session(db, session_id, teacher_id)
        if await _maybe_expire_session(db, session):
            await db.commit()

        from app.models.question import Question as QuestionModel

        monitor_settings_res = await db.execute(
            select(QuestSettings).where(QuestSettings.quest_id == session.quest_id)
        )
        monitor_quest_settings = monitor_settings_res.scalar_one_or_none()
        monitor_max_grade = (
            monitor_quest_settings.max_grade if monitor_quest_settings else None
        )

        progress_result = await db.execute(
            select(SessionProgress).where(SessionProgress.session_id == session_id)
        )
        all_progress = list(progress_result.scalars().all())

        resource_ids = list({p.resource_id for p in all_progress if p.resource_id})
        points_map: Dict[str, int] = {}
        if resource_ids:
            pts_result = await db.execute(
                select(QuestionModel.resource_id, QuestionModel.points).where(
                    QuestionModel.resource_id.in_(resource_ids)
                )
            )
            points_map = {str(row.resource_id): row.points for row in pts_result}

        monitor_total_q_points = sum(points_map.values()) if points_map else None

        players_progress: List[PlayerProgressSummary] = []
        for player in session.players:
            p_items = [p for p in all_progress if p.player_id == player.id]
            total = len(p_items)
            completed = sum(
                1
                for p in p_items
                if p.status in (ProgressStatus.ANSWERED, ProgressStatus.VIEWED)
            )
            pending_review = sum(
                1 for p in p_items if p.requires_review and p.score is None
            )
            correct = sum(
                1
                for p in p_items
                if p.status == ProgressStatus.ANSWERED
                and p.score is not None
                and p.score >= 1.0
            )
            incorrect = sum(
                1
                for p in p_items
                if p.status == ProgressStatus.ANSWERED
                and p.score is not None
                and p.score < 1.0
                and not (p.requires_review and p.score is None)
            )
            viewed = sum(1 for p in p_items if p.status == ProgressStatus.VIEWED)

            q_items = [
                p for p in p_items if p.resource_id and str(p.resource_id) in points_map
            ]
            max_score_val = (
                sum(points_map[str(p.resource_id)] for p in q_items)
                if q_items
                else None
            )
            total_score_val = (
                round(
                    sum(
                        (p.score or 0) * points_map[str(p.resource_id)]
                        for p in q_items
                        if p.score is not None
                    ),
                    2,
                )
                if q_items
                else None
            )
            avg_score = (
                round(total_score_val / max_score_val, 2)
                if total_score_val is not None and max_score_val
                else None
            )
            grade_val = (
                round(total_score_val / max_score_val * monitor_max_grade, 1)
                if total_score_val is not None and max_score_val and monitor_max_grade
                else None
            )

            players_progress.append(
                PlayerProgressSummary(
                    player=_player_response(player),
                    completed=completed,
                    total=total,
                    score=avg_score,
                    total_score=total_score_val,
                    max_score=max_score_val,
                    grade=grade_val,
                    max_grade=monitor_max_grade,
                    pending_review=pending_review,
                    correct=correct,
                    incorrect=incorrect,
                    viewed=viewed,
                )
            )

        return TeacherMonitorResponse(
            session=_session_response(session),
            players_progress=players_progress,
        )

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
        data: SessionUpdateRequest,
    ) -> GameSessionResponse:
        session = await _load_own_session(db, session_id, teacher_id)
        update = data.model_dump(exclude_unset=True)
        for field, value in update.items():
            setattr(session, field, value)
        await db.commit()
        result = await db.execute(
            select(GameSession)
            .where(GameSession.id == session.id)
            .options(selectinload(GameSession.players))
        )
        return _session_response(result.scalar_one())

    @staticmethod
    async def restart_session(
        db: AsyncSession, session_id: uuid.UUID, teacher_id: uuid.UUID
    ) -> GameSessionResponse:
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
                sa_delete(SessionProgress).where(
                    SessionProgress.player_id.in_(non_finished_ids)
                )
            )

        teams_result = await db.execute(
            select(SessionTeam).where(SessionTeam.session_id == session_id)
        )
        for team in teams_result.scalars().all():
            team.hint_player_id = None
        await db.flush()

        await db.execute(
            sa_delete(SessionTeam).where(SessionTeam.session_id == session_id)
        )
        await db.flush()

        db.expire_all()

        players_result = await db.execute(
            select(SessionPlayer).where(SessionPlayer.session_id == session_id)
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
            select(GameSession)
            .where(GameSession.id == session_id)
            .options(selectinload(GameSession.players))
        )
        return _session_response(result.scalar_one())

    @staticmethod
    async def get_game_info(
        db: AsyncSession,
        session_id: uuid.UUID,
        player: SessionPlayer,
        lang: str = "uk",
    ) -> GameInfoResponse:
        from app.models.quest import Quest, QuestSettings
        from app.models.map import Map

        if player.session_id != session_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden"
            )

        result = await db.execute(
            select(GameSession)
            .where(GameSession.id == session_id)
            .options(
                selectinload(GameSession.quest).selectinload(Quest.translations),
                selectinload(GameSession.quest).selectinload(Quest.settings),
                selectinload(GameSession.quest).selectinload(Quest.map),
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
        settings_obj = SessionSettingsPublic(
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
    ) -> SessionPlayerResponse:
        await _load_own_session(db, session_id, teacher_id)

        player_result = await db.execute(
            select(SessionPlayer).where(
                SessionPlayer.id == player_id,
                SessionPlayer.session_id == session_id,
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
            select(SessionPlayer).where(
                SessionPlayer.id == player_id,
                SessionPlayer.session_id == session_id,
            )
        )
        player = player_result.scalar_one_or_none()
        if not player:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Player not found"
            )

        await db.execute(
            sa_delete(SessionProgress).where(SessionProgress.player_id == player_id)
        )
        await db.execute(
            sa_delete(SessionChat).where(SessionChat.player_id == player_id)
        )
        await db.delete(player)
        await db.commit()
