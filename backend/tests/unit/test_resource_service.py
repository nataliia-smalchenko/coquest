import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.services.resource_service import ResourceService
from app.models.resource import Resource, ResourceType
from app.models.resource_folder import ResourceFolder
from app.models.tag import Tag
from app.models.text_content import TextContent
from app.models.question import Question


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _exec_result(scalar=None, scalars=None):
    r = MagicMock()
    r.scalar_one_or_none.return_value = scalar
    r.scalar_one.return_value = scalar
    if scalars is not None:
        r.scalars.return_value.all.return_value = scalars
    return r


def _make_db(scalar=None, scalars=None):
    db = AsyncMock()
    db.execute.return_value = _exec_result(scalar=scalar, scalars=scalars)
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.delete = AsyncMock()
    db.add = MagicMock()
    db.get = AsyncMock(return_value=None)
    return db


def _make_resource(**kwargs) -> Resource:
    r = MagicMock(spec=Resource)
    r.id = kwargs.get("id", uuid.uuid4())
    r.teacher_id = kwargs.get("teacher_id", uuid.uuid4())
    r.folder_id = kwargs.get("folder_id", None)
    r.type = kwargs.get("type", ResourceType.TEXT)
    r.title = kwargs.get("title", "Test Resource")
    r.tags = kwargs.get("tags", [])
    r.text_content = kwargs.get("text_content", None)
    r.question = kwargs.get("question", None)
    r.has_content = False
    r.difficulty = None
    r.model_fields_set = set()
    return r


def _make_folder(**kwargs) -> ResourceFolder:
    f = MagicMock(spec=ResourceFolder)
    f.id = kwargs.get("id", uuid.uuid4())
    f.teacher_id = kwargs.get("teacher_id", uuid.uuid4())
    f.parent_id = kwargs.get("parent_id", None)
    f.name = kwargs.get("name", "Folder")
    f.created_at = kwargs.get("created_at", None)
    return f


# ---------------------------------------------------------------------------
# list_folders
# ---------------------------------------------------------------------------


class TestListFolders:
    @pytest.mark.asyncio
    async def test_returns_empty_list(self):
        db = _make_db(scalars=[])
        result = await ResourceService.list_folders(db, uuid.uuid4())
        assert result == []

    @pytest.mark.asyncio
    async def test_counts_children(self):
        parent_id = uuid.uuid4()
        parent = _make_folder(id=parent_id, parent_id=None)
        child = _make_folder(parent_id=parent_id)

        db = _make_db(scalars=[parent, child])
        result = await ResourceService.list_folders(db, uuid.uuid4())

        parent_item = next(r for r in result if r["id"] == parent_id)
        assert parent_item["children_count"] == 1

    @pytest.mark.asyncio
    async def test_returns_zero_children_for_leaf(self):
        folder = _make_folder(parent_id=None)
        db = _make_db(scalars=[folder])
        result = await ResourceService.list_folders(db, uuid.uuid4())
        assert result[0]["children_count"] == 0

    @pytest.mark.asyncio
    async def test_returns_correct_fields(self):
        folder = _make_folder()
        db = _make_db(scalars=[folder])
        result = await ResourceService.list_folders(db, uuid.uuid4())
        assert set(result[0].keys()) == {
            "id",
            "name",
            "parent_id",
            "created_at",
            "children_count",
        }


# ---------------------------------------------------------------------------
# create_folder
# ---------------------------------------------------------------------------


class TestCreateFolder:
    @pytest.mark.asyncio
    async def test_creates_root_folder(self):
        teacher_id = uuid.uuid4()
        folder = _make_folder(teacher_id=teacher_id, parent_id=None)
        db = _make_db()
        db.refresh = AsyncMock(side_effect=lambda f: None)

        data = MagicMock()
        data.parent_id = None
        data.name = "Root"

        with patch("app.services.resource_service.ResourceFolder") as MockFolder:
            MockFolder.return_value = folder
            result = await ResourceService.create_folder(db, teacher_id, data)

        db.add.assert_called_once_with(folder)
        db.commit.assert_called_once()
        assert result["children_count"] == 0

    @pytest.mark.asyncio
    async def test_raises_404_when_parent_not_owned(self):
        teacher_id = uuid.uuid4()
        parent = _make_folder(teacher_id=uuid.uuid4())  # different teacher
        db = _make_db()
        db.get = AsyncMock(return_value=parent)

        data = MagicMock()
        data.parent_id = uuid.uuid4()
        data.name = "Child"

        with pytest.raises(HTTPException) as exc_info:
            await ResourceService.create_folder(db, teacher_id, data)
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_raises_404_when_parent_not_found(self):
        db = _make_db()
        db.get = AsyncMock(return_value=None)

        data = MagicMock()
        data.parent_id = uuid.uuid4()

        with pytest.raises(HTTPException) as exc_info:
            await ResourceService.create_folder(db, uuid.uuid4(), data)
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_rollback_on_db_error(self):
        db = _make_db()
        db.get = AsyncMock(return_value=None)
        db.commit = AsyncMock(side_effect=Exception("DB error"))
        db.rollback = AsyncMock()

        data = MagicMock()
        data.parent_id = None
        data.name = "Folder"

        with pytest.raises(Exception):
            await ResourceService.create_folder(db, uuid.uuid4(), data)

        db.rollback.assert_called_once()


# ---------------------------------------------------------------------------
# delete_folder
# ---------------------------------------------------------------------------


class TestDeleteFolder:
    @pytest.mark.asyncio
    async def test_deletes_folder(self):
        teacher_id = uuid.uuid4()
        folder = _make_folder(teacher_id=teacher_id)
        db = _make_db()
        db.get = AsyncMock(return_value=folder)

        await ResourceService.delete_folder(db, teacher_id, folder.id)

        db.delete.assert_called_once_with(folder)
        db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_raises_404_when_not_found(self):
        db = _make_db()
        db.get = AsyncMock(return_value=None)
        with pytest.raises(HTTPException) as exc_info:
            await ResourceService.delete_folder(db, uuid.uuid4(), uuid.uuid4())
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_raises_404_when_not_owned(self):
        folder = _make_folder(teacher_id=uuid.uuid4())
        db = _make_db()
        db.get = AsyncMock(return_value=folder)
        with pytest.raises(HTTPException) as exc_info:
            await ResourceService.delete_folder(db, uuid.uuid4(), folder.id)
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_rollback_on_db_error(self):
        teacher_id = uuid.uuid4()
        folder = _make_folder(teacher_id=teacher_id)
        db = _make_db()
        db.get = AsyncMock(return_value=folder)
        db.delete = AsyncMock(side_effect=Exception("DB error"))
        db.rollback = AsyncMock()

        with pytest.raises(Exception):
            await ResourceService.delete_folder(db, teacher_id, folder.id)

        db.rollback.assert_called_once()


# ---------------------------------------------------------------------------
# list_tags / create_tag / delete_tag
# ---------------------------------------------------------------------------


class TestListTags:
    @pytest.mark.asyncio
    async def test_returns_tags(self):
        tag = MagicMock(spec=Tag)
        db = _make_db(scalars=[tag])
        result = await ResourceService.list_tags(db, uuid.uuid4())
        assert result == [tag]

    @pytest.mark.asyncio
    async def test_returns_empty_list(self):
        db = _make_db(scalars=[])
        result = await ResourceService.list_tags(db, uuid.uuid4())
        assert result == []


class TestCreateTag:
    @pytest.mark.asyncio
    async def test_creates_tag(self):
        tag = MagicMock(spec=Tag)
        db = _make_db()

        data = MagicMock()
        data.name = "Python"
        data.color = "#ff0000"

        with patch("app.services.resource_service.Tag") as MockTag:
            MockTag.return_value = tag
            result = await ResourceService.create_tag(db, uuid.uuid4(), data)

        db.add.assert_called_once_with(tag)
        db.commit.assert_called_once()
        assert result is tag

    @pytest.mark.asyncio
    async def test_raises_409_on_duplicate(self):
        db = _make_db()
        db.commit = AsyncMock(side_effect=IntegrityError("", {}, Exception()))
        db.rollback = AsyncMock()

        data = MagicMock()
        data.name = "duplicate"
        data.color = "#000"

        with pytest.raises(HTTPException) as exc_info:
            await ResourceService.create_tag(db, uuid.uuid4(), data)
        assert exc_info.value.status_code == 409
        db.rollback.assert_called_once()


class TestDeleteTag:
    @pytest.mark.asyncio
    async def test_deletes_tag(self):
        teacher_id = uuid.uuid4()
        tag = MagicMock(spec=Tag)
        tag.teacher_id = teacher_id
        db = _make_db()
        db.get = AsyncMock(return_value=tag)

        await ResourceService.delete_tag(db, teacher_id, uuid.uuid4())

        db.delete.assert_called_once_with(tag)
        db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_raises_404_when_not_found(self):
        db = _make_db()
        db.get = AsyncMock(return_value=None)
        with pytest.raises(HTTPException) as exc_info:
            await ResourceService.delete_tag(db, uuid.uuid4(), uuid.uuid4())
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_raises_404_when_not_owned(self):
        tag = MagicMock(spec=Tag)
        tag.teacher_id = uuid.uuid4()
        db = _make_db()
        db.get = AsyncMock(return_value=tag)
        with pytest.raises(HTTPException) as exc_info:
            await ResourceService.delete_tag(db, uuid.uuid4(), uuid.uuid4())
        assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# list_resources
# ---------------------------------------------------------------------------


class TestListResources:
    @pytest.mark.asyncio
    async def test_returns_resources_with_has_content_flag(self):
        resource = _make_resource(text_content=MagicMock(), question=None)
        db = _make_db(scalars=[resource])
        result = await ResourceService.list_resources(db, uuid.uuid4())
        assert len(result) == 1
        assert result[0].has_content is True

    @pytest.mark.asyncio
    async def test_sets_difficulty_from_question(self):
        question = MagicMock()
        question.difficulty = "intermediate"
        resource = _make_resource(question=question, text_content=None)
        db = _make_db(scalars=[resource])
        result = await ResourceService.list_resources(db, uuid.uuid4())
        assert result[0].difficulty == "intermediate"

    @pytest.mark.asyncio
    async def test_returns_empty_list(self):
        db = _make_db(scalars=[])
        result = await ResourceService.list_resources(db, uuid.uuid4())
        assert result == []

    @pytest.mark.asyncio
    async def test_applies_folder_filter(self):
        db = _make_db(scalars=[])
        folder_id = uuid.uuid4()
        await ResourceService.list_resources(db, uuid.uuid4(), folder_id=folder_id)
        db.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_applies_search_filter(self):
        db = _make_db(scalars=[])
        await ResourceService.list_resources(db, uuid.uuid4(), search="python")
        db.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_applies_tag_filter(self):
        db = _make_db(scalars=[])
        await ResourceService.list_resources(db, uuid.uuid4(), tag_ids=[uuid.uuid4()])
        db.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_applies_difficulty_filter(self):
        db = _make_db(scalars=[])
        await ResourceService.list_resources(db, uuid.uuid4(), difficulty="beginner")
        db.execute.assert_called_once()


# ---------------------------------------------------------------------------
# create_resource
# ---------------------------------------------------------------------------


class TestCreateResource:
    @pytest.mark.asyncio
    async def test_creates_resource_without_folder(self):
        resource = _make_resource()
        db = _make_db(scalar=resource, scalars=[])
        db.flush = AsyncMock()

        data = MagicMock()
        data.folder_id = None
        data.type = ResourceType.TEXT
        data.title = "My Resource"
        data.tag_ids = []

        with patch.object(
            ResourceService, "_load_resource", new_callable=AsyncMock
        ) as mock_load:
            mock_load.return_value = resource
            result = await ResourceService.create_resource(db, uuid.uuid4(), data)

        db.add.assert_called()
        db.flush.assert_called()
        db.commit.assert_called()
        assert result is resource

    @pytest.mark.asyncio
    async def test_raises_404_when_folder_not_owned(self):
        teacher_id = uuid.uuid4()
        folder = _make_folder(teacher_id=uuid.uuid4())
        db = _make_db()
        db.get = AsyncMock(return_value=folder)

        data = MagicMock()
        data.folder_id = uuid.uuid4()

        with pytest.raises(HTTPException) as exc_info:
            await ResourceService.create_resource(db, teacher_id, data)
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_sets_tags_when_provided(self):
        resource = _make_resource()
        teacher_id = uuid.uuid4()

        db = _make_db()
        db.flush = AsyncMock()
        db.rollback = AsyncMock()

        tag_ids = [uuid.uuid4()]
        data = MagicMock()
        data.folder_id = None
        data.type = ResourceType.TEXT
        data.title = "Tagged"
        data.tag_ids = tag_ids

        with patch.object(
            ResourceService, "_set_resource_tags", new_callable=AsyncMock
        ) as mock_tags:
            with patch.object(
                ResourceService, "_load_resource", new_callable=AsyncMock
            ) as mock_load:
                mock_load.return_value = resource
                with patch("app.services.resource_service.Resource") as MockRes:
                    MockRes.return_value = resource
                    await ResourceService.create_resource(db, teacher_id, data)

        mock_tags.assert_called_once()

    @pytest.mark.asyncio
    async def test_raises_500_on_db_error(self):
        db = _make_db()
        db.flush = AsyncMock(side_effect=Exception("DB crash"))
        db.rollback = AsyncMock()

        data = MagicMock()
        data.folder_id = None
        data.type = ResourceType.TEXT
        data.title = "Fail"
        data.tag_ids = []

        with pytest.raises(HTTPException) as exc_info:
            await ResourceService.create_resource(db, uuid.uuid4(), data)
        assert exc_info.value.status_code == 500
        db.rollback.assert_called_once()


# ---------------------------------------------------------------------------
# get_resource
# ---------------------------------------------------------------------------


class TestGetResource:
    @pytest.mark.asyncio
    async def test_returns_resource(self):
        resource = _make_resource(text_content=None, question=None)
        db = _make_db(scalar=resource)
        result = await ResourceService.get_resource(db, uuid.uuid4(), resource.id)
        assert result is resource
        assert result.has_content is False

    @pytest.mark.asyncio
    async def test_raises_404_when_not_found(self):
        db = _make_db(scalar=None)
        with pytest.raises(HTTPException) as exc_info:
            await ResourceService.get_resource(db, uuid.uuid4(), uuid.uuid4())
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_sets_difficulty_from_question(self):
        question = MagicMock()
        question.difficulty = "advanced"
        resource = _make_resource(question=question, text_content=None)
        db = _make_db(scalar=resource)
        result = await ResourceService.get_resource(db, uuid.uuid4(), resource.id)
        assert result.difficulty == "advanced"

    @pytest.mark.asyncio
    async def test_sets_has_content_true_with_question(self):
        question = MagicMock()
        resource = _make_resource(question=question, text_content=None)
        db = _make_db(scalar=resource)
        result = await ResourceService.get_resource(db, uuid.uuid4(), resource.id)
        assert result.has_content is True


# ---------------------------------------------------------------------------
# update_resource
# ---------------------------------------------------------------------------


class TestUpdateResource:
    @pytest.mark.asyncio
    async def test_updates_title(self):
        resource = _make_resource()
        updated = _make_resource(title="Updated")
        db = _make_db(scalar=updated)

        data = MagicMock()
        data.model_fields_set = {"title"}
        data.title = "Updated"
        data.tag_ids = None

        with patch.object(
            ResourceService, "_get_resource_or_404", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = resource
            with patch.object(
                ResourceService, "_load_resource", new_callable=AsyncMock
            ) as mock_load:
                mock_load.return_value = updated
                await ResourceService.update_resource(
                    db, uuid.uuid4(), resource.id, data
                )

        assert resource.title == "Updated"
        db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_updates_folder_id(self):
        resource = _make_resource()
        new_folder_id = uuid.uuid4()
        updated = _make_resource()
        db = _make_db(scalar=updated)

        data = MagicMock()
        data.model_fields_set = {"folder_id"}
        data.title = None
        data.folder_id = new_folder_id
        data.tag_ids = None

        with patch.object(
            ResourceService, "_get_resource_or_404", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = resource
            with patch.object(
                ResourceService, "_load_resource", new_callable=AsyncMock
            ) as mock_load:
                mock_load.return_value = updated
                await ResourceService.update_resource(
                    db, uuid.uuid4(), resource.id, data
                )

        assert resource.folder_id == new_folder_id

    @pytest.mark.asyncio
    async def test_updates_tags(self):
        resource = _make_resource()
        tag_ids = [uuid.uuid4()]
        updated = _make_resource()
        db = _make_db(scalar=updated)

        data = MagicMock()
        data.model_fields_set = {"tag_ids"}
        data.title = None
        data.tag_ids = tag_ids

        with patch.object(
            ResourceService, "_get_resource_or_404", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = resource
            with patch.object(
                ResourceService, "_set_resource_tags", new_callable=AsyncMock
            ) as mock_tags:
                with patch.object(
                    ResourceService, "_load_resource", new_callable=AsyncMock
                ) as mock_load:
                    mock_load.return_value = updated
                    await ResourceService.update_resource(
                        db, uuid.uuid4(), resource.id, data
                    )

        mock_tags.assert_called_once()

    @pytest.mark.asyncio
    async def test_raises_404_when_not_found(self):
        db = _make_db()
        data = MagicMock()
        data.model_fields_set = set()

        with patch.object(
            ResourceService, "_get_resource_or_404", new_callable=AsyncMock
        ) as mock_get:
            mock_get.side_effect = HTTPException(
                status_code=404, detail="Resource not found"
            )
            with pytest.raises(HTTPException) as exc_info:
                await ResourceService.update_resource(
                    db, uuid.uuid4(), uuid.uuid4(), data
                )
        assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# delete_resource
# ---------------------------------------------------------------------------


class TestDeleteResource:
    @pytest.mark.asyncio
    async def test_deletes_resource(self):
        resource = _make_resource()
        db = _make_db()
        with patch.object(
            ResourceService, "_get_resource_or_404", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = resource
            await ResourceService.delete_resource(db, uuid.uuid4(), resource.id)

        db.delete.assert_called_once_with(resource)
        db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_raises_404_when_not_found(self):
        db = _make_db()
        with patch.object(
            ResourceService, "_get_resource_or_404", new_callable=AsyncMock
        ) as mock_get:
            mock_get.side_effect = HTTPException(
                status_code=404, detail="Resource not found"
            )
            with pytest.raises(HTTPException) as exc_info:
                await ResourceService.delete_resource(db, uuid.uuid4(), uuid.uuid4())
        assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# upsert_text_content
# ---------------------------------------------------------------------------


class TestUpsertTextContent:
    @pytest.mark.asyncio
    async def test_creates_new_text_content(self):
        resource = _make_resource(type=ResourceType.TEXT)
        db = _make_db(scalar=None)

        img = MagicMock()
        img.model_dump.return_value = {"url": "https://cloudinary.com/img.jpg"}

        data = MagicMock()
        data.body = {"type": "doc", "content": []}
        data.images = [img]

        with patch.object(
            ResourceService, "_get_resource_or_404", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = resource
            await ResourceService.upsert_text_content(
                db, uuid.uuid4(), resource.id, data
            )

        db.add.assert_called_once()
        db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_updates_existing_text_content(self):
        resource = _make_resource(type=ResourceType.TEXT)
        existing_content = MagicMock(spec=TextContent)
        db = _make_db(scalar=existing_content)

        img = MagicMock()
        img.model_dump.return_value = {}

        data = MagicMock()
        data.body = {"type": "doc", "content": [{"type": "paragraph"}]}
        data.images = [img]

        with patch.object(
            ResourceService, "_get_resource_or_404", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = resource
            await ResourceService.upsert_text_content(
                db, uuid.uuid4(), resource.id, data
            )

        assert existing_content.body == data.body
        db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_raises_400_when_resource_type_not_text(self):
        resource = _make_resource(type=ResourceType.QUESTION)
        db = _make_db()

        with patch.object(
            ResourceService, "_get_resource_or_404", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = resource
            with pytest.raises(HTTPException) as exc_info:
                await ResourceService.upsert_text_content(
                    db, uuid.uuid4(), resource.id, MagicMock()
                )
        assert exc_info.value.status_code == 400


# ---------------------------------------------------------------------------
# upsert_question
# ---------------------------------------------------------------------------


class TestUpsertQuestion:
    def _make_question_data(
        self, question_type="open", correct_answers=None, options=None
    ):
        data = MagicMock()
        data.question_type = question_type
        data.body = {"type": "doc", "content": []}
        data.explanation = None
        data.correct_answers = correct_answers or []
        data.options = options or []
        data.requires_review = False
        data.difficulty = None
        data.points = 10
        return data

    @pytest.mark.asyncio
    async def test_creates_new_question(self):
        resource = _make_resource(type=ResourceType.QUESTION)
        db = _make_db(scalar=None)

        data = self._make_question_data()
        data.options = []

        with patch.object(
            ResourceService, "_get_resource_or_404", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = resource
            await ResourceService.upsert_question(db, uuid.uuid4(), resource.id, data)

        db.add.assert_called_once()
        db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_updates_existing_question(self):
        resource = _make_resource(type=ResourceType.QUESTION)
        existing_q = MagicMock(spec=Question)
        db = _make_db(scalar=existing_q)

        data = self._make_question_data(question_type="open")
        data.options = []

        with patch.object(
            ResourceService, "_get_resource_or_404", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = resource
            await ResourceService.upsert_question(db, uuid.uuid4(), resource.id, data)

        assert existing_q.question_type == "open"
        db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_raises_400_when_resource_type_not_question(self):
        resource = _make_resource(type=ResourceType.TEXT)
        db = _make_db()

        with patch.object(
            ResourceService, "_get_resource_or_404", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = resource
            with pytest.raises(HTTPException) as exc_info:
                await ResourceService.upsert_question(
                    db, uuid.uuid4(), resource.id, self._make_question_data()
                )
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_raises_400_when_correct_answer_not_in_options(self):
        resource = _make_resource(type=ResourceType.QUESTION)
        db = _make_db()

        opt = MagicMock()
        opt.id = "opt-1"
        opt.model_dump.return_value = {"id": "opt-1"}

        data = self._make_question_data(
            question_type="single",
            options=[opt],
            correct_answers=["nonexistent-id"],
        )

        with patch.object(
            ResourceService, "_get_resource_or_404", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = resource
            with pytest.raises(HTTPException) as exc_info:
                await ResourceService.upsert_question(
                    db, uuid.uuid4(), resource.id, data
                )
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_accepts_valid_correct_answer_in_options(self):
        resource = _make_resource(type=ResourceType.QUESTION)
        db = _make_db(scalar=None)

        opt = MagicMock()
        opt.id = "opt-1"
        opt.model_dump.return_value = {"id": "opt-1"}

        data = self._make_question_data(
            question_type="single",
            options=[opt],
            correct_answers=["opt-1"],
        )

        with patch.object(
            ResourceService, "_get_resource_or_404", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = resource
            await ResourceService.upsert_question(db, uuid.uuid4(), resource.id, data)

        db.commit.assert_called_once()


# ---------------------------------------------------------------------------
# get_cloudinary_signature
# ---------------------------------------------------------------------------


class TestGetCloudinarySignature:
    def test_returns_required_fields(self):
        with patch(
            "app.services.resource_service.cloudinary.utils.api_sign_request",
            return_value="sig123",
        ):
            result = ResourceService.get_cloudinary_signature("teacher-id", "questions")

        assert "signature" in result
        assert "timestamp" in result
        assert "api_key" in result
        assert "cloud_name" in result
        assert "folder" in result
        assert "upload_preset" in result
        assert result["signature"] == "sig123"
        assert "teacher-id" in result["folder"]
        assert "questions" in result["folder"]

    def test_upload_preset_is_coquest_preset(self):
        with patch(
            "app.services.resource_service.cloudinary.utils.api_sign_request",
            return_value="s",
        ):
            result = ResourceService.get_cloudinary_signature("t", "f")
        assert result["upload_preset"] == "coquest_preset"


# ---------------------------------------------------------------------------
# _get_resource_or_404
# ---------------------------------------------------------------------------


class TestGetResourceOr404:
    @pytest.mark.asyncio
    async def test_returns_resource(self):
        resource = _make_resource()
        db = _make_db(scalar=resource)
        result = await ResourceService._get_resource_or_404(
            db, uuid.uuid4(), resource.id
        )
        assert result is resource

    @pytest.mark.asyncio
    async def test_raises_404(self):
        db = _make_db(scalar=None)
        with pytest.raises(HTTPException) as exc_info:
            await ResourceService._get_resource_or_404(db, uuid.uuid4(), uuid.uuid4())
        assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# _set_resource_tags
# ---------------------------------------------------------------------------


class TestSetResourceTags:
    @pytest.mark.asyncio
    async def test_clears_and_skips_when_empty_list(self):
        db = _make_db(scalars=[])
        resource_id = uuid.uuid4()
        await ResourceService._set_resource_tags(db, uuid.uuid4(), resource_id, [])
        db.execute.assert_called_once()  # only the delete
        db.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_raises_400_when_tag_not_found(self):
        tag_id = uuid.uuid4()
        db = _make_db(scalars=[])  # no tags returned
        with pytest.raises(HTTPException) as exc_info:
            await ResourceService._set_resource_tags(
                db, uuid.uuid4(), uuid.uuid4(), [tag_id]
            )
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_adds_resource_tags(self):
        tag = MagicMock(spec=Tag)
        tag.id = uuid.uuid4()

        db = AsyncMock()
        db.execute = AsyncMock(return_value=_exec_result(scalars=[tag]))
        db.add = MagicMock()

        tag_ids = [tag.id]
        await ResourceService._set_resource_tags(
            db, uuid.uuid4(), uuid.uuid4(), tag_ids
        )

        db.add.assert_called_once()
