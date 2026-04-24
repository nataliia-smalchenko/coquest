import uuid
from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.quest import QuestCreate, QuestListItem, QuestResponse, QuestUpdate
from app.services.quest_service import QuestService
from app.utils.dependencies import get_current_teacher, get_language

router = APIRouter(prefix="/api/quests", tags=["Quests"])


@router.get("/", response_model=List[QuestListItem])
async def list_quests(
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
    language: str = Depends(get_language),
):
    return await QuestService.list_quests(db, teacher.id, language)


@router.post("/", response_model=QuestResponse, status_code=status.HTTP_201_CREATED)
async def create_quest(
    data: QuestCreate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await QuestService.create_quest(db, teacher.id, data)


@router.get("/{quest_id}", response_model=QuestResponse)
async def get_quest(
    quest_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await QuestService.get_quest(db, quest_id, teacher.id)


@router.put("/{quest_id}", response_model=QuestResponse)
async def update_quest(
    quest_id: uuid.UUID,
    data: QuestUpdate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await QuestService.update_quest(db, quest_id, teacher.id, data)


@router.delete("/{quest_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_quest(
    quest_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    await QuestService.delete_quest(db, quest_id, teacher.id)


@router.post("/{quest_id}/publish", response_model=QuestResponse)
async def publish_quest(
    quest_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await QuestService.publish_quest(db, quest_id, teacher.id)


@router.post("/{quest_id}/archive", response_model=QuestResponse)
async def archive_quest(
    quest_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await QuestService.archive_quest(db, quest_id, teacher.id)
