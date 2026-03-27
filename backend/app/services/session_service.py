import random
import secrets
import string
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.game_session import GameSession, SessionStatus
from app.models.map import MapObject
from app.models.quest import Quest, QuestSettings
from app.models.resource import Resource
from app.models.session_chat import SessionChat
from app.models.session_player import PlayerStatus, SessionPlayer
from app.models.session_progress import ProgressStatus, SessionProgress
from app.models.user import User
from app.schemas.session import (
    GameInfoResponse,
    GameSessionDetailResponse,
    GameSessionResponse,
    JoinSessionRequest,
    PlayerProgressSummary,
    SessionSettingsPublic,
    ReviewAnswerRequest,
    SessionChatMessage,
    SessionCreate,
    SessionListItem,
    SessionPlayerResponse,
    SessionProgressResponse,
    SubmitAnswerRequest,
    TeacherMonitorResponse,
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
        finished_at=player.finished_at,
        guest_token=player.guest_token,
    )


def _session_response(session: GameSession) -> GameSessionResponse:
    return GameSessionResponse(
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


def _auto_score(question, answer: dict) -> Tuple[Optional[float], bool]:
    """Returns (score, requires_review)."""
    q_type = question.question_type

    if q_type == "single":
        selected_id = str(answer.get("option_id", ""))
        correct = next(
            (
                opt
                for opt in question.options
                if opt.get("is_correct") and str(opt.get("id", "")) == selected_id
            ),
            None,
        )
        return (1.0 if correct else 0.0), False

    elif q_type == "multiple":
        selected_ids = {str(i) for i in answer.get("option_ids", [])}
        correct_ids = {
            str(opt["id"]) for opt in question.options if opt.get("is_correct")
        }
        if not correct_ids:
            return 0.0, False
        if selected_ids == correct_ids:
            return 1.0, False
        correct_selected = len(selected_ids & correct_ids)
        wrong_selected = len(selected_ids - correct_ids)
        score = max(0.0, (correct_selected - wrong_selected) / len(correct_ids))
        return round(score, 2), False

    elif q_type == "short":
        text = answer.get("text", "").strip().lower()
        correct = [str(a).strip().lower() for a in question.correct_answers]
        return (1.0 if text in correct else 0.0), False

    elif q_type == "open":
        return None, True

    return None, False


async def _check_player_completion(
    db: AsyncSession, session_id: uuid.UUID, player: SessionPlayer
) -> None:
    """Mark player FINISHED if all their progress items are answered; then check session completion."""
    remaining_result = await db.execute(
        select(func.count()).where(
            SessionProgress.session_id == session_id,
            SessionProgress.player_id == player.id,
            SessionProgress.status != ProgressStatus.ANSWERED,
        )
    )
    if remaining_result.scalar_one() > 0:
        return

    player.status = PlayerStatus.FINISHED
    player.finished_at = _now()
    await db.flush()

    all_players_result = await db.execute(
        select(SessionPlayer).where(SessionPlayer.session_id == session_id)
    )
    all_players = all_players_result.scalars().all()
    if all(p.status == PlayerStatus.FINISHED for p in all_players):
        session_result = await db.execute(
            select(GameSession)
            .where(GameSession.id == session_id)
            .options(selectinload(GameSession.players))
        )
        await SessionService._complete_session(db, session_result.scalar_one())


async def _advance_queue(
    db: AsyncSession,
    session_id: uuid.UUID,
    player_id: uuid.UUID,
    completed_map_object_id: uuid.UUID,
) -> None:
    """Assign the next queued progress item to the next available map object in sequence."""
    # Get the session's quest map
    session_result = await db.execute(
        select(GameSession)
        .where(GameSession.id == session_id)
        .options(selectinload(GameSession.quest))
    )
    session = session_result.scalar_one_or_none()
    if not session or not session.quest or not session.quest.map_id:
        return

    # Get all interactive map objects ordered
    objects_result = await db.execute(
        select(MapObject)
        .where(
            MapObject.map_id == session.quest.map_id,
            MapObject.is_interactive == True,  # noqa: E712
        )
        .order_by(MapObject.order_index)
    )
    all_objects = list(objects_result.scalars().all())

    # Find all map_object_ids already used by this player
    used_result = await db.execute(
        select(SessionProgress.map_object_id).where(
            SessionProgress.session_id == session_id,
            SessionProgress.player_id == player_id,
            SessionProgress.map_object_id != None,  # noqa: E711
        )
    )
    used_ids = {row[0] for row in used_result.all()}

    # Pick the next object not yet used
    next_obj = next((obj for obj in all_objects if obj.id not in used_ids), None)
    if not next_obj:
        return

    # Assign the next queued progress item to it
    queued_result = await db.execute(
        select(SessionProgress)
        .where(
            SessionProgress.session_id == session_id,
            SessionProgress.player_id == player_id,
            SessionProgress.map_object_id == None,  # noqa: E711
            SessionProgress.status == ProgressStatus.ASSIGNED,
        )
        .order_by(SessionProgress.assigned_at)
        .limit(1)
    )
    queued = queued_result.scalar_one_or_none()
    if queued:
        queued.map_object_id = next_obj.id
    await db.flush()


class SessionService:
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
        return [
            SessionListItem(
                id=s.id,
                quest_id=s.quest_id,
                session_code=s.session_code,
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

        sess_status = (
            SessionStatus.SCHEDULED if data.scheduled_at else SessionStatus.WAITING
        )
        session = GameSession(
            quest_id=data.quest_id,
            teacher_id=teacher_id,
            session_code=code,
            status=sess_status,
            scheduled_at=data.scheduled_at,
            ends_at=data.ends_at,
            max_players=data.max_players,
            allow_solo_in_team=data.allow_solo_in_team,
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
        if session.status not in (SessionStatus.WAITING, SessionStatus.ACTIVE):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Session is not accepting new players",
            )

        active_count = sum(
            1 for p in session.players if p.status != PlayerStatus.FINISHED
        )
        if active_count >= session.max_players:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Session is full"
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

        settings_result = await db.execute(
            select(QuestSettings).where(QuestSettings.quest_id == session.quest_id)
        )
        settings = settings_result.scalar_one_or_none()
        if settings and settings.time_limit_minutes:
            session.ends_at = now + timedelta(minutes=settings.time_limit_minutes)

        for player in session.players:
            player.status = PlayerStatus.PLAYING

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
        """Start a session initiated by a player (instead of the teacher)."""
        if player.session_id != session_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
            )

        session = await _load_session(db, session_id)
        if session.status not in (SessionStatus.WAITING, SessionStatus.SCHEDULED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Session must be WAITING or SCHEDULED to start",
            )

        active_players = [
            p for p in session.players if p.status != PlayerStatus.FINISHED
        ]

        # Team-only mode: require at least 2 players
        if (
            session.max_players > 1
            and not session.allow_solo_in_team
            and len(active_players) < 2
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least 2 players required to start in team mode",
            )

        await SessionService._distribute_resources(db, session)

        now = _now()
        session.status = SessionStatus.ACTIVE
        session.started_at = now

        settings_result = await db.execute(
            select(QuestSettings).where(QuestSettings.quest_id == session.quest_id)
        )
        settings = settings_result.scalar_one_or_none()
        if settings and settings.time_limit_minutes:
            session.ends_at = now + timedelta(minutes=settings.time_limit_minutes)

        for p in session.players:
            p.status = PlayerStatus.PLAYING

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

        players = session.players
        if not players:
            return

        resources = sorted(quest.resources, key=lambda r: r.order_index)
        settings = quest.settings
        random_order = settings.random_order if settings else False

        # Progressive display: each player gets all resources but only the first
        # is assigned to the first map object; the rest are queued (no map_object_id).
        for player in players:
            player_resources = list(resources)
            if random_order:
                random.shuffle(player_resources)
            first_obj = interactive_objects[0] if interactive_objects else None
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
    async def _complete_session(db: AsyncSession, session: GameSession) -> None:
        now = _now()
        session.status = SessionStatus.COMPLETED
        session.ends_at = now
        results_until = now + timedelta(days=30)
        for player in session.players:
            player.results_available_until = results_until
        await db.flush()

    @staticmethod
    async def submit_answer(
        db: AsyncSession,
        progress_id: uuid.UUID,
        player: SessionPlayer,
        data: SubmitAnswerRequest,
    ) -> SessionProgressResponse:
        result = await db.execute(
            select(SessionProgress)
            .where(SessionProgress.id == progress_id)
            .options(
                selectinload(SessionProgress.resource).selectinload(Resource.question)
            )
        )
        progress = result.scalar_one_or_none()
        if not progress:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Progress item not found"
            )
        if progress.player_id != player.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
            )
        if progress.status == ProgressStatus.ANSWERED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Already answered"
            )

        score: Optional[float] = None
        requires_review = False
        if progress.resource and progress.resource.question:
            score, requires_review = _auto_score(
                progress.resource.question, data.answer
            )

        progress.answer = data.answer
        progress.score = score
        progress.requires_review = requires_review
        progress.status = ProgressStatus.ANSWERED
        progress.completed_at = _now()
        await db.flush()

        if progress.map_object_id:
            await _advance_queue(
                db, progress.session_id, player.id, progress.map_object_id
            )

        await _check_player_completion(db, progress.session_id, player)
        await db.commit()
        await db.refresh(progress)
        return SessionProgressResponse.model_validate(progress)

    @staticmethod
    async def mark_text_viewed(
        db: AsyncSession,
        progress_id: uuid.UUID,
        player: SessionPlayer,
    ) -> SessionProgressResponse:
        result = await db.execute(
            select(SessionProgress).where(SessionProgress.id == progress_id)
        )
        progress = result.scalar_one_or_none()
        if not progress:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Progress item not found"
            )
        if progress.player_id != player.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
            )

        progress.status = ProgressStatus.ANSWERED
        progress.completed_at = _now()
        await db.flush()

        if progress.map_object_id:
            await _advance_queue(
                db, progress.session_id, player.id, progress.map_object_id
            )

        await _check_player_completion(db, progress.session_id, player)
        await db.commit()
        await db.refresh(progress)
        return SessionProgressResponse.model_validate(progress)

    @staticmethod
    async def review_answer(
        db: AsyncSession,
        progress_id: uuid.UUID,
        teacher_id: uuid.UUID,
        data: ReviewAnswerRequest,
    ) -> SessionProgressResponse:
        result = await db.execute(
            select(SessionProgress)
            .where(SessionProgress.id == progress_id)
            .options(selectinload(SessionProgress.session))
        )
        progress = result.scalar_one_or_none()
        if not progress:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Progress item not found"
            )
        if progress.session.teacher_id != teacher_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Access denied"
            )
        if not progress.requires_review:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This answer does not require review",
            )

        progress.score = data.score
        progress.requires_review = False
        if not progress.completed_at:
            progress.completed_at = _now()

        await db.commit()
        await db.refresh(progress)
        return SessionProgressResponse.model_validate(progress)

    @staticmethod
    async def get_session_results(
        db: AsyncSession, session_id: uuid.UUID, guest_token: str
    ) -> GameSessionDetailResponse:
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
        if not player.results_available_until:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Results not yet available",
            )
        if player.results_available_until < _now():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Results have expired"
            )

        result = await db.execute(
            select(GameSession)
            .where(GameSession.id == session_id)
            .options(
                selectinload(GameSession.players),
                selectinload(GameSession.progress),
                selectinload(GameSession.chat_messages).selectinload(
                    SessionChat.player
                ),
            )
        )
        session = result.scalar_one()

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
        return GameSessionDetailResponse(
            id=session.id,
            quest_id=session.quest_id,
            session_code=session.session_code,
            status=session.status,
            started_at=session.started_at,
            ends_at=session.ends_at,
            scheduled_at=session.scheduled_at,
            max_players=session.max_players,
            created_at=session.created_at,
            players=[_player_response(p) for p in session.players],
            progress=[
                SessionProgressResponse.model_validate(p) for p in session.progress
            ],
            chat_messages=chat_messages,
        )

    @staticmethod
    async def get_teacher_monitor(
        db: AsyncSession, session_id: uuid.UUID, teacher_id: uuid.UUID
    ) -> TeacherMonitorResponse:
        session = await _load_own_session(db, session_id, teacher_id)

        progress_result = await db.execute(
            select(SessionProgress).where(SessionProgress.session_id == session_id)
        )
        all_progress = list(progress_result.scalars().all())

        players_progress: List[PlayerProgressSummary] = []
        for player in session.players:
            p_items = [p for p in all_progress if p.player_id == player.id]
            total = len(p_items)
            completed = sum(1 for p in p_items if p.status == ProgressStatus.ANSWERED)
            pending_review = sum(
                1 for p in p_items if p.requires_review and p.score is None
            )
            scores = [p.score for p in p_items if p.score is not None]
            avg_score = round(sum(scores) / len(scores), 2) if scores else None
            players_progress.append(
                PlayerProgressSummary(
                    player=_player_response(player),
                    completed=completed,
                    total=total,
                    score=avg_score,
                    pending_review=pending_review,
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

        # Build settings from session + quest (time_limit comes from quest settings)
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
    async def get_progress_resource(
        db: AsyncSession,
        progress_id: uuid.UUID,
        player: SessionPlayer,
    ):
        from app.models.resource import Resource
        from app.schemas.resource import ResourceDetailResponse

        progress_result = await db.execute(
            select(SessionProgress).where(SessionProgress.id == progress_id)
        )
        progress = progress_result.scalar_one_or_none()
        if not progress:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Progress not found"
            )
        if progress.player_id != player.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden"
            )
        if not progress.resource_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No resource for this progress",
            )

        resource_result = await db.execute(
            select(Resource)
            .where(Resource.id == progress.resource_id)
            .options(
                selectinload(Resource.text_content),
                selectinload(Resource.question),
                selectinload(Resource.tags),
            )
        )
        resource = resource_result.scalar_one_or_none()
        if not resource:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found"
            )
        resource.has_content = (
            resource.text_content is not None or resource.question is not None
        )
        return resource

    @staticmethod
    async def get_my_progress(
        db: AsyncSession,
        session_id: uuid.UUID,
        player: SessionPlayer,
    ) -> List[SessionProgressResponse]:
        if player.session_id != session_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden"
            )
        result = await db.execute(
            select(SessionProgress).where(
                SessionProgress.session_id == session_id,
                SessionProgress.player_id == player.id,
                SessionProgress.map_object_id != None,  # noqa: E711
            )
        )
        items = result.scalars().all()
        return [SessionProgressResponse.model_validate(p) for p in items]

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
        await db.delete(player)
        await db.commit()
