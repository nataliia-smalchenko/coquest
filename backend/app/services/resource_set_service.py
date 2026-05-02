import uuid
from typing import List

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.resource_set import (
    ResourceSet,
    ResourceSetResource,
    ResourceSetSettings,
    ResourceSetTranslation,
)
from app.schemas.resource_set import (
    ResourceSetCreate,
    ResourceSetListItem,
    ResourceSetUpdate,
)


def _make_slug(title: str) -> str:
    import re

    base = re.sub(r"[^\w\s-]", "", title.lower())
    base = re.sub(r"[\s_-]+", "-", base).strip("-")
    return f"{base}-{str(uuid.uuid4())[:8]}"


def _load_options():
    return (
        selectinload(ResourceSet.translations),
        selectinload(ResourceSet.settings),
        selectinload(ResourceSet.resources),
    )


async def _get_own_resource_set(
    db: AsyncSession, resource_set_id: uuid.UUID, teacher_id: uuid.UUID
) -> ResourceSet:
    result = await db.execute(
        select(ResourceSet)
        .where(ResourceSet.id == resource_set_id, ResourceSet.teacher_id == teacher_id)
        .options(*_load_options())
    )
    rs = result.scalar_one_or_none()
    if not rs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Resource set not found"
        )
    return rs


class ResourceSetService:
    @staticmethod
    async def list_resource_sets(
        db: AsyncSession, teacher_id: uuid.UUID, language: str
    ) -> List[ResourceSetListItem]:
        result = await db.execute(
            select(ResourceSet)
            .where(ResourceSet.teacher_id == teacher_id)
            .options(
                selectinload(ResourceSet.translations),
                selectinload(ResourceSet.resources),
            )
            .order_by(ResourceSet.created_at.desc())
        )
        resource_sets = result.scalars().all()

        items = []
        for rs in resource_sets:
            translation = next(
                (t for t in rs.translations if t.language == language),
                next(iter(rs.translations), None),
            )
            items.append(
                ResourceSetListItem(
                    id=rs.id,
                    slug=rs.slug,
                    status=rs.status,
                    title=translation.title if translation else rs.slug,
                    created_at=rs.created_at,
                    resources_count=len(rs.resources),
                )
            )
        return items

    @staticmethod
    async def create_resource_set(
        db: AsyncSession, teacher_id: uuid.UUID, data: ResourceSetCreate
    ) -> ResourceSet:
        rs = ResourceSet(
            teacher_id=teacher_id,
            slug=_make_slug(data.title),
        )
        db.add(rs)
        await db.flush()

        db.add(
            ResourceSetTranslation(
                resource_set_id=rs.id,
                language=data.language,
                title=data.title,
                description=data.description,
            )
        )

        db.add(
            ResourceSetSettings(
                resource_set_id=rs.id,
                **data.settings.model_dump(),
            )
        )

        for item in data.resources:
            db.add(
                ResourceSetResource(
                    resource_set_id=rs.id,
                    resource_id=item.resource_id,
                    order_index=item.order_index,
                )
            )

        await db.commit()

        result = await db.execute(
            select(ResourceSet)
            .where(ResourceSet.id == rs.id)
            .options(*_load_options())
            .execution_options(populate_existing=True)
        )
        return result.scalar_one()

    @staticmethod
    async def get_resource_set(
        db: AsyncSession, resource_set_id: uuid.UUID, teacher_id: uuid.UUID
    ) -> ResourceSet:
        return await _get_own_resource_set(db, resource_set_id, teacher_id)

    @staticmethod
    async def update_resource_set(
        db: AsyncSession,
        resource_set_id: uuid.UUID,
        teacher_id: uuid.UUID,
        data: ResourceSetUpdate,
    ) -> ResourceSet:
        rs = await _get_own_resource_set(db, resource_set_id, teacher_id)

        # Update or create translation for the given language
        if data.title is not None or data.description is not None:
            lang = data.language or "uk"
            translation = next((t for t in rs.translations if t.language == lang), None)
            if translation:
                if data.title is not None:
                    translation.title = data.title
                if data.description is not None:
                    translation.description = data.description
            else:
                db.add(
                    ResourceSetTranslation(
                        resource_set_id=rs.id,
                        language=lang,
                        title=data.title or "",
                        description=data.description,
                    )
                )

        # Update settings
        if data.settings is not None:
            if rs.settings:
                for field, value in data.settings.model_dump().items():
                    setattr(rs.settings, field, value)
            else:
                db.add(
                    ResourceSetSettings(
                        resource_set_id=rs.id, **data.settings.model_dump()
                    )
                )

        # Replace resources
        if data.resources is not None:
            for rsr in list(rs.resources):
                await db.delete(rsr)
            await db.flush()
            for item in data.resources:
                db.add(
                    ResourceSetResource(
                        resource_set_id=rs.id,
                        resource_id=item.resource_id,
                        order_index=item.order_index,
                    )
                )

        await db.commit()

        result = await db.execute(
            select(ResourceSet)
            .where(ResourceSet.id == rs.id)
            .options(*_load_options())
            .execution_options(populate_existing=True)
        )
        return result.scalar_one()

    @staticmethod
    async def delete_resource_set(
        db: AsyncSession, resource_set_id: uuid.UUID, teacher_id: uuid.UUID
    ) -> None:
        rs = await _get_own_resource_set(db, resource_set_id, teacher_id)
        await db.delete(rs)
        await db.commit()

    @staticmethod
    async def _set_status(
        db: AsyncSession,
        resource_set_id: uuid.UUID,
        teacher_id: uuid.UUID,
        new_status: str,
    ) -> ResourceSet:
        rs = await _get_own_resource_set(db, resource_set_id, teacher_id)
        rs.status = new_status
        await db.commit()
        result = await db.execute(
            select(ResourceSet)
            .where(ResourceSet.id == rs.id)
            .options(*_load_options())
            .execution_options(populate_existing=True)
        )
        return result.scalar_one()

    @staticmethod
    async def publish_resource_set(
        db: AsyncSession, resource_set_id: uuid.UUID, teacher_id: uuid.UUID
    ) -> ResourceSet:
        return await ResourceSetService._set_status(
            db, resource_set_id, teacher_id, "published"
        )

    @staticmethod
    async def archive_resource_set(
        db: AsyncSession, resource_set_id: uuid.UUID, teacher_id: uuid.UUID
    ) -> ResourceSet:
        return await ResourceSetService._set_status(
            db, resource_set_id, teacher_id, "archived"
        )
