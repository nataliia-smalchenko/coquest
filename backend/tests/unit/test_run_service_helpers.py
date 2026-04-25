import uuid
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException

from app.services.run_service import (
    _now,
    _maybe_expire_run,
    _player_response,
    _run_response,
    _load_run,
    _load_own_run,
    RunService,
)
from app.models.game_run import GameRun, RunStatus
from app.models.run_player import RunPlayer, PlayerStatus


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_player(**kw):
    p = MagicMock(spec=RunPlayer)
    p.id = kw.get("id", uuid.uuid4())
    p.run_id = kw.get("run_id", uuid.uuid4())
    p.user_id = kw.get("user_id", None)
    p.guest_name = kw.get("guest_name", "Guest")
    p.display_name = kw.get("display_name", "Guest")
    p.avatar_color = kw.get("avatar_color", "#6366f1")
    p.status = kw.get("status", PlayerStatus.WAITING)
    p.joined_at = kw.get("joined_at", datetime.now(timezone.utc))
    p.started_at = kw.get("started_at", None)
    p.finished_at = kw.get("finished_at", None)
    p.guest_token = kw.get("guest_token", "tok")
    p.team_id = kw.get("team_id", None)
    return p


def _make_run(**kw):
    s = MagicMock(spec=GameRun)
    s.id = kw.get("id", uuid.uuid4())
    s.quest_id = kw.get("quest_id", uuid.uuid4())
    s.teacher_id = kw.get("teacher_id", uuid.uuid4())
    s.join_code = kw.get("join_code", "ABC123")
    s.name = kw.get("name", "Test Session")
    s.status = kw.get("status", RunStatus.WAITING)
    s.started_at = kw.get("started_at", None)
    s.ends_at = kw.get("ends_at", None)
    s.scheduled_at = kw.get("scheduled_at", None)
    s.max_players = kw.get("max_players", 1)
    s.allow_solo_in_team = kw.get("allow_solo_in_team", True)
    s.random_teams = kw.get("random_teams", False)
    s.show_feedback_after_answer = kw.get("show_feedback_after_answer", True)
    s.show_score_after = kw.get("show_score_after", True)
    s.show_correct_answers = kw.get("show_correct_answers", True)
    s.keep_completed_in_materials = kw.get("keep_completed_in_materials", True)
    s.allow_change_answers = kw.get("allow_change_answers", False)
    s.created_at = kw.get("created_at", datetime.now(timezone.utc))
    s.players = kw.get("players", [])
    return s


def _exec(scalar=None, scalars=None):
    r = MagicMock()
    r.scalar_one_or_none.return_value = scalar
    r.scalar_one.return_value = scalar
    if scalars is not None:
        r.scalars.return_value.all.return_value = scalars
    return r


def _make_db(scalar=None, scalars=None):
    db = AsyncMock()
    db.execute.return_value = _exec(scalar=scalar, scalars=scalars)
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()
    return db


# ---------------------------------------------------------------------------
# _now
# ---------------------------------------------------------------------------


def test_now_is_utc_aware():
    result = _now()
    assert result.tzinfo is not None
    assert result.tzinfo == timezone.utc


# ---------------------------------------------------------------------------
# _maybe_expire_run
# ---------------------------------------------------------------------------


class TestMaybeExpireSession:
    @pytest.mark.asyncio
    async def test_no_op_when_not_active(self):
        run = _make_run(status=RunStatus.STOPPED)
        db = _make_db()
        result = await _maybe_expire_run(db, run)
        assert result is False
        db.flush.assert_not_called()

    @pytest.mark.asyncio
    async def test_no_op_when_ends_at_is_none(self):
        run = _make_run(status=RunStatus.ACTIVE, ends_at=None)
        db = _make_db()
        result = await _maybe_expire_run(db, run)
        assert result is False

    @pytest.mark.asyncio
    async def test_no_op_when_not_expired_yet(self):
        run = _make_run(
            status=RunStatus.ACTIVE,
            ends_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )
        db = _make_db()
        result = await _maybe_expire_run(db, run)
        assert result is False

    @pytest.mark.asyncio
    async def test_expires_session_when_past_ends_at(self):
        player = _make_player(status=PlayerStatus.PLAYING)
        run = _make_run(
            status=RunStatus.ACTIVE,
            ends_at=datetime.now(timezone.utc) - timedelta(hours=1),
            players=[player],
        )
        db = _make_db()
        # Simulate acquiring the FOR UPDATE SKIP LOCKED lock
        lock_exec = MagicMock()
        lock_exec.scalar_one_or_none.return_value = run.id
        db.execute.return_value = lock_exec
        result = await _maybe_expire_run(db, run)
        assert result is True
        assert run.status == RunStatus.STOPPED
        assert player.status == PlayerStatus.FINISHED
        assert player.results_available_until is not None
        db.flush.assert_called_once()

    @pytest.mark.asyncio
    async def test_already_finished_player_not_modified(self):
        player = _make_player(status=PlayerStatus.FINISHED)
        run = _make_run(
            status=RunStatus.ACTIVE,
            ends_at=datetime.now(timezone.utc) - timedelta(hours=1),
            players=[player],
        )
        player.finished_at = datetime.now(timezone.utc) - timedelta(minutes=10)
        db = _make_db()
        await _maybe_expire_run(db, run)
        # Status should remain FINISHED, not changed again
        assert player.status == PlayerStatus.FINISHED


# ---------------------------------------------------------------------------
# _player_response
# ---------------------------------------------------------------------------


class TestPlayerResponse:
    def test_maps_all_fields(self):
        player = _make_player()
        resp = _player_response(player)
        assert resp.id == player.id
        assert resp.run_id == player.run_id
        assert resp.display_name == player.display_name
        assert resp.guest_token == player.guest_token

    def test_optional_fields_are_none(self):
        player = _make_player(started_at=None, finished_at=None, team_id=None)
        resp = _player_response(player)
        assert resp.started_at is None
        assert resp.finished_at is None
        assert resp.team_id is None


# ---------------------------------------------------------------------------
# _run_response
# ---------------------------------------------------------------------------


class TestSessionResponse:
    def test_maps_all_fields(self):
        player = _make_player()
        run = _make_run(players=[player])
        resp = _run_response(run)
        assert resp.id == run.id
        assert resp.join_code == run.join_code
        assert len(resp.players) == 1

    def test_empty_players(self):
        run = _make_run(players=[])
        resp = _run_response(run)
        assert resp.players == []


# ---------------------------------------------------------------------------
# _load_run
# ---------------------------------------------------------------------------


class TestLoadSession:
    @pytest.mark.asyncio
    async def test_returns_session(self):
        run = _make_run()
        db = _make_db(scalar=run)
        result = await _load_run(db, run.id)
        assert result is run

    @pytest.mark.asyncio
    async def test_raises_404_when_not_found(self):
        db = _make_db(scalar=None)
        with pytest.raises(HTTPException) as exc_info:
            await _load_run(db, uuid.uuid4())
        assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# _load_own_run
# ---------------------------------------------------------------------------


class TestLoadOwnSession:
    @pytest.mark.asyncio
    async def test_returns_own_session(self):
        teacher_id = uuid.uuid4()
        run = _make_run(teacher_id=teacher_id)
        db = _make_db(scalar=run)
        result = await _load_own_run(db, run.id, teacher_id)
        assert result is run

    @pytest.mark.asyncio
    async def test_raises_403_for_other_teacher(self):
        run = _make_run(teacher_id=uuid.uuid4())
        db = _make_db(scalar=run)
        with pytest.raises(HTTPException) as exc_info:
            await _load_own_run(db, run.id, uuid.uuid4())
        assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# RunService.get_player_by_token
# ---------------------------------------------------------------------------


class TestGetPlayerByToken:
    @pytest.mark.asyncio
    async def test_returns_player(self):
        player = _make_player()
        db = _make_db(scalar=player)
        result = await RunService.get_player_by_token(db, "some_token")
        assert result is player

    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(self):
        db = _make_db(scalar=None)
        result = await RunService.get_player_by_token(db, "bad_token")
        assert result is None


# ---------------------------------------------------------------------------
# RunService.get_session_by_code
# ---------------------------------------------------------------------------


class TestGetSessionByCode:
    @pytest.mark.asyncio
    async def test_returns_run_response(self):
        run = _make_run(join_code="ABC123")
        db = _make_db(scalar=run)
        result = await RunService.get_session_by_code(db, "abc123")
        assert result.join_code == "ABC123"

    @pytest.mark.asyncio
    async def test_uppercases_code(self):
        run = _make_run(join_code="XYZ789")
        db = _make_db(scalar=run)
        result = await RunService.get_session_by_code(db, "xyz789")
        assert result.join_code == "XYZ789"

    @pytest.mark.asyncio
    async def test_raises_404_when_not_found(self):
        db = _make_db(scalar=None)
        with pytest.raises(HTTPException) as exc_info:
            await RunService.get_session_by_code(db, "NOPE00")
        assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# RunService.list_runs
# ---------------------------------------------------------------------------


class TestListSessions:
    @pytest.mark.asyncio
    async def test_returns_empty_list(self):
        db = _make_db(scalars=[])
        result = await RunService.list_runs(db, uuid.uuid4())
        assert result == []

    @pytest.mark.asyncio
    async def test_returns_session_items(self):
        run = _make_run()
        db = _make_db(scalars=[run])
        result = await RunService.list_runs(db, uuid.uuid4())
        assert len(result) == 1
        assert result[0].join_code == run.join_code

    @pytest.mark.asyncio
    async def test_commits_when_session_expired(self):
        run = _make_run(
            status=RunStatus.ACTIVE,
            ends_at=datetime.now(timezone.utc) - timedelta(hours=1),
            players=[],
        )
        # First call: list query returns sessions
        # Second call: FOR UPDATE SKIP LOCKED lock — non-None means lock acquired
        list_exec = _exec(scalars=[run])
        lock_exec = MagicMock()
        lock_exec.scalar_one_or_none.return_value = run.id
        db = _make_db()
        db.execute.side_effect = [list_exec, lock_exec]
        await RunService.list_runs(db, uuid.uuid4())
        db.commit.assert_called_once()


# ---------------------------------------------------------------------------
# RunService.create_run — error paths
# ---------------------------------------------------------------------------


class TestCreateSession:
    @pytest.mark.asyncio
    async def test_raises_404_when_quest_not_found(self):
        db = _make_db(scalar=None)

        from app.schemas.run import RunCreate

        data = MagicMock(spec=RunCreate)
        data.quest_id = uuid.uuid4()

        with pytest.raises(HTTPException) as exc_info:
            await RunService.create_run(db, uuid.uuid4(), data)
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_raises_400_when_quest_not_published(self):
        quest = MagicMock()
        quest.status = "draft"
        db = _make_db(scalar=quest)

        from app.schemas.run import RunCreate

        data = MagicMock(spec=RunCreate)
        data.quest_id = uuid.uuid4()

        with pytest.raises(HTTPException) as exc_info:
            await RunService.create_run(db, uuid.uuid4(), data)
        assert exc_info.value.status_code == 400
        assert "published" in exc_info.value.detail


# ---------------------------------------------------------------------------
# RunService.player_start_run — error path
# ---------------------------------------------------------------------------


class TestPlayerStartSession:
    @pytest.mark.asyncio
    async def test_raises_403_when_wrong_session(self):
        player = _make_player(run_id=uuid.uuid4())
        db = _make_db()
        with pytest.raises(HTTPException) as exc_info:
            await RunService.player_start_run(db, uuid.uuid4(), player)
        assert exc_info.value.status_code == 403
