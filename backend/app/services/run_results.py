"""Results service: session results for players and teacher monitor."""

import uuid
from collections import defaultdict
from datetime import timedelta
from typing import Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.game_run import GameRun
from app.models.quest import QuestSettings
from app.models.resource import Resource
from app.models.run_chat import RunChat
from app.models.run_player import RunPlayer
from app.models.run_progress import ProgressStatus, RunProgress
from app.config import settings
from app.schemas.run import (
    GameRunResultResponse,
    PlayerProgressSummary,
    QuestionResultData,
    QuestionResultOption,
    RunChatMessage,
    RunProgressResponse,
    RunProgressResultResponse,
    TeacherMonitorResponse,
)
from app.services.run_core import (
    _load_own_session,
    _maybe_expire_session,
    _now,
    _player_response,
    _session_response,
)


class RunResultsService:
    @staticmethod
    async def get_session_results(
        db: AsyncSession, session_id: uuid.UUID, guest_token: str
    ) -> GameRunResultResponse:
        player_result = await db.execute(
            select(RunPlayer).where(
                RunPlayer.guest_token == guest_token,
                RunPlayer.session_id == session_id,
            )
        )
        player = player_result.scalar_one_or_none()
        if not player:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Invalid token or session"
            )
        now = _now()
        session_for_check = await db.get(GameRun, session_id)
        time_expired = bool(
            session_for_check
            and session_for_check.ends_at is not None
            and session_for_check.ends_at < now
        )
        if not time_expired and session_for_check and player.started_at:
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
            player.results_available_until = now + timedelta(
                days=settings.RESULTS_AVAILABLE_DAYS
            )
            await db.flush()

        result = await db.execute(
            select(GameRun)
            .where(GameRun.id == session_id)
            .options(
                selectinload(GameRun.players),
                selectinload(GameRun.progress)
                .selectinload(RunProgress.resource)
                .selectinload(Resource.question),
                selectinload(GameRun.chat_messages).selectinload(RunChat.player),
            )
        )
        session = result.scalar_one()
        show_correct = session.show_correct_answers

        chat_messages = [
            RunChatMessage(
                id=m.id,
                session_id=m.session_id,
                player_id=m.player_id,
                display_name=m.player.display_name,
                message=m.message,
                created_at=m.created_at,
            )
            for m in session.chat_messages
        ]

        enriched_progress: List[RunProgressResultResponse] = []
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
                RunProgressResultResponse(
                    **RunProgressResponse.model_validate(p).model_dump(),
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

        return GameRunResultResponse(
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
            select(RunProgress).where(RunProgress.session_id == session_id)
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

        progress_by_player: Dict = defaultdict(list)
        for p in all_progress:
            progress_by_player[p.player_id].append(p)

        players_progress: List[PlayerProgressSummary] = []
        for player in session.players:
            p_items = progress_by_player[player.id]
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
