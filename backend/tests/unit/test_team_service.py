import uuid
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException

from app.services.team_service import (
    TeamService,
    _team_response,
    _find_or_create_team,
    _find_or_create_team_excluding,
    _cleanup_stale_teams,
    _now,
)
from app.models.session_team import SessionTeam, TeamStatus
from app.models.session_player import SessionPlayer, PlayerStatus
from app.models.game_session import GameSession


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_player(**kw):
    p = MagicMock(spec=SessionPlayer)
    p.id = kw.get("id", uuid.uuid4())
    p.session_id = kw.get("session_id", uuid.uuid4())
    p.team_id = kw.get("team_id", None)
    p.display_name = kw.get("display_name", "Player")
    p.avatar_color = kw.get("avatar_color", "#6366f1")
    p.status = kw.get("status", PlayerStatus.WAITING)
    return p


def _make_team(**kw):
    t = MagicMock(spec=SessionTeam)
    t.id = kw.get("id", uuid.uuid4())
    t.session_id = kw.get("session_id", uuid.uuid4())
    t.status = kw.get("status", TeamStatus.WAITING)
    t.players = kw.get("players", [])
    t.created_at = kw.get("created_at", datetime.now(timezone.utc))
    t.started_at = kw.get("started_at", None)
    t.hint_player_id = kw.get("hint_player_id", None)
    return t


def _make_session(**kw):
    s = MagicMock(spec=GameSession)
    s.id = kw.get("id", uuid.uuid4())
    s.max_players = kw.get("max_players", 2)
    s.allow_solo_in_team = kw.get("allow_solo_in_team", False)
    s.players = kw.get("players", [])
    s.status = kw.get("status", "waiting")
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
    db.delete = AsyncMock()
    db.get = AsyncMock(return_value=None)
    return db


# ---------------------------------------------------------------------------
# _now
# ---------------------------------------------------------------------------

def test_now_is_utc():
    result = _now()
    assert result.tzinfo == timezone.utc


# ---------------------------------------------------------------------------
# _team_response
# ---------------------------------------------------------------------------

class TestTeamResponse:
    def test_maps_team_with_players(self):
        player = _make_player()
        team = _make_team(players=[player])
        resp = _team_response(team)
        assert resp.id == team.id
        assert len(resp.players) == 1
        assert resp.players[0].id == player.id

    def test_maps_empty_players(self):
        team = _make_team(players=[])
        resp = _team_response(team)
        assert resp.players == []


# ---------------------------------------------------------------------------
# _find_or_create_team
# ---------------------------------------------------------------------------

class TestFindOrCreateTeam:
    @pytest.mark.asyncio
    async def test_returns_existing_team_with_open_slot(self):
        team = _make_team(players=[_make_player()])  # 1 player, max is 2
        session = _make_session(max_players=2)
        db = _make_db(scalars=[team])
        result = await _find_or_create_team(db, session)
        assert result is team
        db.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_creates_new_team_when_all_full(self):
        p1 = _make_player()
        p2 = _make_player()
        full_team = _make_team(players=[p1, p2])
        session = _make_session(max_players=2)
        db = _make_db(scalars=[full_team])
        db.flush = AsyncMock()
        result = await _find_or_create_team(db, session)
        db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_creates_new_team_when_none_exist(self):
        session = _make_session(max_players=2)
        db = _make_db(scalars=[])
        db.flush = AsyncMock()
        await _find_or_create_team(db, session)
        db.add.assert_called_once()


# ---------------------------------------------------------------------------
# _cleanup_stale_teams
# ---------------------------------------------------------------------------

class TestCleanupStaleTeams:
    @pytest.mark.asyncio
    async def test_returns_false_when_no_stale_teams(self):
        session = _make_session()
        db = _make_db(scalars=[])
        result = await _cleanup_stale_teams(db, session)
        assert result is False

    @pytest.mark.asyncio
    async def test_deletes_stale_team_with_players(self):
        player = _make_player()
        stale_team = _make_team(players=[player])
        session = _make_session()
        db = _make_db(scalars=[stale_team])
        db.flush = AsyncMock()

        result = await _cleanup_stale_teams(db, session)

        assert result is True
        db.delete.assert_called_with(stale_team)

    @pytest.mark.asyncio
    async def test_deletes_stale_team_without_players(self):
        stale_team = _make_team(players=[])
        session = _make_session()
        db = _make_db(scalars=[stale_team])
        db.flush = AsyncMock()

        result = await _cleanup_stale_teams(db, session)

        assert result is True
        db.delete.assert_called_with(stale_team)


# ---------------------------------------------------------------------------
# TeamService.get_team
# ---------------------------------------------------------------------------

class TestGetTeam:
    @pytest.mark.asyncio
    async def test_raises_403_when_player_not_in_team(self):
        team_id = uuid.uuid4()
        session_id = uuid.uuid4()
        player = _make_player(team_id=uuid.uuid4(), session_id=session_id)
        db = _make_db()
        with pytest.raises(HTTPException) as exc_info:
            await TeamService.get_team(db, session_id, team_id, player)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_raises_403_when_wrong_session(self):
        team_id = uuid.uuid4()
        player = _make_player(team_id=team_id, session_id=uuid.uuid4())
        db = _make_db()
        with pytest.raises(HTTPException) as exc_info:
            await TeamService.get_team(db, uuid.uuid4(), team_id, player)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_raises_404_when_team_not_found(self):
        team_id = uuid.uuid4()
        session_id = uuid.uuid4()
        player = _make_player(team_id=team_id, session_id=session_id)
        db = _make_db(scalar=None)
        with pytest.raises(HTTPException) as exc_info:
            await TeamService.get_team(db, session_id, team_id, player)
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_returns_team_response(self):
        team_id = uuid.uuid4()
        session_id = uuid.uuid4()
        player = _make_player(team_id=team_id, session_id=session_id)
        team = _make_team(id=team_id, session_id=session_id, players=[player])
        db = _make_db(scalar=team)
        result = await TeamService.get_team(db, session_id, team_id, player)
        assert result.id == team_id


# ---------------------------------------------------------------------------
# TeamService.leave_team — error paths
# ---------------------------------------------------------------------------

class TestLeaveTeam:
    @pytest.mark.asyncio
    async def test_raises_403_when_wrong_session(self):
        player = _make_player(session_id=uuid.uuid4())
        db = _make_db()
        with pytest.raises(HTTPException) as exc_info:
            await TeamService.leave_team(db, uuid.uuid4(), player)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_raises_400_when_not_in_team(self):
        session_id = uuid.uuid4()
        player = _make_player(session_id=session_id, team_id=None)
        db = _make_db()
        with pytest.raises(HTTPException) as exc_info:
            await TeamService.leave_team(db, session_id, player)
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    async def test_raises_400_when_team_already_started(self):
        session_id = uuid.uuid4()
        team_id = uuid.uuid4()
        player = _make_player(session_id=session_id, team_id=team_id)
        team = _make_team(id=team_id, status=TeamStatus.ACTIVE)
        db = _make_db(scalar=team)
        with pytest.raises(HTTPException) as exc_info:
            await TeamService.leave_team(db, session_id, player)
        assert exc_info.value.status_code == 400


# ---------------------------------------------------------------------------
# TeamService.start_team — error paths
# ---------------------------------------------------------------------------

class TestStartTeam:
    @pytest.mark.asyncio
    async def test_raises_403_when_player_not_in_team(self):
        team_id = uuid.uuid4()
        session_id = uuid.uuid4()
        player = _make_player(team_id=uuid.uuid4(), session_id=session_id)
        db = _make_db()
        with pytest.raises(HTTPException) as exc_info:
            await TeamService.start_team(db, session_id, team_id, player)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_raises_404_when_team_not_found(self):
        team_id = uuid.uuid4()
        session_id = uuid.uuid4()
        player = _make_player(team_id=team_id, session_id=session_id)
        db = _make_db(scalar=None)
        with pytest.raises(HTTPException) as exc_info:
            await TeamService.start_team(db, session_id, team_id, player)
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_raises_400_when_team_already_started(self):
        team_id = uuid.uuid4()
        session_id = uuid.uuid4()
        player = _make_player(team_id=team_id, session_id=session_id)
        team = _make_team(id=team_id, status=TeamStatus.ACTIVE)
        db = _make_db(scalar=team)
        with pytest.raises(HTTPException) as exc_info:
            await TeamService.start_team(db, session_id, team_id, player)
        assert exc_info.value.status_code == 400
