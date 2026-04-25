"""Extended integration tests for run routes not covered by test_runs.py."""

import pytest
from httpx import AsyncClient
from unittest.mock import AsyncMock, patch


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_run(client, teacher_headers, quest_id, max_players=1, **extra):
    resp = await client.post(
        "/api/runs/",
        json={"quest_id": str(quest_id), "max_players": max_players, **extra},
        headers=teacher_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _join_run(client, session_code, guest_name="Tester"):
    resp = await client.post(
        "/api/runs/join",
        json={"session_code": session_code, "guest_name": guest_name},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# GET /code/{session_code}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_run_by_code(client: AsyncClient, teacher_headers, db_quest):
    session = await _create_run(client, teacher_headers, db_quest.id)
    code = session["session_code"]

    resp = await client.get(f"/api/runs/code/{code}")
    assert resp.status_code == 200
    assert resp.json()["session_code"] == code


@pytest.mark.asyncio
async def test_get_run_by_code_lowercase(
    client: AsyncClient, teacher_headers, db_quest
):
    session = await _create_run(client, teacher_headers, db_quest.id)
    code = session["session_code"].lower()

    resp = await client.get(f"/api/runs/code/{code}")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_get_run_by_code_not_found(client: AsyncClient):
    resp = await client.get("/api/runs/code/XXXXXX")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /stop
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stop_run(client: AsyncClient, teacher_headers, db_quest):
    with patch("app.routes.runs.manager.broadcast_to_all", new_callable=AsyncMock):
        session = await _create_run(client, teacher_headers, db_quest.id)
        sid = session["id"]

        resp = await client.post(f"/api/runs/{sid}/stop", headers=teacher_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "stopped"


@pytest.mark.asyncio
async def test_stop_run_unauthorized(client: AsyncClient, db_quest, teacher_headers):
    session = await _create_run(client, teacher_headers, db_quest.id)
    sid = session["id"]
    resp = await client.post(f"/api/runs/{sid}/stop")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# PATCH /settings
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_run_settings(client: AsyncClient, teacher_headers, db_quest):
    session = await _create_run(client, teacher_headers, db_quest.id)
    sid = session["id"]

    resp = await client.patch(
        f"/api/runs/{sid}/settings",
        json={"show_feedback_after_answer": False, "show_score_after": False},
        headers=teacher_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["show_feedback_after_answer"] is False
    assert data["show_score_after"] is False


@pytest.mark.asyncio
async def test_update_settings_wrong_teacher(
    client: AsyncClient, teacher_headers, teacher, db_quest, db_session
):
    session = await _create_run(client, teacher_headers, db_quest.id)
    sid = session["id"]

    # Second teacher token
    import uuid
    from app.models.user import User, AuthProvider
    from app.utils.security import get_password_hash, create_access_token

    other = User(
        email=f"other_{uuid.uuid4().hex[:6]}@test.com",
        password_hash=get_password_hash("pass"),
        full_name="Other",
        role="teacher",
        auth_provider=AuthProvider.EMAIL,
        is_email_verified=True,
        preferred_language="uk",
    )
    db_session.add(other)
    await db_session.flush()
    await db_session.refresh(other)
    token = create_access_token(
        {"sub": str(other.id), "email": other.email, "role": other.role}
    )
    other_headers = {"Authorization": f"Bearer {token}"}

    resp = await client.patch(
        f"/api/runs/{sid}/settings",
        json={"max_players": 4},
        headers=other_headers,
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /restart
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_restart_run(client: AsyncClient, teacher_headers, db_quest):
    with patch("app.routes.runs.manager.broadcast_to_all", new_callable=AsyncMock):
        session = await _create_run(client, teacher_headers, db_quest.id)
        sid = session["id"]

        # Stop it first
        await client.post(f"/api/runs/{sid}/stop", headers=teacher_headers)

        # Restart
        resp = await client.post(f"/api/runs/{sid}/restart", headers=teacher_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "waiting"


# ---------------------------------------------------------------------------
# DELETE /{session_id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_run(client: AsyncClient, teacher_headers, db_quest):
    session = await _create_run(client, teacher_headers, db_quest.id)
    sid = session["id"]

    resp = await client.delete(f"/api/runs/{sid}", headers=teacher_headers)
    assert resp.status_code == 204

    # Verify it's gone
    list_resp = await client.get("/api/runs/", headers=teacher_headers)
    ids = [s["id"] for s in list_resp.json()]
    assert sid not in ids


@pytest.mark.asyncio
async def test_delete_active_run_blocked(
    client: AsyncClient, teacher_headers, db_quest
):
    session = await _create_run(client, teacher_headers, db_quest.id)
    sid = session["id"]

    # Start the session to make it ACTIVE
    await client.post(f"/api/runs/{sid}/start", headers=teacher_headers)

    resp = await client.delete(f"/api/runs/{sid}", headers=teacher_headers)
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# GET /{session_id}/game-info
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_game_info(client: AsyncClient, teacher_headers, db_quest):
    session = await _create_run(client, teacher_headers, db_quest.id)
    code = session["session_code"]
    sid = session["id"]

    player = await _join_run(client, code)
    token = player["guest_token"]

    resp = await client.get(
        f"/api/runs/{sid}/game-info",
        headers={"x-guest-token": token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "quest_title" in data or "map_slug" in data or "settings" in data


# ---------------------------------------------------------------------------
# GET /my-progress and /team-progress
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_my_progress_empty(client: AsyncClient, teacher_headers, db_quest):
    session = await _create_run(client, teacher_headers, db_quest.id)
    code = session["session_code"]
    sid = session["id"]

    player = await _join_run(client, code)
    token = player["guest_token"]

    resp = await client.get(
        f"/api/runs/{sid}/my-progress",
        headers={"x-guest-token": token},
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_get_team_progress_empty(client: AsyncClient, teacher_headers, db_quest):
    session = await _create_run(client, teacher_headers, db_quest.id)
    code = session["session_code"]
    sid = session["id"]

    player = await _join_run(client, code)
    token = player["guest_token"]

    resp = await client.get(
        f"/api/runs/{sid}/team-progress",
        headers={"x-guest-token": token},
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


# ---------------------------------------------------------------------------
# PATCH /{session_id}/players/{player_id}/guest-name
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_player_guest_name(client: AsyncClient, teacher_headers, db_quest):
    session = await _create_run(client, teacher_headers, db_quest.id)
    code = session["session_code"]
    sid = session["id"]

    player = await _join_run(client, code, guest_name="OldName")
    pid = player["id"]

    resp = await client.patch(
        f"/api/runs/{sid}/players/{pid}/guest-name",
        json={"guest_name": "NewName"},
        headers=teacher_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["guest_name"] == "NewName"


# ---------------------------------------------------------------------------
# DELETE /{session_id}/players/{player_id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_player(client: AsyncClient, teacher_headers, db_quest):
    session = await _create_run(client, teacher_headers, db_quest.id)
    code = session["session_code"]
    sid = session["id"]

    player = await _join_run(client, code)
    pid = player["id"]

    resp = await client.delete(
        f"/api/runs/{sid}/players/{pid}",
        headers=teacher_headers,
    )
    assert resp.status_code == 204


# ---------------------------------------------------------------------------
# POST /join — edge cases
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_join_requires_guest_name_for_unauthenticated(
    client: AsyncClient, teacher_headers, db_quest
):
    session = await _create_run(client, teacher_headers, db_quest.id)
    code = session["session_code"]

    resp = await client.post(
        "/api/runs/join",
        json={"session_code": code},  # no guest_name
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_join_nonexistent_run(client: AsyncClient):
    resp = await client.post(
        "/api/runs/join",
        json={"session_code": "XXXXXX", "guest_name": "Test"},
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /_guest_token_ required
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_guest_token_required_for_my_progress(
    client: AsyncClient, teacher_headers, db_quest
):
    session = await _create_run(client, teacher_headers, db_quest.id)
    sid = session["id"]
    resp = await client.get(f"/api/runs/{sid}/my-progress")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_invalid_guest_token_rejected(
    client: AsyncClient, teacher_headers, db_quest
):
    session = await _create_run(client, teacher_headers, db_quest.id)
    sid = session["id"]
    resp = await client.get(
        f"/api/runs/{sid}/my-progress",
        headers={"x-guest-token": "totally_invalid_token"},
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /{session_id}/player-timeout
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_player_timeout(client: AsyncClient, teacher_headers, db_quest):
    session = await _create_run(client, teacher_headers, db_quest.id)
    code = session["session_code"]
    sid = session["id"]

    player = await _join_run(client, code)
    token = player["guest_token"]

    # Start session first so player is PLAYING
    await client.post(f"/api/runs/{sid}/start", headers=teacher_headers)

    with patch("app.routes.runs.manager.broadcast_to_all", new_callable=AsyncMock):
        resp = await client.post(
            f"/api/runs/{sid}/player-timeout",
            headers={"x-guest-token": token},
        )
    assert resp.status_code == 204


# ---------------------------------------------------------------------------
# GET /{session_id}/results
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_results_requires_token(client: AsyncClient, teacher_headers, db_quest):
    session = await _create_run(client, teacher_headers, db_quest.id)
    sid = session["id"]
    resp = await client.get(f"/api/runs/{sid}/results")
    assert resp.status_code == 422  # missing required guest_token query param


@pytest.mark.asyncio
async def test_results_invalid_token(client: AsyncClient, teacher_headers, db_quest):
    session = await _create_run(client, teacher_headers, db_quest.id)
    sid = session["id"]
    resp = await client.get(f"/api/runs/{sid}/results?guest_token=invalid")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Scheduled session
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_scheduled_run(client: AsyncClient, teacher_headers, db_quest):
    from datetime import datetime, timedelta, timezone

    future = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    session = await _create_run(
        client,
        teacher_headers,
        db_quest.id,
        scheduled_at=future,
    )
    assert session["status"] == "scheduled"
    assert session["scheduled_at"] is not None
