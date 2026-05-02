import uuid
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException

from app.services.resource_set_service import (
    ResourceSetService,
    _make_slug,
    _get_own_resource_set,
)
from app.models.resource_set import ResourceSet


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _exec_returning(scalar=None, scalars=None):
    """Build a mock db.execute() return value."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = scalar
    result.scalar_one.return_value = scalar
    if scalars is not None:
        result.scalars.return_value.all.return_value = scalars
    return result


def _make_db(scalar=None, scalars=None):
    db = AsyncMock()
    db.execute.return_value = _exec_returning(scalar=scalar, scalars=scalars)
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.delete = AsyncMock()
    db.add = MagicMock()
    return db


def _make_resource_set(**kwargs) -> ResourceSet:
    rs = MagicMock(spec=ResourceSet)
    rs.id = kwargs.get("id", uuid.uuid4())
    rs.teacher_id = kwargs.get("teacher_id", uuid.uuid4())
    rs.slug = kwargs.get("slug", "test-resource-set-abc12345")
    rs.status = kwargs.get("status", "draft")
    rs.created_at = kwargs.get("created_at", datetime.now(timezone.utc))
    rs.translations = kwargs.get("translations", [])
    rs.resources = kwargs.get("resources", [])
    rs.settings = kwargs.get("settings", MagicMock())
    return rs


# ---------------------------------------------------------------------------
# _make_slug
# ---------------------------------------------------------------------------


class TestMakeSlug:
    def test_returns_string(self):
        result = _make_slug("My Resource Set")
        assert isinstance(result, str)

    def test_lowercases_title(self):
        result = _make_slug("My Resource Set")
        assert result == result.lower()

    def test_replaces_spaces_with_hyphens(self):
        result = _make_slug("Hello World")
        assert " " not in result
        assert "hello-world" in result

    def test_strips_special_characters(self):
        result = _make_slug("Set #1 (special!)")
        assert "#" not in result
        assert "!" not in result
        assert "(" not in result

    def test_appends_uuid_suffix(self):
        result = _make_slug("My Set")
        parts = result.rsplit("-", 1)
        assert len(parts) == 2
        assert len(parts[1]) == 8  # first 8 chars of uuid4

    def test_each_call_produces_unique_slug(self):
        slugs = {_make_slug("Same Title") for _ in range(10)}
        assert len(slugs) == 10

    def test_unicode_title(self):
        result = _make_slug("Мій набір")
        assert isinstance(result, str)
        assert len(result) > 0


# ---------------------------------------------------------------------------
# _get_own_resource_set
# ---------------------------------------------------------------------------


class TestGetOwnResourceSet:
    @pytest.mark.asyncio
    async def test_returns_resource_set_when_found(self):
        rs = _make_resource_set()
        db = _make_db(scalar=rs)
        result = await _get_own_resource_set(db, rs.id, rs.teacher_id)
        assert result is rs

    @pytest.mark.asyncio
    async def test_raises_404_when_not_found(self):
        db = _make_db(scalar=None)
        with pytest.raises(HTTPException) as exc_info:
            await _get_own_resource_set(db, uuid.uuid4(), uuid.uuid4())
        assert exc_info.value.status_code == 404
        assert "Resource set not found" in exc_info.value.detail


# ---------------------------------------------------------------------------
# ResourceSetService.list_resource_sets
# ---------------------------------------------------------------------------


class TestListResourceSets:
    @pytest.mark.asyncio
    async def test_returns_empty_list_when_no_resource_sets(self):
        db = _make_db(scalars=[])
        result = await ResourceSetService.list_resource_sets(db, uuid.uuid4(), "uk")
        assert result == []

    @pytest.mark.asyncio
    async def test_returns_list_item_with_translation(self):
        translation = MagicMock()
        translation.language = "uk"
        translation.title = "Тест"

        rs = _make_resource_set(
            translations=[translation],
            resources=[MagicMock(), MagicMock()],
        )

        db = _make_db(scalars=[rs])
        result = await ResourceSetService.list_resource_sets(db, uuid.uuid4(), "uk")

        assert len(result) == 1
        assert result[0].title == "Тест"
        assert result[0].resources_count == 2

    @pytest.mark.asyncio
    async def test_falls_back_to_first_translation_for_other_language(self):
        translation = MagicMock()
        translation.language = "uk"
        translation.title = "Тест"

        rs = _make_resource_set(translations=[translation], resources=[])
        db = _make_db(scalars=[rs])
        result = await ResourceSetService.list_resource_sets(db, uuid.uuid4(), "en")

        assert result[0].title == "Тест"

    @pytest.mark.asyncio
    async def test_falls_back_to_slug_when_no_translation(self):
        rs = _make_resource_set(translations=[], resources=[])
        db = _make_db(scalars=[rs])
        result = await ResourceSetService.list_resource_sets(db, uuid.uuid4(), "uk")

        assert result[0].title == rs.slug


# ---------------------------------------------------------------------------
# ResourceSetService.create_resource_set
# ---------------------------------------------------------------------------


class TestCreateResourceSet:
    @pytest.mark.asyncio
    async def test_adds_resource_set_translation_settings_and_resources(self):
        rs_id = uuid.uuid4()
        created_rs = _make_resource_set(id=rs_id)

        db = AsyncMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.add = MagicMock()

        db.execute.return_value = _exec_returning(scalar=created_rs)

        resource_item = MagicMock()
        resource_item.resource_id = uuid.uuid4()
        resource_item.order_index = 0

        settings = MagicMock()
        settings.model_dump.return_value = {"random_order": False}

        data = MagicMock()
        data.title = "New Resource Set"
        data.language = "uk"
        data.description = "Desc"
        data.settings = settings
        data.resources = [resource_item]

        with patch(
            "app.services.resource_set_service._make_slug",
            return_value="new-rs-abc12345",
        ):
            result = await ResourceSetService.create_resource_set(
                db, uuid.uuid4(), data
            )

        assert db.add.call_count >= 3  # ResourceSet + Translation + Settings + Resource
        db.flush.assert_called_once()
        db.commit.assert_called_once()
        assert result is created_rs

    @pytest.mark.asyncio
    async def test_creates_resource_set_without_resources(self):
        created_rs = _make_resource_set()
        db = AsyncMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.add = MagicMock()
        db.execute.return_value = _exec_returning(scalar=created_rs)

        settings = MagicMock()
        settings.model_dump.return_value = {}

        data = MagicMock()
        data.title = "Empty Set"
        data.language = "uk"
        data.description = None
        data.settings = settings
        data.resources = []

        with patch(
            "app.services.resource_set_service._make_slug", return_value="empty-set-abc"
        ):
            result = await ResourceSetService.create_resource_set(
                db, uuid.uuid4(), data
            )

        assert result is created_rs


# ---------------------------------------------------------------------------
# ResourceSetService.get_resource_set
# ---------------------------------------------------------------------------


class TestGetResourceSet:
    @pytest.mark.asyncio
    async def test_delegates_to_get_own_resource_set(self):
        rs = _make_resource_set()
        with patch(
            "app.services.resource_set_service._get_own_resource_set",
            new_callable=AsyncMock,
        ) as mock_get:
            mock_get.return_value = rs
            result = await ResourceSetService.get_resource_set(
                MagicMock(), rs.id, rs.teacher_id
            )
        assert result is rs
        mock_get.assert_called_once()


# ---------------------------------------------------------------------------
# ResourceSetService.update_resource_set
# ---------------------------------------------------------------------------


class TestUpdateResourceSet:
    def _make_update_data(self, **kwargs):
        data = MagicMock()
        data.title = kwargs.get("title", None)
        data.description = kwargs.get("description", None)
        data.language = kwargs.get("language", "uk")
        data.settings = kwargs.get("settings", None)
        data.resources = kwargs.get("resources", None)
        return data

    @pytest.mark.asyncio
    async def test_updates_existing_translation(self):
        lang = "uk"
        translation = MagicMock()
        translation.language = lang
        translation.title = "Old Title"
        translation.description = "Old Desc"

        rs = _make_resource_set(translations=[translation], resources=[])
        updated_rs = _make_resource_set()

        db = _make_db(scalar=updated_rs)
        with patch(
            "app.services.resource_set_service._get_own_resource_set",
            new_callable=AsyncMock,
        ) as mock_get:
            mock_get.return_value = rs
            data = self._make_update_data(
                title="New Title", description="New Desc", language=lang
            )
            await ResourceSetService.update_resource_set(db, rs.id, rs.teacher_id, data)

        assert translation.title == "New Title"
        assert translation.description == "New Desc"

    @pytest.mark.asyncio
    async def test_creates_new_translation_when_language_missing(self):
        rs = _make_resource_set(translations=[], resources=[])
        updated_rs = _make_resource_set()

        db = _make_db(scalar=updated_rs)
        with patch(
            "app.services.resource_set_service._get_own_resource_set",
            new_callable=AsyncMock,
        ) as mock_get:
            mock_get.return_value = rs
            data = self._make_update_data(title="Title", language="en")
            await ResourceSetService.update_resource_set(db, rs.id, rs.teacher_id, data)

        db.add.assert_called()

    @pytest.mark.asyncio
    async def test_updates_settings_when_provided(self):
        settings_obj = MagicMock()
        rs = _make_resource_set(translations=[], resources=[], settings=settings_obj)
        updated_rs = _make_resource_set()

        db = _make_db(scalar=updated_rs)
        settings_data = MagicMock()
        settings_data.model_dump.return_value = {"random_order": True}

        with patch(
            "app.services.resource_set_service._get_own_resource_set",
            new_callable=AsyncMock,
        ) as mock_get:
            mock_get.return_value = rs
            data = self._make_update_data(settings=settings_data)
            await ResourceSetService.update_resource_set(db, rs.id, rs.teacher_id, data)

        assert settings_obj.random_order is True

    @pytest.mark.asyncio
    async def test_replaces_resources_when_provided(self):
        old_res = MagicMock()
        rs = _make_resource_set(translations=[], resources=[old_res])
        updated_rs = _make_resource_set()

        db = _make_db(scalar=updated_rs)

        new_item = MagicMock()
        new_item.resource_id = uuid.uuid4()
        new_item.order_index = 0

        with patch(
            "app.services.resource_set_service._get_own_resource_set",
            new_callable=AsyncMock,
        ) as mock_get:
            mock_get.return_value = rs
            data = self._make_update_data(resources=[new_item])
            await ResourceSetService.update_resource_set(db, rs.id, rs.teacher_id, data)

        db.delete.assert_called_with(old_res)
        db.add.assert_called()

    @pytest.mark.asyncio
    async def test_raises_404_when_resource_set_not_found(self):
        db = _make_db(scalar=None)
        with patch(
            "app.services.resource_set_service._get_own_resource_set",
            new_callable=AsyncMock,
        ) as mock_get:
            mock_get.side_effect = HTTPException(
                status_code=404, detail="Resource set not found"
            )
            data = self._make_update_data()
            with pytest.raises(HTTPException) as exc_info:
                await ResourceSetService.update_resource_set(
                    db, uuid.uuid4(), uuid.uuid4(), data
                )
        assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# ResourceSetService.delete_resource_set
# ---------------------------------------------------------------------------


class TestDeleteResourceSet:
    @pytest.mark.asyncio
    async def test_deletes_resource_set(self):
        rs = _make_resource_set()
        db = _make_db()
        with patch(
            "app.services.resource_set_service._get_own_resource_set",
            new_callable=AsyncMock,
        ) as mock_get:
            mock_get.return_value = rs
            await ResourceSetService.delete_resource_set(db, rs.id, rs.teacher_id)

        db.delete.assert_called_once_with(rs)
        db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_raises_404_when_not_found(self):
        db = _make_db()
        with patch(
            "app.services.resource_set_service._get_own_resource_set",
            new_callable=AsyncMock,
        ) as mock_get:
            mock_get.side_effect = HTTPException(
                status_code=404, detail="Resource set not found"
            )
            with pytest.raises(HTTPException) as exc_info:
                await ResourceSetService.delete_resource_set(
                    db, uuid.uuid4(), uuid.uuid4()
                )
        assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# ResourceSetService._set_status / publish_resource_set / archive_resource_set
# ---------------------------------------------------------------------------


class TestSetStatus:
    @pytest.mark.asyncio
    async def test_sets_status_and_returns_resource_set(self):
        rs = _make_resource_set(status="draft")
        refreshed = _make_resource_set(status="published")
        db = _make_db(scalar=refreshed)
        with patch(
            "app.services.resource_set_service._get_own_resource_set",
            new_callable=AsyncMock,
        ) as mock_get:
            mock_get.return_value = rs
            result = await ResourceSetService._set_status(
                db, rs.id, rs.teacher_id, "published"
            )

        assert rs.status == "published"
        db.commit.assert_called_once()
        assert result is refreshed

    @pytest.mark.asyncio
    async def test_publish_resource_set_sets_published_status(self):
        rs = _make_resource_set()
        refreshed = _make_resource_set(status="published")
        db = _make_db(scalar=refreshed)
        with patch(
            "app.services.resource_set_service._get_own_resource_set",
            new_callable=AsyncMock,
        ) as mock_get:
            mock_get.return_value = rs
            result = await ResourceSetService.publish_resource_set(
                db, rs.id, rs.teacher_id
            )

        assert rs.status == "published"
        assert result is refreshed

    @pytest.mark.asyncio
    async def test_archive_resource_set_sets_archived_status(self):
        rs = _make_resource_set()
        refreshed = _make_resource_set(status="archived")
        db = _make_db(scalar=refreshed)
        with patch(
            "app.services.resource_set_service._get_own_resource_set",
            new_callable=AsyncMock,
        ) as mock_get:
            mock_get.return_value = rs
            result = await ResourceSetService.archive_resource_set(
                db, rs.id, rs.teacher_id
            )

        assert rs.status == "archived"
        assert result is refreshed
