import uuid
from datetime import datetime

import structlog
from pydantic import ValidationError
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.game_run import GameRun, RunStatus
from app.models.run_chat import RunChat
from app.models.run_player import PlayerStatus, RunPlayer
from app.models.run_progress import ProgressStatus, RunProgress
from app.models.run_team import RunTeam, TeamStatus
from app.schemas.run import ReviewAnswerRequest, SubmitAnswerRequest
from app.schemas.websocket import (
    ChatMessage,
    MarkViewedMessage,
    ReviewAnswerMessage,
    StartRunMessage,
    StopRunMessage,
    SubmitAnswerMessage,
    player_message_adapter,
    teacher_message_adapter,
)
from app.services import run_service as svc
from app.services.websocket_manager import manager

log = structlog.get_logger(__name__)


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _progress_dict(p: RunProgress) -> dict:
    return {
        "id": str(p.id),
        "run_id": str(p.run_id),
        "player_id": str(p.player_id),
        "resource_id": str(p.resource_id) if p.resource_id else None,
        "map_object_id": str(p.map_object_id) if p.map_object_id else None,
        "status": p.status.value if hasattr(p.status, "value") else p.status,
        "score": p.score,
        "answer": p.answer,
        "requires_review": p.requires_review,
        "assigned_at": _iso(p.assigned_at),
        "completed_at": _iso(p.completed_at),
    }


# player messages
async def handle_player_message(run_id: str, player_id: str, data: dict) -> None:
    try:
        msg = player_message_adapter.validate_python(data)
    except ValidationError as exc:
        log.warning(
            "invalid_player_ws_message",
            run_id=run_id,
            player_id=player_id,
            error=str(exc),
        )
        await manager.send_to_player(
            run_id, player_id, {"type": "error", "detail": "Invalid message format"}
        )
        return

    try:
        if isinstance(msg, SubmitAnswerMessage):
            await _handle_submit_answer(run_id, player_id, msg)
        elif isinstance(msg, MarkViewedMessage):
            await _handle_mark_viewed(run_id, player_id, msg)
        elif isinstance(msg, ChatMessage):
            await _handle_chat_message(run_id, player_id, msg)
    except Exception as exc:
        log.exception(
            "player_message_handler_error",
            run_id=run_id,
            player_id=player_id,
            msg_type=msg.type,
        )
        await manager.send_to_player(
            run_id, player_id, {"type": "error", "detail": str(exc)}
        )


async def _handle_submit_answer(
    run_id: str, player_id: str, msg: SubmitAnswerMessage
) -> None:
    progress_id = msg.progress_id
    # msg.answer is a typed Pydantic model; model_dump() gives the plain dict
    # that the service layer expects and stores directly in JSONB.
    request = SubmitAnswerRequest(answer=msg.answer.model_dump())

    async with AsyncSessionLocal() as db:
        # Load player
        player_result = await db.execute(
            select(RunPlayer).where(RunPlayer.id == uuid.UUID(player_id))
        )
        player = player_result.scalar_one_or_none()
        if not player:
            return

        result, team_step_info = await svc.RunService.submit_answer(
            db, progress_id, player, request
        )

        # Determine correct flag for non-open questions
        correct: bool | None = None
        if result.score is not None:
            correct = result.score >= 1.0

        await manager.send_to_player(
            run_id,
            player_id,
            {
                "type": "answer_result",
                "progress": _progress_dict(await db.get(RunProgress, progress_id)),
                "correct": correct,
                "score": result.score,
            },
        )

        if player.team_id and team_step_info:
            team_players_result = await db.execute(
                select(RunPlayer).where(RunPlayer.team_id == player.team_id)
            )
            team_players = team_players_result.scalars().all()
            step_event = {
                "type": "team_step_advanced",
                **team_step_info,
                "completed_by_progress": result.model_dump(mode="json"),
            }
            for tp in team_players:
                await manager.send_to_player(run_id, str(tp.id), step_event)

        # Check if a new resource was assigned to the same map_object (solo only)
        if not player.team_id and result.map_object_id:
            new_p_result = await db.execute(
                select(RunProgress)
                .where(
                    RunProgress.run_id == uuid.UUID(run_id),
                    RunProgress.player_id == uuid.UUID(player_id),
                    RunProgress.map_object_id == result.map_object_id,
                    RunProgress.status == ProgressStatus.ASSIGNED,
                )
                .order_by(RunProgress.assigned_at.desc())
                .limit(1)
            )
            new_p = new_p_result.scalar_one_or_none()
            if new_p:
                await manager.send_to_player(
                    run_id,
                    player_id,
                    {
                        "type": "object_updated",
                        "map_object_id": str(result.map_object_id),
                        "new_progress_id": str(new_p.id),
                        "resource_type": None,  # loaded lazily by client
                    },
                )

        # Notify teacher
        await manager.send_to_teacher(
            run_id,
            {
                "type": "player_answered",
                "player_id": player_id,
                "progress_id": str(result.id),
                "requires_review": result.requires_review,
            },
        )

        # Check player finished
        player_finished = player.status == PlayerStatus.FINISHED
        if player_finished:
            await manager.broadcast_to_all(
                run_id,
                {
                    "type": "player_finished",
                    "player_id": player_id,
                },
            )

        if player_finished and player.team_id:
            team_result = await db.execute(
                select(RunTeam).where(RunTeam.id == player.team_id)
            )
            team = team_result.scalar_one_or_none()
            if team and team.status == TeamStatus.COMPLETED:
                await manager.broadcast_to_all(
                    run_id,
                    {
                        "type": "team_completed",
                        "team_id": str(player.team_id),
                    },
                )

        # Check run completed
        run_result = await db.execute(
            select(GameRun).where(GameRun.id == uuid.UUID(run_id))
        )
        run = run_result.scalar_one_or_none()
        if run and run.status == RunStatus.COMPLETED:
            await manager.broadcast_to_all(
                run_id,
                {
                    "type": "run_completed",
                    "run_id": run_id,
                },
            )


async def _handle_mark_viewed(
    run_id: str, player_id: str, msg: MarkViewedMessage
) -> None:
    progress_id = msg.progress_id

    async with AsyncSessionLocal() as db:
        player_result = await db.execute(
            select(RunPlayer).where(RunPlayer.id == uuid.UUID(player_id))
        )
        player = player_result.scalar_one_or_none()
        if not player:
            return

        result, team_step_info, viewers = await svc.RunService.mark_text_viewed(
            db, progress_id, player
        )

        if player.team_id:
            team_players_result = await db.execute(
                select(RunPlayer).where(RunPlayer.team_id == player.team_id)
            )
            team_players = team_players_result.scalars().all()

            viewed_event = {
                "type": "team_text_viewed",
                "viewer_id": player_id,
                "viewers": viewers or [player_id],
            }
            for tp in team_players:
                await manager.send_to_player(run_id, str(tp.id), viewed_event)

            if team_step_info:
                step_event = {
                    "type": "team_step_advanced",
                    **team_step_info,
                    "completed_by_progress": None,
                }
                for tp in team_players:
                    await manager.send_to_player(run_id, str(tp.id), step_event)
        else:
            await manager.send_to_player(
                run_id,
                player_id,
                {
                    "type": "text_viewed",
                    "progress_id": str(result.id),
                },
            )

        await manager.send_to_teacher(
            run_id,
            {
                "type": "player_viewed_text",
                "player_id": player_id,
                "progress_id": str(result.id),
            },
        )

        player_finished = player.status == PlayerStatus.FINISHED
        if player_finished:
            await manager.broadcast_to_all(
                run_id,
                {
                    "type": "player_finished",
                    "player_id": player_id,
                },
            )

        if player_finished and player.team_id:
            team_result = await db.execute(
                select(RunTeam).where(RunTeam.id == player.team_id)
            )
            team = team_result.scalar_one_or_none()
            if team and team.status == TeamStatus.COMPLETED:
                await manager.broadcast_to_all(
                    run_id,
                    {
                        "type": "team_completed",
                        "team_id": str(player.team_id),
                    },
                )

        run_result = await db.execute(
            select(GameRun).where(GameRun.id == uuid.UUID(run_id))
        )
        run = run_result.scalar_one_or_none()
        if run and run.status == RunStatus.COMPLETED:
            await manager.broadcast_to_all(
                run_id,
                {
                    "type": "run_completed",
                    "run_id": run_id,
                },
            )


async def _handle_chat_message(run_id: str, player_id: str, msg: ChatMessage) -> None:
    # msg.message is already validated: non-empty, max 500 chars, stripped.
    message_text = msg.message

    async with AsyncSessionLocal() as db:
        player_result = await db.execute(
            select(RunPlayer).where(RunPlayer.id == uuid.UUID(player_id))
        )
        player = player_result.scalar_one_or_none()
        if not player:
            return

        chat = RunChat(
            run_id=uuid.UUID(run_id),
            player_id=uuid.UUID(player_id),
            team_id=player.team_id,
            message=message_text,
        )
        db.add(chat)
        await db.commit()
        await db.refresh(chat)

        # In team mode, only broadcast to team members (not the whole run)
        team_player_ids: list[str] | None = None
        if player.team_id:
            team_result = await db.execute(
                select(RunPlayer.id).where(RunPlayer.team_id == player.team_id)
            )
            team_player_ids = [str(row[0]) for row in team_result.all()]

    payload = {
        "type": "chat_message",
        "player_id": player_id,
        "display_name": player.display_name,
        "message": message_text,
        "created_at": _iso(chat.created_at),
    }

    if team_player_ids:
        await manager.broadcast_to_team(run_id, team_player_ids, payload)
    else:
        await manager.broadcast_to_run(run_id, payload)


# teacher messages
async def handle_teacher_message(run_id: str, teacher_id: str, data: dict) -> None:
    try:
        msg = teacher_message_adapter.validate_python(data)
    except ValidationError as exc:
        log.warning(
            "invalid_teacher_ws_message",
            run_id=run_id,
            teacher_id=teacher_id,
            error=str(exc),
        )
        await manager.send_to_teacher(
            run_id, {"type": "error", "detail": "Invalid message format"}
        )
        return

    try:
        if isinstance(msg, StartRunMessage):
            await _handle_start_run(run_id, teacher_id)
        elif isinstance(msg, StopRunMessage):
            await _handle_stop_run(run_id, teacher_id)
        elif isinstance(msg, ReviewAnswerMessage):
            await _handle_review_answer(run_id, teacher_id, msg)
    except Exception as exc:
        log.exception(
            "teacher_message_handler_error",
            run_id=run_id,
            teacher_id=teacher_id,
            msg_type=msg.type,
        )
        await manager.send_to_teacher(run_id, {"type": "error", "detail": str(exc)})


async def _handle_start_run(run_id: str, teacher_id: str) -> None:
    async with AsyncSessionLocal() as db:
        result = await svc.RunService.start_run(
            db, uuid.UUID(run_id), uuid.UUID(teacher_id)
        )

        # Send each player their assigned (visible) progress items
        for player_resp in result.players:
            pid = str(player_resp.id)
            progress_result = await db.execute(
                select(RunProgress).where(
                    RunProgress.run_id == uuid.UUID(run_id),
                    RunProgress.player_id == player_resp.id,
                    RunProgress.map_object_id != None,  # noqa: E711
                )
            )
            visible = progress_result.scalars().all()
            await manager.send_to_player(
                run_id,
                pid,
                {
                    "type": "run_started",
                    "progress": [_progress_dict(p) for p in visible],
                },
            )

        await manager.send_to_teacher(
            run_id,
            {
                "type": "run_started",
                "run": {
                    "id": str(result.id),
                    "status": result.status.value
                    if hasattr(result.status, "value")
                    else result.status,
                    "started_at": _iso(result.started_at),
                    "ends_at": _iso(result.ends_at),
                },
            },
        )


async def _handle_stop_run(run_id: str, teacher_id: str) -> None:
    async with AsyncSessionLocal() as db:
        await svc.RunService.stop_run(db, uuid.UUID(run_id), uuid.UUID(teacher_id))
    await manager.broadcast_to_all(
        run_id,
        {
            "type": "run_stopped",
            "run_id": run_id,
        },
    )


async def _handle_review_answer(
    run_id: str, teacher_id: str, msg: ReviewAnswerMessage
) -> None:
    progress_id = msg.progress_id
    request = ReviewAnswerRequest(score=msg.score, feedback=msg.feedback)

    async with AsyncSessionLocal() as db:
        result = await svc.RunService.review_answer(
            db, progress_id, uuid.UUID(teacher_id), request
        )

    await manager.send_to_player(
        run_id,
        str(result.player_id),
        {
            "type": "answer_reviewed",
            "progress_id": str(result.id),
            "score": result.score,
        },
    )
