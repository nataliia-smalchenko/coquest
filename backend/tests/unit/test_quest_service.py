import uuid
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException

from app.services.quest_service import QuestService, _make_slug, _get_own_quest
from app.models.quest import Quest


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


def _make_quest(**kwargs) -> Quest:
    q = MagicMock(spec=Quest)
    q.id = kwargs.get("id", uuid.uuid4())
    q.teacher_id = kwargs.get("teacher_id", uuid.uuid4())
    q.map_id = kwargs.get("map_id", uuid.uuid4())
    q.slug = kwargs.get("slug", "test-quest-abc12345")
    q.status = kwargs.get("status", "draft")
    q.created_at = kwargs.get("created_at", datetime.now(timezone.utc))
    q.translations = kwargs.get("translations", [])
    q.resources = kwargs.get("resources", [])
    q.settings = kwargs.get("settings", MagicMock())
    q.map = kwargs.get("map", None)
    return q


# ---------------------------------------------------------------------------
# _make_slug
# ---------------------------------------------------------------------------


class TestMakeSlug:
    def test_returns_string(self):
        result = _make_slug("My Quest")
        assert isinstance(result, str)

    def test_lowercases_title(self):
        result = _make_slug("My Quest")
        assert result == result.lower()

    def test_replaces_spaces_with_hyphens(self):
        result = _make_slug("Hello World")
        assert " " not in result
        assert "hello-world" in result

    def test_strips_special_characters(self):
        result = _make_slug("Quest #1 (special!)")
        assert "#" not in result
        assert "!" not in result
        assert "(" not in result

    def test_appends_uuid_suffix(self):
        result = _make_slug("My Quest")
        parts = result.rsplit("-", 1)
        assert len(parts) == 2
        assert len(parts[1]) == 8  # first 8 chars of uuid4

    def test_each_call_produces_unique_slug(self):
        slugs = {_make_slug("Same Title") for _ in range(10)}
        assert len(slugs) == 10

    def test_unicode_title(self):
        result = _make_slug("Мій квест")
        assert isinstance(result, str)
        assert len(result) > 0


# ---------------------------------------------------------------------------
# _get_own_quest
# ---------------------------------------------------------------------------


class TestGetOwnQuest:
    @pytest.mark.asyncio
    async def test_returns_quest_when_found(self):
        quest = _make_quest()
        db = _make_db(scalar=quest)
        result = await _get_own_quest(db, quest.id, quest.teacher_id)
        assert result is quest

    @pytest.mark.asyncio
    async def test_raises_404_when_not_found(self):
        db = _make_db(scalar=None)
        with pytest.raises(HTTPException) as exc_info:
            await _get_own_quest(db, uuid.uuid4(), uuid.uuid4())
        assert exc_info.value.status_code == 404
        assert "Quest not found" in exc_info.value.detail


# ---------------------------------------------------------------------------
# QuestService.list_quests
# ---------------------------------------------------------------------------


class TestListQuests:
    @pytest.mark.asyncio
    async def test_returns_empty_list_when_no_quests(self):
        db = _make_db(scalars=[])
        result = await QuestService.list_quests(db, uuid.uuid4(), "uk")
        assert result == []

    @pytest.mark.asyncio
    async def test_returns_list_item_with_translation(self):
        translation = MagicMock()
        translation.language = "uk"
        translation.title = "Тест"

        map_tr = MagicMock()
        map_tr.language = "uk"
        map_tr.name = "Клас"

        map_obj = MagicMock()
        map_obj.translations = [map_tr]
        map_obj.slug = "classroom1"

        quest = _make_quest(
            translations=[translation],
            resources=[MagicMock(), MagicMock()],
            map=map_obj,
        )

        db = _make_db(scalars=[quest])
        result = await QuestService.list_quests(db, uuid.uuid4(), "uk")

        assert len(result) == 1
        assert result[0].title == "Тест"
        assert result[0].map_name == "Клас"
        assert result[0].resources_count == 2

    @pytest.mark.asyncio
    async def test_falls_back_to_first_translation_for_other_language(self):
        translation = MagicMock()
        translation.language = "uk"
        translation.title = "Тест"

        quest = _make_quest(translations=[translation], resources=[], map=None)
        db = _make_db(scalars=[quest])
        result = await QuestService.list_quests(db, uuid.uuid4(), "en")

        assert result[0].title == "Тест"

    @pytest.mark.asyncio
    async def test_falls_back_to_slug_when_no_translation(self):
        quest = _make_quest(translations=[], resources=[], map=None)
        db = _make_db(scalars=[quest])
        result = await QuestService.list_quests(db, uuid.uuid4(), "uk")

        assert result[0].title == quest.slug

    @pytest.mark.asyncio
    async def test_map_name_falls_back_to_slug_when_no_translation(self):
        map_obj = MagicMock()
        map_obj.translations = []
        map_obj.slug = "island-map"

        quest = _make_quest(translations=[], resources=[], map=map_obj)
        db = _make_db(scalars=[quest])
        result = await QuestService.list_quests(db, uuid.uuid4(), "uk")

        assert result[0].map_name == "island-map"


# ---------------------------------------------------------------------------
# QuestService.create_quest
# ---------------------------------------------------------------------------


class TestCreateQuest:
    @pytest.mark.asyncio
    async def test_adds_quest_translation_settings_and_resources(self):
        quest_id = uuid.uuid4()
        created_quest = _make_quest(id=quest_id)

        db = AsyncMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.add = MagicMock()

        # First execute (after flush) returns None for the Quest select after commit
        db.execute.return_value = _exec_returning(scalar=created_quest)

        resource_item = MagicMock()
        resource_item.resource_id = uuid.uuid4()
        resource_item.order_index = 0

        settings = MagicMock()
        settings.model_dump.return_value = {"random_order": False}

        data = MagicMock()
        data.map_id = uuid.uuid4()
        data.title = "New Quest"
        data.language = "uk"
        data.description = "Desc"
        data.settings = settings
        data.resources = [resource_item]

        with patch(
            "app.services.quest_service._make_slug", return_value="new-quest-abc12345"
        ):
            result = await QuestService.create_quest(db, uuid.uuid4(), data)

        assert db.add.call_count >= 3  # Quest + Translation + Settings + QuestResource
        db.flush.assert_called_once()
        db.commit.assert_called_once()
        assert result is created_quest

    @pytest.mark.asyncio
    async def test_creates_quest_without_resources(self):
        created_quest = _make_quest()
        db = AsyncMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.add = MagicMock()
        db.execute.return_value = _exec_returning(scalar=created_quest)

        settings = MagicMock()
        settings.model_dump.return_value = {}

        data = MagicMock()
        data.map_id = uuid.uuid4()
        data.title = "Empty Quest"
        data.language = "uk"
        data.description = None
        data.settings = settings
        data.resources = []

        with patch(
            "app.services.quest_service._make_slug", return_value="empty-quest-abc"
        ):
            result = await QuestService.create_quest(db, uuid.uuid4(), data)

        assert result is created_quest


# ---------------------------------------------------------------------------
# QuestService.get_quest
# ---------------------------------------------------------------------------


class TestGetQuest:
    @pytest.mark.asyncio
    async def test_delegates_to_get_own_quest(self):
        quest = _make_quest()
        with patch(
            "app.services.quest_service._get_own_quest", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = quest
            result = await QuestService.get_quest(
                MagicMock(), quest.id, quest.teacher_id
            )
        assert result is quest
        mock_get.assert_called_once()


# ---------------------------------------------------------------------------
# QuestService.update_quest
# ---------------------------------------------------------------------------


class TestUpdateQuest:
    def _make_update_data(self, **kwargs):
        data = MagicMock()
        data.map_id = kwargs.get("map_id", None)
        data.title = kwargs.get("title", None)
        data.description = kwargs.get("description", None)
        data.language = kwargs.get("language", "uk")
        data.settings = kwargs.get("settings", None)
        data.resources = kwargs.get("resources", None)
        return data

    @pytest.mark.asyncio
    async def test_updates_map_id(self):
        new_map_id = uuid.uuid4()
        quest = _make_quest(translations=[], resources=[])
        updated_quest = _make_quest()

        db = _make_db(scalar=updated_quest)
        with patch(
            "app.services.quest_service._get_own_quest", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = quest
            data = self._make_update_data(map_id=new_map_id)
            await QuestService.update_quest(db, quest.id, quest.teacher_id, data)

        assert quest.map_id == new_map_id

    @pytest.mark.asyncio
    async def test_updates_existing_translation(self):
        lang = "uk"
        translation = MagicMock()
        translation.language = lang
        translation.title = "Old Title"
        translation.description = "Old Desc"

        quest = _make_quest(translations=[translation], resources=[])
        updated_quest = _make_quest()

        db = _make_db(scalar=updated_quest)
        with patch(
            "app.services.quest_service._get_own_quest", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = quest
            data = self._make_update_data(
                title="New Title", description="New Desc", language=lang
            )
            await QuestService.update_quest(db, quest.id, quest.teacher_id, data)

        assert translation.title == "New Title"
        assert translation.description == "New Desc"

    @pytest.mark.asyncio
    async def test_creates_new_translation_when_language_missing(self):
        quest = _make_quest(translations=[], resources=[])
        updated_quest = _make_quest()

        db = _make_db(scalar=updated_quest)
        with patch(
            "app.services.quest_service._get_own_quest", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = quest
            data = self._make_update_data(title="Title", language="en")
            await QuestService.update_quest(db, quest.id, quest.teacher_id, data)

        db.add.assert_called()

    @pytest.mark.asyncio
    async def test_updates_settings_when_provided(self):
        settings_obj = MagicMock()
        quest = _make_quest(translations=[], resources=[], settings=settings_obj)
        updated_quest = _make_quest()

        db = _make_db(scalar=updated_quest)
        settings_data = MagicMock()
        settings_data.model_dump.return_value = {"random_order": True}

        with patch(
            "app.services.quest_service._get_own_quest", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = quest
            data = self._make_update_data(settings=settings_data)
            await QuestService.update_quest(db, quest.id, quest.teacher_id, data)

        # setattr was called for each setting field
        assert settings_obj.random_order is True

    @pytest.mark.asyncio
    async def test_replaces_resources_when_provided(self):
        old_res = MagicMock()
        quest = _make_quest(translations=[], resources=[old_res])
        updated_quest = _make_quest()

        db = _make_db(scalar=updated_quest)

        new_item = MagicMock()
        new_item.resource_id = uuid.uuid4()
        new_item.order_index = 0

        with patch(
            "app.services.quest_service._get_own_quest", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = quest
            data = self._make_update_data(resources=[new_item])
            await QuestService.update_quest(db, quest.id, quest.teacher_id, data)

        db.delete.assert_called_with(old_res)
        db.add.assert_called()

    @pytest.mark.asyncio
    async def test_raises_404_when_quest_not_found(self):
        db = _make_db(scalar=None)
        with patch(
            "app.services.quest_service._get_own_quest", new_callable=AsyncMock
        ) as mock_get:
            mock_get.side_effect = HTTPException(
                status_code=404, detail="Quest not found"
            )
            data = self._make_update_data()
            with pytest.raises(HTTPException) as exc_info:
                await QuestService.update_quest(db, uuid.uuid4(), uuid.uuid4(), data)
        assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# QuestService.delete_quest
# ---------------------------------------------------------------------------


class TestDeleteQuest:
    @pytest.mark.asyncio
    async def test_deletes_quest(self):
        quest = _make_quest()
        db = _make_db()
        with patch(
            "app.services.quest_service._get_own_quest", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = quest
            await QuestService.delete_quest(db, quest.id, quest.teacher_id)

        db.delete.assert_called_once_with(quest)
        db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_raises_404_when_not_found(self):
        db = _make_db()
        with patch(
            "app.services.quest_service._get_own_quest", new_callable=AsyncMock
        ) as mock_get:
            mock_get.side_effect = HTTPException(
                status_code=404, detail="Quest not found"
            )
            with pytest.raises(HTTPException) as exc_info:
                await QuestService.delete_quest(db, uuid.uuid4(), uuid.uuid4())
        assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# QuestService._set_status / publish_quest / archive_quest
# ---------------------------------------------------------------------------


class TestSetStatus:
    @pytest.mark.asyncio
    async def test_sets_status_and_returns_quest(self):
        quest = _make_quest(status="draft")
        refreshed = _make_quest(status="published")
        db = _make_db(scalar=refreshed)
        with patch(
            "app.services.quest_service._get_own_quest", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = quest
            result = await QuestService._set_status(
                db, quest.id, quest.teacher_id, "published"
            )

        assert quest.status == "published"
        db.commit.assert_called_once()
        assert result is refreshed

    @pytest.mark.asyncio
    async def test_publish_quest_sets_published_status(self):
        quest = _make_quest()
        refreshed = _make_quest(status="published")
        db = _make_db(scalar=refreshed)
        with patch(
            "app.services.quest_service._get_own_quest", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = quest
            result = await QuestService.publish_quest(db, quest.id, quest.teacher_id)

        assert quest.status == "published"
        assert result is refreshed

    @pytest.mark.asyncio
    async def test_archive_quest_sets_archived_status(self):
        quest = _make_quest()
        refreshed = _make_quest(status="archived")
        db = _make_db(scalar=refreshed)
        with patch(
            "app.services.quest_service._get_own_quest", new_callable=AsyncMock
        ) as mock_get:
            mock_get.return_value = quest
            result = await QuestService.archive_quest(db, quest.id, quest.teacher_id)

        assert quest.status == "archived"
        assert result is refreshed
