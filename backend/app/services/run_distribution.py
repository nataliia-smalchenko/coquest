"""Resource distribution service: assigns quest resources to players and teams."""

import random
import uuid
from typing import Dict, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.game_run import GameRun
from app.models.map import MapObject
from app.models.quest import Quest
from app.models.resource import Resource
from app.models.run_player import PlayerStatus, RunPlayer
from app.models.run_progress import ProgressStatus, RunProgress
from app.models.run_team import RunTeam


class RunDistributionService:
    @staticmethod
    async def _distribute_resources(db: AsyncSession, session: GameRun) -> None:
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
                    RunProgress(
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
        db: AsyncSession, session: GameRun, player: RunPlayer
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
                RunProgress(
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
        db: AsyncSession, session: GameRun, team: RunTeam
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
                        RunProgress(
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
                        RunProgress(
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
