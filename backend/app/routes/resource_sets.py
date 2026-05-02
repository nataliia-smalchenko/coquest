import uuid
from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.resource_set import (
    ResourceSetCreate,
    ResourceSetListItem,
    ResourceSetResponse,
    ResourceSetUpdate,
)
from app.services.resource_set_service import ResourceSetService
from app.utils.dependencies import get_current_teacher, get_language

router = APIRouter(prefix="/api/resource-sets", tags=["Resource Sets"])


@router.get("/", response_model=List[ResourceSetListItem])
async def list_resource_sets(
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
    language: str = Depends(get_language),
):
    return await ResourceSetService.list_resource_sets(db, teacher.id, language)


@router.post(
    "/", response_model=ResourceSetResponse, status_code=status.HTTP_201_CREATED
)
async def create_resource_set(
    data: ResourceSetCreate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await ResourceSetService.create_resource_set(db, teacher.id, data)


@router.get("/{resource_set_id}", response_model=ResourceSetResponse)
async def get_resource_set(
    resource_set_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await ResourceSetService.get_resource_set(db, resource_set_id, teacher.id)


@router.put("/{resource_set_id}", response_model=ResourceSetResponse)
async def update_resource_set(
    resource_set_id: uuid.UUID,
    data: ResourceSetUpdate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await ResourceSetService.update_resource_set(
        db, resource_set_id, teacher.id, data
    )


@router.delete("/{resource_set_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resource_set(
    resource_set_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    await ResourceSetService.delete_resource_set(db, resource_set_id, teacher.id)


@router.post("/{resource_set_id}/publish", response_model=ResourceSetResponse)
async def publish_resource_set(
    resource_set_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await ResourceSetService.publish_resource_set(
        db, resource_set_id, teacher.id
    )


@router.post("/{resource_set_id}/archive", response_model=ResourceSetResponse)
async def archive_resource_set(
    resource_set_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await ResourceSetService.archive_resource_set(
        db, resource_set_id, teacher.id
    )
