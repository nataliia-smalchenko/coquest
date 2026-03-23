import math
import uuid
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.map import Map, MapObject, MapTranslation
from app.models.quest import Quest, QuestResource, QuestSettings, QuestTranslation
from app.models.resource import Resource, ResourceType
from app.schemas.quest import QuestCreate, QuestListItem, QuestUpdate


def _make_slug(title: str) -> str:
    import re
    base = re.sub(r"[^\w\s-]", "", title.lower())
    base = re.sub(r"[\s_-]+", "-", base).strip("-")
    return f"{base}-{str(uuid.uuid4())[:8]}"


def _load_options():
    return (
        selectinload(Quest.translations),
        selectinload(Quest.settings),
        selectinload(Quest.resources),
    )


async def _get_own_quest(db: AsyncSession, quest_id: uuid.UUID, teacher_id: uuid.UUID) -> Quest:
    result = await db.execute(
        select(Quest)
        .where(Quest.id == quest_id, Quest.teacher_id == teacher_id)
        .options(*_load_options())
    )
    quest = result.scalar_one_or_none()
    if not quest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quest not found")
    return quest


async def _validate_show_all_texts(
    db: AsyncSession,
    map_id: Optional[uuid.UUID],
    resource_ids: List[uuid.UUID],
    show_all_texts: bool,
) -> None:
    if not show_all_texts:
        return

    # Count interactive objects on the map
    objects_count = 0
    if map_id:
        result = await db.execute(
            select(func.count()).where(
                MapObject.map_id == map_id,
                MapObject.is_interactive == True,  # noqa: E712
            )
        )
        objects_count = result.scalar_one()

    # Count text-type resources
    if resource_ids:
        result = await db.execute(
            select(func.count())
            .select_from(Resource)
            .where(Resource.id.in_(resource_ids), Resource.type == ResourceType.TEXT)
        )
        text_count = result.scalar_one()
    else:
        text_count = 0

    if text_count > math.floor(objects_count / 2):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"show_all_texts requires text_count ({text_count}) "
                f"<= floor(objects_count / 2) ({math.floor(objects_count / 2)})"
            ),
        )


class QuestService:
    @staticmethod
    async def list_quests(
        db: AsyncSession, teacher_id: uuid.UUID, language: str
    ) -> List[QuestListItem]:
        result = await db.execute(
            select(Quest)
            .where(Quest.teacher_id == teacher_id)
            .options(
                selectinload(Quest.translations),
                selectinload(Quest.resources),
                selectinload(Quest.map).selectinload(Map.translations),
            )
            .order_by(Quest.created_at.desc())
        )
        quests = result.scalars().all()

        items = []
        for q in quests:
            translation = next(
                (t for t in q.translations if t.language == language),
                next(iter(q.translations), None),
            )
            map_name: Optional[str] = None
            if q.map:
                map_tr = next(
                    (t for t in q.map.translations if t.language == language),
                    next(iter(q.map.translations), None),
                )
                map_name = map_tr.name if map_tr else q.map.slug

            items.append(
                QuestListItem(
                    id=q.id,
                    slug=q.slug,
                    status=q.status,
                    map_id=q.map_id,
                    map_name=map_name,
                    title=translation.title if translation else q.slug,
                    created_at=q.created_at,
                    resources_count=len(q.resources),
                )
            )
        return items

    @staticmethod
    async def create_quest(
        db: AsyncSession, teacher_id: uuid.UUID, data: QuestCreate
    ) -> Quest:
        resource_ids = [r.resource_id for r in data.resources]
        await _validate_show_all_texts(
            db, data.map_id, resource_ids, data.settings.show_all_texts
        )

        quest = Quest(
            teacher_id=teacher_id,
            map_id=data.map_id,
            slug=_make_slug(data.title),
            max_players=data.max_players,
        )
        db.add(quest)
        await db.flush()

        db.add(
            QuestTranslation(
                quest_id=quest.id,
                language=data.language,
                title=data.title,
                description=data.description,
            )
        )

        db.add(
            QuestSettings(
                quest_id=quest.id,
                **data.settings.model_dump(),
            )
        )

        for item in data.resources:
            db.add(
                QuestResource(
                    quest_id=quest.id,
                    resource_id=item.resource_id,
                    order_index=item.order_index,
                )
            )

        await db.commit()
        await db.refresh(quest)

        result = await db.execute(
            select(Quest).where(Quest.id == quest.id).options(*_load_options())
        )
        return result.scalar_one()

    @staticmethod
    async def get_quest(
        db: AsyncSession, quest_id: uuid.UUID, teacher_id: uuid.UUID
    ) -> Quest:
        return await _get_own_quest(db, quest_id, teacher_id)

    @staticmethod
    async def update_quest(
        db: AsyncSession, quest_id: uuid.UUID, teacher_id: uuid.UUID, data: QuestUpdate
    ) -> Quest:
        quest = await _get_own_quest(db, quest_id, teacher_id)

        if data.map_id is not None:
            quest.map_id = data.map_id
        if data.max_players is not None:
            quest.max_players = data.max_players

        # Update or create translation for the given language
        if data.title is not None or data.description is not None:
            lang = data.language or "uk"
            translation = next(
                (t for t in quest.translations if t.language == lang), None
            )
            if translation:
                if data.title is not None:
                    translation.title = data.title
                if data.description is not None:
                    translation.description = data.description
            else:
                db.add(
                    QuestTranslation(
                        quest_id=quest.id,
                        language=lang,
                        title=data.title or "",
                        description=data.description,
                    )
                )

        # Update settings
        if data.settings is not None:
            resource_ids = (
                [r.resource_id for r in data.resources]
                if data.resources is not None
                else [r.resource_id for r in quest.resources]
            )
            map_id = data.map_id if data.map_id is not None else quest.map_id
            await _validate_show_all_texts(
                db, map_id, resource_ids, data.settings.show_all_texts
            )
            if quest.settings:
                for field, value in data.settings.model_dump().items():
                    setattr(quest.settings, field, value)
            else:
                db.add(QuestSettings(quest_id=quest.id, **data.settings.model_dump()))

        # Replace resources
        if data.resources is not None:
            for qr in list(quest.resources):
                await db.delete(qr)
            await db.flush()
            for item in data.resources:
                db.add(
                    QuestResource(
                        quest_id=quest.id,
                        resource_id=item.resource_id,
                        order_index=item.order_index,
                    )
                )

        await db.commit()

        result = await db.execute(
            select(Quest).where(Quest.id == quest.id).options(*_load_options())
        )
        return result.scalar_one()

    @staticmethod
    async def delete_quest(
        db: AsyncSession, quest_id: uuid.UUID, teacher_id: uuid.UUID
    ) -> None:
        quest = await _get_own_quest(db, quest_id, teacher_id)
        await db.delete(quest)
        await db.commit()

    @staticmethod
    async def _set_status(
        db: AsyncSession, quest_id: uuid.UUID, teacher_id: uuid.UUID, new_status: str
    ) -> Quest:
        quest = await _get_own_quest(db, quest_id, teacher_id)
        quest.status = new_status
        await db.commit()
        result = await db.execute(
            select(Quest).where(Quest.id == quest.id).options(*_load_options())
        )
        return result.scalar_one()

    @staticmethod
    async def publish_quest(
        db: AsyncSession, quest_id: uuid.UUID, teacher_id: uuid.UUID
    ) -> Quest:
        return await QuestService._set_status(db, quest_id, teacher_id, "published")

    @staticmethod
    async def archive_quest(
        db: AsyncSession, quest_id: uuid.UUID, teacher_id: uuid.UUID
    ) -> Quest:
        return await QuestService._set_status(db, quest_id, teacher_id, "archived")
