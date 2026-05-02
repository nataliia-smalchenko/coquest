import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models.game_run import GameRun
from app.models.map import MapObject
from app.models.run_player import PlayerStatus, RunPlayer
from app.models.run_progress import ProgressStatus, RunProgress
from app.models.run_team import RunTeam, TeamStatus
from app.schemas.run import (
    ReviewAnswerRequest,
    RunProgressResponse,
    SubmitAnswerRequest,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


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
    db: AsyncSession, run_id: uuid.UUID, player: RunPlayer
) -> None:
    """Mark player FINISHED if all their progress items are answered.

    The run itself stays ACTIVE until the teacher explicitly stops it —
    multiple teams/players can be playing concurrently in the same run.
    """
    remaining_result = await db.execute(
        select(func.count()).where(
            RunProgress.run_id == run_id,
            RunProgress.player_id == player.id,
            RunProgress.status == ProgressStatus.ASSIGNED,
        )
    )
    if remaining_result.scalar_one() > 0:
        return

    player.status = PlayerStatus.FINISHED
    player.finished_at = _now()
    player.results_available_until = _now() + timedelta(
        days=settings.RESULTS_AVAILABLE_DAYS
    )
    await db.flush()

    if player.team_id is not None:
        # Team mode: mark team COMPLETED when all members finish
        team_players_result = await db.execute(
            select(RunPlayer).where(
                RunPlayer.team_id == player.team_id,
                RunPlayer.run_id == run_id,
            )
        )
        team_players = team_players_result.scalars().all()
        if all(p.status == PlayerStatus.FINISHED for p in team_players):
            team_result = await db.execute(
                select(RunTeam).where(RunTeam.id == player.team_id)
            )
            team = team_result.scalar_one_or_none()
            if team:
                team.status = TeamStatus.COMPLETED
            await db.flush()


async def _advance_queue(
    db: AsyncSession,
    run_id: uuid.UUID,
    player_id: uuid.UUID,
    completed_map_object_id: uuid.UUID,
) -> None:
    """Assign the next queued progress item to the next available map object in sequence."""
    map_id_result = await db.execute(select(GameRun.map_id).where(GameRun.id == run_id))
    map_id = map_id_result.scalar_one_or_none()
    if not map_id:
        return

    objects_result = await db.execute(
        select(MapObject)
        .where(
            MapObject.map_id == map_id,
            MapObject.is_interactive == True,  # noqa: E712
        )
        .order_by(MapObject.order_index)
    )
    all_objects = list(objects_result.scalars().all())

    # Find all map_object_ids already used by this player
    used_result = await db.execute(
        select(RunProgress.map_object_id).where(
            RunProgress.run_id == run_id,
            RunProgress.player_id == player_id,
            RunProgress.map_object_id != None,  # noqa: E711
        )
    )
    used_ids = {row[0] for row in used_result.all()}

    # Pick a random object not yet used; wrap around if all objects are exhausted
    available_objs = [
        obj for obj in all_objects if obj.id not in used_ids
    ] or all_objects
    if not available_objs:
        return
    next_obj = random.choice(available_objs)

    # Assign the next queued progress item to it
    queued_result = await db.execute(
        select(RunProgress)
        .where(
            RunProgress.run_id == run_id,
            RunProgress.player_id == player_id,
            RunProgress.map_object_id == None,  # noqa: E711
            RunProgress.status == ProgressStatus.ASSIGNED,
        )
        .order_by(RunProgress.assigned_at)
        .limit(1)
    )
    queued = queued_result.scalar_one_or_none()
    if queued:
        queued.map_object_id = next_obj.id
    await db.flush()


async def _advance_team_step(
    db: AsyncSession,
    run_id: uuid.UUID,
    team_id: uuid.UUID,
    completed_by_player_id: uuid.UUID,
) -> Optional[Dict]:
    """Advance the team to its next queued step.

    Returns a dict with WS broadcast data, or None if no more steps.
    """
    from app.models.resource import Resource

    # Find the minimum step_order among queued (no map_object_id) ASSIGNED records
    min_order_result = await db.execute(
        select(func.min(RunProgress.step_order)).where(
            RunProgress.run_id == run_id,
            RunProgress.team_id == team_id,
            RunProgress.map_object_id == None,  # noqa: E711
            RunProgress.status == ProgressStatus.ASSIGNED,
        )
    )
    min_step_order = min_order_result.scalar_one_or_none()
    if min_step_order is None:
        return None  # no more steps

    # Get all records for that step
    step_result = await db.execute(
        select(RunProgress).where(
            RunProgress.run_id == run_id,
            RunProgress.team_id == team_id,
            RunProgress.step_order == min_step_order,
            RunProgress.status == ProgressStatus.ASSIGNED,
            RunProgress.map_object_id == None,  # noqa: E711
        )
    )
    step_records = list(step_result.scalars().all())
    if not step_records:
        return None

    # Load resource type
    resource_id = step_records[0].resource_id
    resource = await db.get(Resource, resource_id)
    resource_type = resource.type if resource else "question"

    map_id_result = await db.execute(select(GameRun.map_id).where(GameRun.id == run_id))
    map_id = map_id_result.scalar_one_or_none()
    if not map_id:
        return None

    used_result = await db.execute(
        select(RunProgress.map_object_id)
        .where(
            RunProgress.team_id == team_id,
            RunProgress.run_id == run_id,
            RunProgress.map_object_id != None,  # noqa: E711
        )
        .distinct()
    )
    used_ids = {row[0] for row in used_result.all()}

    objects_result = await db.execute(
        select(MapObject)
        .where(
            MapObject.map_id == map_id,
            MapObject.is_interactive == True,  # noqa: E712
        )
        .order_by(MapObject.order_index)
    )
    all_objs = list(objects_result.scalars().all())
    available = [o for o in all_objs if o.id not in used_ids] or all_objs
    if not available:
        return None
    next_obj = random.choice(available)

    # Activate the next step records
    for rec in step_records:
        rec.map_object_id = next_obj.id

    # Update team hint player to whoever just completed the previous step
    team_result = await db.execute(select(RunTeam).where(RunTeam.id == team_id))
    team_obj = team_result.scalar_one_or_none()
    if team_obj:
        team_obj.hint_player_id = completed_by_player_id

    await db.flush()

    active_player_id: Optional[str] = None
    if resource_type == "text":
        active_player_id = None  # all players are active
    else:
        active_player_id = str(step_records[0].player_id)

    return {
        "resource_type": resource_type.value
        if hasattr(resource_type, "value")
        else resource_type,
        "active_player_id": active_player_id,
        "hint_player_id": str(completed_by_player_id),
        "map_object_id": str(next_obj.id),
        "progress_updates": [
            {
                "player_id": str(r.player_id),
                "progress_id": str(r.id),
                "map_object_id": str(next_obj.id),
                "step_order": r.step_order,
            }
            for r in step_records
        ],
    }


class ProgressService:
    @staticmethod
    async def get_player_visible_progress(
        db: AsyncSession, run_id: uuid.UUID, player_id: uuid.UUID
    ) -> List[RunProgress]:
        result = await db.execute(
            select(RunProgress).where(
                RunProgress.run_id == run_id,
                RunProgress.player_id == player_id,
                RunProgress.map_object_id != None,  # noqa: E711
            )
        )
        return list(result.scalars().all())

    @staticmethod
    async def submit_answer(
        db: AsyncSession,
        progress_id: uuid.UUID,
        player: RunPlayer,
        data: SubmitAnswerRequest,
    ) -> Tuple[RunProgressResponse, Optional[Dict]]:
        from app.models.resource import Resource

        result = await db.execute(
            select(RunProgress)
            .where(RunProgress.id == progress_id)
            .options(selectinload(RunProgress.resource).selectinload(Resource.question))
            .with_for_update()
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
        # Team mode: only allow answering an activated (has map_object_id) item
        if player.team_id and progress.map_object_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This resource is not yet active",
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

        team_step_info: Optional[Dict] = None
        if player.team_id and progress.map_object_id:
            team_step_info = await _advance_team_step(
                db, progress.run_id, player.team_id, player.id
            )
        elif not player.team_id and progress.map_object_id:
            await _advance_queue(db, progress.run_id, player.id, progress.map_object_id)

        await _check_player_completion(db, progress.run_id, player)
        await db.commit()
        await db.refresh(progress)
        return RunProgressResponse.model_validate(progress), team_step_info

    @staticmethod
    async def mark_text_viewed(
        db: AsyncSession,
        progress_id: uuid.UUID,
        player: RunPlayer,
    ) -> Tuple[RunProgressResponse, Optional[Dict], Optional[List[str]]]:
        """Returns (progress, team_step_info | None, viewers_list | None).

        viewers_list is set in team mode: list of player_ids who have viewed this step so far.
        team_step_info is set when the team is ready to advance to the next step.
        """
        result = await db.execute(
            select(RunProgress).where(RunProgress.id == progress_id)
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
        # Team mode: only allow viewing an activated item
        if player.team_id and progress.map_object_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This resource is not yet active",
            )

        progress.status = ProgressStatus.VIEWED
        progress.completed_at = _now()
        await db.flush()

        team_step_info: Optional[Dict] = None
        viewers: Optional[List[str]] = None

        if player.team_id and progress.map_object_id:
            # Serialize concurrent "all viewed?" checks via RunTeam row lock.
            team_lock_result = await db.execute(
                select(RunTeam)
                .where(RunTeam.id == player.team_id)
                .options(selectinload(RunTeam.players))
                .with_for_update()
            )
            locked_team = team_lock_result.scalar_one_or_none()
            if locked_team is None:
                return RunProgressResponse.model_validate(progress), None, None

            total_in_team = len(locked_team.players)

            viewed_result = await db.execute(
                select(RunProgress).where(
                    RunProgress.team_id == player.team_id,
                    RunProgress.run_id == progress.run_id,
                    RunProgress.step_order == progress.step_order,
                    RunProgress.status.in_(
                        [ProgressStatus.VIEWED, ProgressStatus.ANSWERED]
                    ),
                )
            )
            viewed_records = list(viewed_result.scalars().all())
            viewers = [str(r.player_id) for r in viewed_records]
            all_viewed = len(viewed_records) >= total_in_team

            if all_viewed:
                team_step_info = await _advance_team_step(
                    db, progress.run_id, player.team_id, player.id
                )
        elif not player.team_id and progress.map_object_id:
            await _advance_queue(db, progress.run_id, player.id, progress.map_object_id)

        await _check_player_completion(db, progress.run_id, player)
        await db.commit()
        await db.refresh(progress)
        return RunProgressResponse.model_validate(progress), team_step_info, viewers

    @staticmethod
    async def review_answer(
        db: AsyncSession,
        progress_id: uuid.UUID,
        teacher_id: uuid.UUID,
        data: ReviewAnswerRequest,
    ) -> RunProgressResponse:
        result = await db.execute(
            select(RunProgress)
            .where(RunProgress.id == progress_id)
            .options(selectinload(RunProgress.run))
        )
        progress = result.scalar_one_or_none()
        if not progress:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Progress item not found"
            )
        if progress.run.teacher_id != teacher_id:
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
        return RunProgressResponse.model_validate(progress)

    @staticmethod
    async def get_player_progress_detail(
        db: AsyncSession,
        run_id: uuid.UUID,
        player_id: uuid.UUID,
        teacher_id: uuid.UUID,
    ) -> List:
        """Teacher-facing detailed progress for one player — always includes correct answers."""
        from app.models.resource import Resource
        from app.schemas.run import (
            QuestionResultData,
            QuestionResultOption,
            RunProgressResultResponse,
        )
        from app.services.run_service import _load_own_run

        await _load_own_run(db, run_id, teacher_id)

        result = await db.execute(
            select(RunProgress)
            .where(
                RunProgress.run_id == run_id,
                RunProgress.player_id == player_id,
            )
            .options(selectinload(RunProgress.resource).selectinload(Resource.question))
            .order_by(RunProgress.assigned_at)
        )
        items = result.scalars().all()

        enriched = []
        for p in items:
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
                        is_correct=bool(opt.get("is_correct", False)),
                    )
                    for opt in (q.options or [])
                ]
                question_data = QuestionResultData(
                    body=q.body or "",
                    question_type=q.question_type,
                    options=options,
                    correct_answers=[str(a) for a in (q.correct_answers or [])],
                    points=q.points if hasattr(q, "points") else 1,
                )
            elif p.resource:
                resource_title = p.resource.title
            enriched.append(
                RunProgressResultResponse(
                    **RunProgressResponse.model_validate(p).model_dump(),
                    resource_title=resource_title,
                    question=question_data,
                )
            )
        return enriched

    @staticmethod
    async def get_my_progress(
        db: AsyncSession,
        run_id: uuid.UUID,
        player: RunPlayer,
    ) -> List[RunProgressResponse]:
        if player.run_id != run_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden"
            )
        result = await db.execute(
            select(RunProgress)
            .where(
                RunProgress.run_id == run_id,
                RunProgress.player_id == player.id,
            )
            .order_by(RunProgress.step_order, RunProgress.assigned_at)
        )
        items = result.scalars().all()
        return [RunProgressResponse.model_validate(p) for p in items]

    @staticmethod
    async def get_team_progress(
        db: AsyncSession,
        run_id: uuid.UUID,
        player: RunPlayer,
    ) -> List[RunProgressResponse]:
        """Return teammates' completed progress items (team mode, for materials panel)."""
        if player.run_id != run_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden"
            )
        if not player.team_id:
            return []
        result = await db.execute(
            select(RunProgress)
            .where(
                RunProgress.run_id == run_id,
                RunProgress.team_id == player.team_id,
                RunProgress.player_id != player.id,
                RunProgress.status.in_(
                    [ProgressStatus.ANSWERED, ProgressStatus.VIEWED]
                ),
                RunProgress.map_object_id != None,  # noqa: E711
            )
            .order_by(RunProgress.step_order, RunProgress.assigned_at)
        )
        items = result.scalars().all()
        return [RunProgressResponse.model_validate(p) for p in items]

    @staticmethod
    async def get_progress_resource(
        db: AsyncSession,
        progress_id: uuid.UUID,
        player: RunPlayer,
    ):
        from app.models.resource import Resource

        progress_result = await db.execute(
            select(RunProgress).where(RunProgress.id == progress_id)
        )
        progress = progress_result.scalar_one_or_none()
        if not progress:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Progress not found"
            )
        if progress.player_id != player.id:
            # Allow team members to view each other's completed progress
            if not player.team_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden"
                )
            teammate_result = await db.execute(
                select(RunPlayer).where(
                    RunPlayer.id == progress.player_id,
                    RunPlayer.team_id == player.team_id,
                )
            )
            if not teammate_result.scalar_one_or_none():
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
