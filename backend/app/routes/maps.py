from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.map import MapListItem, MapResponse
from app.services.map_service import MapService
from app.utils.dependencies import get_language

router = APIRouter(prefix="/api/maps", tags=["Maps"])


@router.get("/", response_model=List[MapListItem])
async def list_maps(
    db: AsyncSession = Depends(get_db),
    language: str = Depends(get_language),
):
    maps = await MapService.list_maps(db)
    items = []
    for m in maps:
        translation = next(
            (t for t in m.translations if t.language == language),
            next(iter(m.translations), None),
        )
        items.append(
            MapListItem(
                id=m.id,
                slug=m.slug,
                name=translation.name if translation else m.slug,
                description=translation.description if translation else None,
            )
        )
    return items


@router.get("/{slug}", response_model=MapResponse)
async def get_map(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    return await MapService.get_map_by_slug(db, slug)
