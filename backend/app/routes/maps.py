from typing import List, Optional

from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.map import MapListItem, MapResponse
from app.services.i18n_service import I18nService
from app.services.map_service import MapService

router = APIRouter(prefix="/api/maps", tags=["Maps"])


def get_language(accept_language: Optional[str] = Header(None)) -> str:
    return I18nService.detect_language_from_header(accept_language)


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
