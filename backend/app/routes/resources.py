import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.resource import ResourceType
from app.models.question import DifficultyLevel
from app.models.user import User
from app.schemas.resource import (
    CloudinarySignatureRequest,
    CloudinarySignatureResponse,
    FolderCreate,
    FolderResponse,
    FolderUpdate,
    QuestionCreate,
    QuestionResponse,
    ResourceCreate,
    ResourceDetailResponse,
    ResourceResponse,
    ResourceUpdate,
    TagCreate,
    TagResponse,
    TextContentCreate,
    TextContentResponse,
)
from app.services.resource_service import ResourceService
from app.utils.dependencies import get_current_teacher

router = APIRouter(prefix="/api/resources", tags=["Resources"])


# Folders
@router.get("/folders", response_model=List[FolderResponse], tags=["Folders"])
async def list_folders(
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await ResourceService.list_folders(db, teacher.id)


@router.post(
    "/folders", response_model=FolderResponse, status_code=status.HTTP_201_CREATED
)
async def create_folder(
    data: FolderCreate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await ResourceService.create_folder(db, teacher.id, data)


@router.patch("/folders/{folder_id}", response_model=FolderResponse)
async def update_folder(
    folder_id: uuid.UUID,
    data: FolderUpdate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await ResourceService.update_folder(db, teacher.id, folder_id, data)


@router.delete("/folders/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(
    folder_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    await ResourceService.delete_folder(db, teacher.id, folder_id)


# Tags
@router.get("/tags", response_model=List[TagResponse])
async def list_tags(
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await ResourceService.list_tags(db, teacher.id)


@router.post("/tags", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
async def create_tag(
    data: TagCreate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await ResourceService.create_tag(db, teacher.id, data)


@router.delete("/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    tag_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    await ResourceService.delete_tag(db, teacher.id, tag_id)


# Resources
@router.get("/", response_model=List[ResourceResponse])
async def list_resources(
    folder_id: Optional[uuid.UUID] = None,
    type: Optional[ResourceType] = None,
    tag_ids: List[uuid.UUID] = Query(default=[]),
    search: Optional[str] = None,
    difficulty: Optional[DifficultyLevel] = None,
    limit: int = Query(50, ge=1, le=100, description="Items per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await ResourceService.list_resources(
        db,
        teacher.id,
        folder_id=folder_id,
        type=type,
        tag_ids=tag_ids or None,
        search=search,
        difficulty=difficulty,
        limit=limit,
        offset=offset,
    )


@router.post("/", response_model=ResourceResponse, status_code=status.HTTP_201_CREATED)
async def create_resource(
    data: ResourceCreate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await ResourceService.create_resource(db, teacher.id, data)


@router.get("/{resource_id}", response_model=ResourceDetailResponse)
async def get_resource(
    resource_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await ResourceService.get_resource(db, teacher.id, resource_id)


@router.put("/{resource_id}", response_model=ResourceResponse)
async def update_resource(
    resource_id: uuid.UUID,
    data: ResourceUpdate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await ResourceService.update_resource(db, teacher.id, resource_id, data)


@router.delete("/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resource(
    resource_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    await ResourceService.delete_resource(db, teacher.id, resource_id)


# Content
@router.post("/{resource_id}/text-content", response_model=TextContentResponse)
async def upsert_text_content(
    resource_id: uuid.UUID,
    data: TextContentCreate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await ResourceService.upsert_text_content(db, teacher.id, resource_id, data)


@router.post("/{resource_id}/question", response_model=QuestionResponse)
async def upsert_question(
    resource_id: uuid.UUID,
    data: QuestionCreate,
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(get_current_teacher),
):
    return await ResourceService.upsert_question(db, teacher.id, resource_id, data)


# Cloudinary
@router.post("/upload-image-signature", response_model=CloudinarySignatureResponse)
async def upload_image_signature(
    data: CloudinarySignatureRequest,
    teacher: User = Depends(get_current_teacher),
):
    return ResourceService.get_cloudinary_signature(str(teacher.id), data.folder)
