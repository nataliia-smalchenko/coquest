import re
import time
import uuid
from collections import Counter
from typing import Any, Optional, List, Dict

import cloudinary.utils
import structlog
from fastapi import HTTPException, status
from sqlalchemy import delete, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models.question import Question
from app.models.resource import Resource, ResourceType
from app.models.resource_folder import ResourceFolder
from app.models.resource_tag import ResourceTag
from app.models.tag import Tag
from app.models.text_content import TextContent
from app.schemas.resource import (
    FolderCreate,
    FolderUpdate,
    QuestionCreate,
    ResourceCreate,
    ResourceUpdate,
    TagCreate,
    TextContentCreate,
)

log = structlog.get_logger(__name__)

# Whitelist: only alphanumeric characters, hyphens, and underscores are allowed
# in a folder segment. Slashes, dots, and other special characters are rejected
# to prevent path traversal attacks against the Cloudinary namespace.
_FOLDER_SEGMENT_RE = re.compile(r"^[a-zA-Z0-9_-]+$")


class ResourceService:
    @staticmethod
    async def list_folders(
        db: AsyncSession, teacher_id: uuid.UUID
    ) -> List[Dict[str, Any]]:
        result = await db.execute(
            select(ResourceFolder)
            .where(ResourceFolder.teacher_id == teacher_id)
            .order_by(ResourceFolder.created_at)
        )
        folders = result.scalars().all()
        # Рахуємо вкладені папки для кожної папки
        counts: Counter = Counter(
            f.parent_id for f in folders if f.parent_id is not None
        )
        return [
            {
                "id": f.id,
                "name": f.name,
                "parent_id": f.parent_id,
                "created_at": f.created_at,
                "children_count": counts.get(f.id, 0),
            }
            for f in folders
        ]

    @staticmethod
    async def create_folder(
        db: AsyncSession, teacher_id: uuid.UUID, data: FolderCreate
    ) -> Dict[str, Any]:

        if data.parent_id is not None:
            parent = await db.get(ResourceFolder, data.parent_id)
            if not parent or parent.teacher_id != teacher_id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Parent folder not found",
                )

        try:
            folder = ResourceFolder(
                teacher_id=teacher_id,
                parent_id=data.parent_id,
                name=data.name,
            )
            db.add(folder)
            await db.commit()
            await db.refresh(folder)
            return {
                "id": folder.id,
                "name": folder.name,
                "parent_id": folder.parent_id,
                "created_at": folder.created_at,
                "children_count": 0,
            }
        except Exception:
            await db.rollback()
            log.error("db_rollback_error", exc_info=True)
            raise

    @staticmethod
    async def delete_folder(
        db: AsyncSession, teacher_id: uuid.UUID, folder_id: uuid.UUID
    ) -> None:
        folder = await db.get(ResourceFolder, folder_id)
        if not folder or folder.teacher_id != teacher_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Folder not found",
            )
        try:
            await db.delete(folder)
            await db.commit()
        except Exception:
            await db.rollback()
            log.error("db_rollback_error", exc_info=True)
            raise

    @staticmethod
    async def _would_create_cycle(
        db: AsyncSession,
        folder_id: uuid.UUID,
        new_parent_id: uuid.UUID,
    ) -> bool:
        """Return True if setting new_parent_id on folder_id would create a cycle.

        Uses a recursive CTE that walks *up* the ancestor chain starting from
        new_parent_id. If folder_id appears anywhere in that chain the move is
        invalid (the folder would become its own ancestor).
        """
        result = await db.execute(
            text(
                """
                WITH RECURSIVE ancestors AS (
                    -- Base: start from the proposed new parent
                    SELECT id, parent_id
                    FROM resource_folders
                    WHERE id = :new_parent_id

                    UNION ALL

                    -- Recurse: walk up to each parent
                    SELECT f.id, f.parent_id
                    FROM resource_folders f
                    JOIN ancestors a ON f.id = a.parent_id
                )
                SELECT 1 FROM ancestors WHERE id = :folder_id
                LIMIT 1
                """
            ),
            {"new_parent_id": new_parent_id, "folder_id": folder_id},
        )
        return result.first() is not None

    @staticmethod
    async def update_folder(
        db: AsyncSession,
        teacher_id: uuid.UUID,
        folder_id: uuid.UUID,
        data: FolderUpdate,
    ) -> dict:
        folder = await db.get(ResourceFolder, folder_id)
        if not folder or folder.teacher_id != teacher_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Folder not found",
            )

        if "parent_id" in data.model_fields_set and data.parent_id is not None:
            # Moving to a new parent: verify the target exists and belongs to the same teacher
            parent = await db.get(ResourceFolder, data.parent_id)
            if not parent or parent.teacher_id != teacher_id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Parent folder not found",
                )
            # Guard against making the folder a descendant of itself
            if data.parent_id == folder_id or await ResourceService._would_create_cycle(
                db, folder_id, data.parent_id
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Moving this folder here would create a circular reference",
                )
            folder.parent_id = data.parent_id
        elif "parent_id" in data.model_fields_set and data.parent_id is None:
            # Explicitly moving to root
            folder.parent_id = None

        if data.name is not None:
            folder.name = data.name

        try:
            await db.commit()
            await db.refresh(folder)
        except Exception:
            await db.rollback()
            log.error("db_rollback_error", exc_info=True)
            raise

        log.info(
            "folder_updated",
            folder_id=str(folder_id),
            teacher_id=str(teacher_id),
            new_parent_id=str(folder.parent_id),
        )
        return {
            "id": folder.id,
            "name": folder.name,
            "parent_id": folder.parent_id,
            "created_at": folder.created_at,
            "children_count": 0,
        }

    @staticmethod
    async def list_tags(db: AsyncSession, teacher_id: uuid.UUID) -> List[Tag]:
        result = await db.execute(
            select(Tag).where(Tag.teacher_id == teacher_id).order_by(Tag.name)
        )
        return list(result.scalars().all())

    @staticmethod
    async def create_tag(
        db: AsyncSession, teacher_id: uuid.UUID, data: TagCreate
    ) -> Tag:
        try:
            tag = Tag(teacher_id=teacher_id, name=data.name, color=data.color)
            db.add(tag)
            await db.commit()
            await db.refresh(tag)
            return tag
        except IntegrityError:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Tag with this name already exists",
            )

    @staticmethod
    async def delete_tag(
        db: AsyncSession, teacher_id: uuid.UUID, tag_id: uuid.UUID
    ) -> None:
        tag = await db.get(Tag, tag_id)
        if not tag or tag.teacher_id != teacher_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tag not found",
            )
        try:
            await db.delete(tag)
            await db.commit()
        except Exception:
            await db.rollback()
            log.error("db_rollback_error", exc_info=True)
            raise

    @staticmethod
    async def list_resources(
        db: AsyncSession,
        teacher_id: uuid.UUID,
        folder_id: Optional[uuid.UUID] = None,
        type: Optional[ResourceType] = None,
        tag_ids: Optional[List[uuid.UUID]] = None,
        search: Optional[str] = None,
        difficulty: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Resource]:
        stmt = (
            select(Resource)
            .options(
                selectinload(Resource.tags),
                selectinload(Resource.text_content),
                selectinload(Resource.question),
            )
            .where(Resource.teacher_id == teacher_id)
        )

        if folder_id is not None:
            stmt = stmt.where(Resource.folder_id == folder_id)
        if type is not None:
            stmt = stmt.where(Resource.type == type)
        if tag_ids:
            for tid in tag_ids:
                stmt = stmt.where(Resource.tags.any(Tag.id == tid))
        if search:
            # Escape LIKE metacharacters; backslash must go first.
            _esc = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            stmt = stmt.where(Resource.title.ilike(f"%{_esc}%", escape="\\"))
        if difficulty is not None:
            subq = select(Question.resource_id).where(Question.difficulty == difficulty)
            stmt = stmt.where(Resource.id.in_(subq))

        stmt = stmt.order_by(Resource.created_at.desc()).limit(limit).offset(offset)

        result = await db.execute(stmt)
        resources = list(result.scalars().all())
        for r in resources:
            r.has_content = bool(r.text_content or r.question)
            r.difficulty = r.question.difficulty if r.question else None
        return resources

    @staticmethod
    async def create_resource(
        db: AsyncSession, teacher_id: uuid.UUID, data: ResourceCreate
    ) -> Resource:

        if data.folder_id is not None:
            folder = await db.get(ResourceFolder, data.folder_id)
            if not folder or folder.teacher_id != teacher_id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Folder not found",
                )

        try:
            resource = Resource(
                teacher_id=teacher_id,
                folder_id=data.folder_id,
                type=data.type,
                title=data.title,
            )
            db.add(resource)
            await db.flush()

            if data.tag_ids:
                await ResourceService._set_resource_tags(
                    db, teacher_id, resource.id, data.tag_ids
                )

            await db.commit()
            return await ResourceService._load_resource(db, resource.id)

        except HTTPException:
            await db.rollback()
            raise
        except Exception:
            await db.rollback()
            log.error("db_rollback_error", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error while creating resource",
            )

    @staticmethod
    async def get_resource(
        db: AsyncSession, teacher_id: uuid.UUID, resource_id: uuid.UUID
    ) -> Resource:
        result = await db.execute(
            select(Resource)
            .options(
                selectinload(Resource.tags),
                selectinload(Resource.text_content),
                selectinload(Resource.question),
            )
            .where(Resource.id == resource_id, Resource.teacher_id == teacher_id)
        )
        resource = result.scalar_one_or_none()
        if not resource:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Resource not found",
            )
        resource.has_content = bool(resource.text_content or resource.question)
        resource.difficulty = (
            resource.question.difficulty if resource.question else None
        )
        return resource

    @staticmethod
    async def update_resource(
        db: AsyncSession,
        teacher_id: uuid.UUID,
        resource_id: uuid.UUID,
        data: ResourceUpdate,
    ) -> Resource:
        resource = await ResourceService._get_resource_or_404(
            db, teacher_id, resource_id
        )

        try:
            if "title" in data.model_fields_set and data.title is not None:
                resource.title = data.title
            if "folder_id" in data.model_fields_set:
                resource.folder_id = data.folder_id
            if "tag_ids" in data.model_fields_set and data.tag_ids is not None:
                await ResourceService._set_resource_tags(
                    db, teacher_id, resource_id, data.tag_ids
                )
            await db.commit()
            return await ResourceService._load_resource(db, resource_id)
        except Exception:
            await db.rollback()
            log.error("db_rollback_error", exc_info=True)
            raise

    @staticmethod
    async def delete_resource(
        db: AsyncSession, teacher_id: uuid.UUID, resource_id: uuid.UUID
    ) -> None:
        resource = await ResourceService._get_resource_or_404(
            db, teacher_id, resource_id
        )
        await db.delete(resource)
        await db.commit()

    @staticmethod
    async def upsert_text_content(
        db: AsyncSession,
        teacher_id: uuid.UUID,
        resource_id: uuid.UUID,
        data: TextContentCreate,
    ) -> TextContent:
        resource = await ResourceService._get_resource_or_404(
            db, teacher_id, resource_id
        )
        if resource.type != ResourceType.TEXT:
            raise HTTPException(400, "Resource type is not 'text'")

        try:
            result = await db.execute(
                select(TextContent).where(TextContent.resource_id == resource_id)
            )
            content = result.scalar_one_or_none()

            images_serialized = [img.model_dump() for img in data.images]
            if content:
                content.body = data.body
                content.images = images_serialized
            else:
                content = TextContent(
                    resource_id=resource_id,
                    body=data.body,
                    images=images_serialized,
                )
                db.add(content)

            await db.commit()
            await db.refresh(content)
            return content
        except Exception:
            await db.rollback()
            log.error("db_rollback_error", exc_info=True)
            raise

    @staticmethod
    async def upsert_question(
        db: AsyncSession,
        teacher_id: uuid.UUID,
        resource_id: uuid.UUID,
        data: QuestionCreate,
    ) -> Question:
        resource = await ResourceService._get_resource_or_404(
            db, teacher_id, resource_id
        )
        if resource.type != ResourceType.QUESTION:
            raise HTTPException(400, "Resource type is not 'question'")

        if data.question_type in ("single", "multiple"):
            option_ids = {opt.id for opt in data.options}
            for correct_id in data.correct_answers:
                if correct_id not in option_ids:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Correct answer ID '{correct_id}' not found in options",
                    )

        try:
            result = await db.execute(
                select(Question).where(Question.resource_id == resource_id)
            )
            question = result.scalar_one_or_none()
            options_dict = [opt.model_dump() for opt in data.options]

            if question:
                question.question_type = data.question_type
                question.body = data.body
                question.explanation = data.explanation
                question.options = options_dict
                question.correct_answers = data.correct_answers
                question.requires_review = data.requires_review
                question.difficulty = data.difficulty
                question.points = data.points
            else:
                question = Question(
                    resource_id=resource_id,
                    question_type=data.question_type,
                    body=data.body,
                    explanation=data.explanation,
                    options=options_dict,
                    correct_answers=data.correct_answers,
                    requires_review=data.requires_review,
                    difficulty=data.difficulty,
                    points=data.points,
                )
                db.add(question)

            await db.commit()
            await db.refresh(question)
            return question
        except Exception:
            await db.rollback()
            log.error("db_rollback_error", exc_info=True)
            raise

    @staticmethod
    def get_cloudinary_signature(teacher_id: str, folder: str) -> dict[str, Any]:
        """Generate a signed Cloudinary upload request for the given teacher and folder.

        The ``folder`` parameter is validated against a strict whitelist regex
        (alphanumeric, hyphens, underscores only) to prevent path-traversal
        attacks that could place files outside the teacher's Cloudinary namespace.
        """
        if not _FOLDER_SEGMENT_RE.match(folder):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid folder name. Only letters, digits, hyphens, and underscores are allowed.",
            )

        upload_preset = settings.CLOUDINARY_UPLOAD_PRESET
        timestamp = int(time.time())
        full_folder = f"coquest/{teacher_id}/{folder}"
        params_to_sign = {
            "folder": full_folder,
            "timestamp": timestamp,
            "upload_preset": upload_preset,
        }
        signature = cloudinary.utils.api_sign_request(
            params_to_sign, settings.CLOUDINARY_API_SECRET
        )
        return {
            "signature": signature,
            "timestamp": timestamp,
            "api_key": settings.CLOUDINARY_API_KEY,
            "cloud_name": settings.CLOUDINARY_CLOUD_NAME,
            "folder": full_folder,
            "upload_preset": upload_preset,
        }

    # Helpers
    @staticmethod
    async def _get_resource_or_404(
        db: AsyncSession, teacher_id: uuid.UUID, resource_id: uuid.UUID
    ) -> Resource:
        result = await db.execute(
            select(Resource).where(
                Resource.id == resource_id,
                Resource.teacher_id == teacher_id,
            )
        )
        resource = result.scalar_one_or_none()
        if not resource:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Resource not found",
            )
        return resource

    @staticmethod
    async def _load_resource(db: AsyncSession, resource_id: uuid.UUID) -> Resource:
        result = await db.execute(
            select(Resource)
            .options(selectinload(Resource.tags))
            .where(Resource.id == resource_id)
        )
        return result.scalar_one()

    @staticmethod
    async def _set_resource_tags(
        db: AsyncSession,
        teacher_id: uuid.UUID,
        resource_id: uuid.UUID,
        tag_ids: List[uuid.UUID],
    ) -> None:
        await db.execute(
            delete(ResourceTag).where(ResourceTag.resource_id == resource_id)
        )
        if not tag_ids:
            return

        tags_result = await db.execute(
            select(Tag).where(Tag.id.in_(tag_ids), Tag.teacher_id == teacher_id)
        )
        tags = tags_result.scalars().all()

        if len(tags) != len(tag_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="One or more tags not found",
            )

        for tag in tags:
            db.add(ResourceTag(resource_id=resource_id, tag_id=tag.id))
