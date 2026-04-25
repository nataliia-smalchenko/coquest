from typing import List

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.map import Map, MapObject


class MapService:
    @staticmethod
    async def list_maps(db: AsyncSession) -> List[Map]:
        """Return all maps with translations eagerly loaded."""
        result = await db.execute(select(Map).options(selectinload(Map.translations)))
        return list(result.scalars().all())

    @staticmethod
    async def get_map_by_slug(db: AsyncSession, slug: str) -> Map:
        """Return a single map with translations and objects (including hints).

        Raises HTTP 404 if no map with the given slug exists.
        """
        result = await db.execute(
            select(Map)
            .where(Map.slug == slug)
            .options(
                selectinload(Map.translations),
                selectinload(Map.objects).selectinload(MapObject.hints),
            )
        )
        m = result.scalar_one_or_none()
        if not m:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Map not found"
            )
        return m
