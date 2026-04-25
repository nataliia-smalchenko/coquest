import uuid
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.websocket_handlers import (
    _iso,
    _progress_dict,
    handle_player_message,
    handle_teacher_message,
)
from app.models.run_progress import RunProgress, ProgressStatus


# ---------------------------------------------------------------------------
# _iso
# ---------------------------------------------------------------------------


class TestIso:
    def test_returns_isoformat_for_datetime(self):
        dt = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        result = _iso(dt)
        assert result == dt.isoformat()

    def test_returns_none_for_none(self):
        assert _iso(None) is None


# ---------------------------------------------------------------------------
# _progress_dict
# ---------------------------------------------------------------------------


class TestProgressDict:
    def _make_progress(self, **kw):
        p = MagicMock(spec=RunProgress)
        p.id = kw.get("id", uuid.uuid4())
        p.session_id = kw.get("session_id", uuid.uuid4())
        p.player_id = kw.get("player_id", uuid.uuid4())
        p.resource_id = kw.get("resource_id", uuid.uuid4())
        p.map_object_id = kw.get("map_object_id", None)
        p.status = kw.get("status", ProgressStatus.ASSIGNED)
        p.score = kw.get("score", None)
        p.answer = kw.get("answer", None)
        p.requires_review = kw.get("requires_review", False)
        p.assigned_at = kw.get("assigned_at", datetime.now(timezone.utc))
        p.completed_at = kw.get("completed_at", None)
        return p

    def test_returns_dict_with_all_fields(self):
        p = self._make_progress()
        result = _progress_dict(p)
        assert "id" in result
        assert "session_id" in result
        assert "player_id" in result
        assert "resource_id" in result
        assert "map_object_id" in result
        assert "status" in result
        assert "score" in result
        assert "answer" in result
        assert "requires_review" in result
        assert "assigned_at" in result
        assert "completed_at" in result

    def test_map_object_id_none_when_missing(self):
        p = self._make_progress(map_object_id=None)
        result = _progress_dict(p)
        assert result["map_object_id"] is None

    def test_status_value_extracted(self):
        p = self._make_progress(status=ProgressStatus.ASSIGNED)
        result = _progress_dict(p)
        assert result["status"] == "assigned"

    def test_completed_at_none(self):
        p = self._make_progress(completed_at=None)
        result = _progress_dict(p)
        assert result["completed_at"] is None


# ---------------------------------------------------------------------------
# handle_player_message — routing
# ---------------------------------------------------------------------------


class TestHandlePlayerMessage:
    @pytest.mark.asyncio
    async def test_routes_submit_answer(self):
        with patch(
            "app.services.websocket_handlers._handle_submit_answer",
            new_callable=AsyncMock,
        ) as mock_handler:
            await handle_player_message(
                "sid",
                "pid",
                {
                    "type": "submit_answer",
                    "progress_id": str(uuid.uuid4()),
                    "answer": {},
                },
            )
        mock_handler.assert_called_once()

    @pytest.mark.asyncio
    async def test_routes_mark_viewed(self):
        with patch(
            "app.services.websocket_handlers._handle_mark_viewed",
            new_callable=AsyncMock,
        ) as mock_handler:
            await handle_player_message(
                "sid", "pid", {"type": "mark_viewed", "progress_id": str(uuid.uuid4())}
            )
        mock_handler.assert_called_once()

    @pytest.mark.asyncio
    async def test_routes_chat_message(self):
        with patch(
            "app.services.websocket_handlers._handle_chat_message",
            new_callable=AsyncMock,
        ) as mock_handler:
            await handle_player_message(
                "sid", "pid", {"type": "chat_message", "message": "hi"}
            )
        mock_handler.assert_called_once()

    @pytest.mark.asyncio
    async def test_sends_error_for_unknown_type(self):
        with patch(
            "app.services.websocket_handlers.manager.send_to_player",
            new_callable=AsyncMock,
        ) as mock_send:
            await handle_player_message("sid", "pid", {"type": "unknown_event"})
        mock_send.assert_called_once()
        call_args = mock_send.call_args[0]
        assert call_args[2]["type"] == "error"

    @pytest.mark.asyncio
    async def test_sends_error_on_handler_exception(self):
        with patch(
            "app.services.websocket_handlers._handle_chat_message",
            new_callable=AsyncMock,
            side_effect=Exception("boom"),
        ):
            with patch(
                "app.services.websocket_handlers.manager.send_to_player",
                new_callable=AsyncMock,
            ) as mock_send:
                await handle_player_message(
                    "sid", "pid", {"type": "chat_message", "message": "x"}
                )

        mock_send.assert_called_once()
        assert mock_send.call_args[0][2]["type"] == "error"


# ---------------------------------------------------------------------------
# handle_teacher_message — routing
# ---------------------------------------------------------------------------


class TestHandleTeacherMessage:
    @pytest.mark.asyncio
    async def test_routes_start_session(self):
        with patch(
            "app.services.websocket_handlers._handle_start_session",
            new_callable=AsyncMock,
        ) as mock_handler:
            await handle_teacher_message("sid", "tid", {"type": "start_session"})
        mock_handler.assert_called_once()

    @pytest.mark.asyncio
    async def test_routes_stop_session(self):
        with patch(
            "app.services.websocket_handlers._handle_stop_session",
            new_callable=AsyncMock,
        ) as mock_handler:
            await handle_teacher_message("sid", "tid", {"type": "stop_session"})
        mock_handler.assert_called_once()

    @pytest.mark.asyncio
    async def test_routes_review_answer(self):
        with patch(
            "app.services.websocket_handlers._handle_review_answer",
            new_callable=AsyncMock,
        ) as mock_handler:
            await handle_teacher_message(
                "sid",
                "tid",
                {
                    "type": "review_answer",
                    "progress_id": str(uuid.uuid4()),
                    "score": 1.0,
                },
            )
        mock_handler.assert_called_once()

    @pytest.mark.asyncio
    async def test_sends_error_for_unknown_type(self):
        with patch(
            "app.services.websocket_handlers.manager.send_to_teacher",
            new_callable=AsyncMock,
        ) as mock_send:
            await handle_teacher_message("sid", "tid", {"type": "unknown_cmd"})
        mock_send.assert_called_once()
        assert mock_send.call_args[0][1]["type"] == "error"

    @pytest.mark.asyncio
    async def test_sends_error_on_handler_exception(self):
        with patch(
            "app.services.websocket_handlers._handle_start_session",
            new_callable=AsyncMock,
            side_effect=Exception("crash"),
        ):
            with patch(
                "app.services.websocket_handlers.manager.send_to_teacher",
                new_callable=AsyncMock,
            ) as mock_send:
                await handle_teacher_message("sid", "tid", {"type": "start_session"})

        mock_send.assert_called_once()
        assert mock_send.call_args[0][1]["type"] == "error"
