from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.map import Map, MapObject
from app.schemas.map import MapListItem, MapResponse
from app.services.i18n_service import I18nService

router = APIRouter(prefix="/api/maps", tags=["Maps"])


def get_language(accept_language: Optional[str] = Header(None)) -> str:
    return I18nService.detect_language_from_header(accept_language)


@router.get("/", response_model=List[MapListItem])
async def list_maps(
    db: AsyncSession = Depends(get_db),
    language: str = Depends(get_language),
):
    result = await db.execute(
        select(Map).options(selectinload(Map.translations))
    )
    maps = result.scalars().all()

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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Map not found")

    return m
