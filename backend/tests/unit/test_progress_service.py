import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.progress_service import _auto_score, _now, ProgressService
from app.models.run_progress import RunProgress, ProgressStatus
from app.models.run_player import RunPlayer, PlayerStatus


# ---------------------------------------------------------------------------
# _now
# ---------------------------------------------------------------------------

def test_now_returns_aware_datetime():
    from datetime import timezone
    result = _now()
    assert result.tzinfo is not None
    assert result.tzinfo == timezone.utc


# ---------------------------------------------------------------------------
# _auto_score
# ---------------------------------------------------------------------------

class TestAutoScore:
    def _make_question(self, q_type, options=None, correct_answers=None):
        q = MagicMock()
        q.question_type = q_type
        q.options = options or []
        q.correct_answers = correct_answers or []
        return q

    # --- single ---
    def test_single_correct(self):
        question = self._make_question("single", options=[
            {"id": "a", "is_correct": True},
            {"id": "b", "is_correct": False},
        ])
        score, requires_review = _auto_score(question, {"option_id": "a"})
        assert score == 1.0
        assert requires_review is False

    def test_single_incorrect(self):
        question = self._make_question("single", options=[
            {"id": "a", "is_correct": True},
            {"id": "b", "is_correct": False},
        ])
        score, requires_review = _auto_score(question, {"option_id": "b"})
        assert score == 0.0
        assert requires_review is False

    def test_single_empty_answer(self):
        question = self._make_question("single", options=[
            {"id": "a", "is_correct": True},
        ])
        score, _ = _auto_score(question, {})
        assert score == 0.0

    # --- multiple ---
    def test_multiple_all_correct(self):
        question = self._make_question("multiple", options=[
            {"id": "a", "is_correct": True},
            {"id": "b", "is_correct": True},
            {"id": "c", "is_correct": False},
        ])
        score, requires_review = _auto_score(question, {"option_ids": ["a", "b"]})
        assert score == 1.0
        assert requires_review is False

    def test_multiple_partial_correct(self):
        question = self._make_question("multiple", options=[
            {"id": "a", "is_correct": True},
            {"id": "b", "is_correct": True},
            {"id": "c", "is_correct": False},
        ])
        score, _ = _auto_score(question, {"option_ids": ["a"]})
        assert 0.0 < score < 1.0

    def test_multiple_wrong_selection(self):
        question = self._make_question("multiple", options=[
            {"id": "a", "is_correct": True},
            {"id": "b", "is_correct": False},
        ])
        score, _ = _auto_score(question, {"option_ids": ["b"]})
        assert score == 0.0

    def test_multiple_no_correct_answers_returns_zero(self):
        question = self._make_question("multiple", options=[
            {"id": "a", "is_correct": False},
        ])
        score, _ = _auto_score(question, {"option_ids": ["a"]})
        assert score == 0.0

    def test_multiple_mixed_correct_and_wrong(self):
        question = self._make_question("multiple", options=[
            {"id": "a", "is_correct": True},
            {"id": "b", "is_correct": True},
            {"id": "c", "is_correct": False},
        ])
        # Selects one correct + one wrong → penalized
        score, _ = _auto_score(question, {"option_ids": ["a", "c"]})
        assert score == 0.0  # max(0, (1-1)/2) = 0

    # --- short ---
    def test_short_correct(self):
        question = self._make_question("short", correct_answers=["Paris"])
        score, requires_review = _auto_score(question, {"text": "Paris"})
        assert score == 1.0
        assert requires_review is False

    def test_short_case_insensitive(self):
        question = self._make_question("short", correct_answers=["Paris"])
        score, _ = _auto_score(question, {"text": "paris"})
        assert score == 1.0

    def test_short_wrong(self):
        question = self._make_question("short", correct_answers=["Paris"])
        score, _ = _auto_score(question, {"text": "London"})
        assert score == 0.0

    def test_short_strips_whitespace(self):
        question = self._make_question("short", correct_answers=["Paris"])
        score, _ = _auto_score(question, {"text": "  Paris  "})
        assert score == 1.0

    # --- open ---
    def test_open_requires_review(self):
        question = self._make_question("open")
        score, requires_review = _auto_score(question, {"text": "some answer"})
        assert score is None
        assert requires_review is True

    # --- unknown type ---
    def test_unknown_type_returns_none(self):
        question = self._make_question("essay")
        score, requires_review = _auto_score(question, {})
        assert score is None
        assert requires_review is False


# ---------------------------------------------------------------------------
# ProgressService.get_player_visible_progress
# ---------------------------------------------------------------------------

class TestGetPlayerVisibleProgress:
    @pytest.mark.asyncio
    async def test_returns_progress_with_map_object(self):
        prog = MagicMock(spec=RunProgress)
        prog.map_object_id = uuid.uuid4()

        exec_result = MagicMock()
        exec_result.scalars.return_value.all.return_value = [prog]

        db = AsyncMock()
        db.execute.return_value = exec_result

        session_id = uuid.uuid4()
        player_id = uuid.uuid4()
        result = await ProgressService.get_player_visible_progress(db, session_id, player_id)

        assert result == [prog]
        db.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_returns_empty_when_none(self):
        exec_result = MagicMock()
        exec_result.scalars.return_value.all.return_value = []

        db = AsyncMock()
        db.execute.return_value = exec_result

        result = await ProgressService.get_player_visible_progress(
            db, uuid.uuid4(), uuid.uuid4()
        )
        assert result == []
