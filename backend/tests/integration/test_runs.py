import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_create_and_list_runs(client: AsyncClient, teacher_headers: dict, db_quest):
    # Create the session
    create = await client.post(
        "/api/runs/",
        json={
            "quest_id": str(db_quest.id),
            "max_players": 1,
            "allow_solo_in_team": True,
            "random_teams": False
        },
        headers=teacher_headers
    )
    assert create.status_code == 201
    data = create.json()
    assert data["quest_id"] == str(db_quest.id)
    assert data["status"] == "waiting"
    session_code = data["session_code"]
    
    # List sessions
    list_resp = await client.get("/api/runs/", headers=teacher_headers)
    assert list_resp.status_code == 200
    sessions = list_resp.json()
    assert len(sessions) >= 1
    assert any(s["session_code"] == session_code for s in sessions)

@pytest.mark.asyncio
async def test_join_run_as_guest(client: AsyncClient, teacher_headers: dict, db_quest):
    # Teacher creates session
    create = await client.post(
        "/api/runs/",
        json={"quest_id": str(db_quest.id), "max_players": 1},
        headers=teacher_headers
    )
    session_code = create.json()["session_code"]

    # Student joins via code
    join = await client.post(
        "/api/runs/join",
        json={"session_code": session_code, "guest_name": "TestGuest"}
    )
    assert join.status_code == 200
    player_data = join.json()
    assert player_data["guest_name"] == "TestGuest"
    assert "guest_token" in player_data
    
    # Check that player cannot use the teacher endpoints
    list_resp = await client.get("/api/runs/", headers={"Authorization": f"Bearer {player_data['guest_token']}"})
    # Since guest_token is not a JWT, it will be 401 unauthenticated for the teacher endpoint
    assert list_resp.status_code in [401, 403]

@pytest.mark.asyncio
async def test_rejoin_run(client: AsyncClient, teacher_headers: dict, db_quest):
    # Teacher creates session
    create = await client.post(
        "/api/runs/",
        json={"quest_id": str(db_quest.id), "max_players": 1},
        headers=teacher_headers
    )
    session_code = create.json()["session_code"]

    # Join
    join = await client.post(
        "/api/runs/join",
        json={"session_code": session_code, "guest_name": "Rejoiner"}
    )
    token = join.json()["guest_token"]
    
    # Rejoin
    rejoin = await client.post(
        "/api/runs/rejoin",
        json={"session_code": session_code, "guest_token": token}
    )
    assert rejoin.status_code == 200
    assert rejoin.json()["guest_name"] == "Rejoiner"

@pytest.mark.asyncio
async def test_start_run(client: AsyncClient, teacher_headers: dict, db_quest):
    # Create
    create = await client.post("/api/runs/", json={"quest_id": str(db_quest.id), "max_players": 1}, headers=teacher_headers)
    session_id = create.json()["id"]

    # Start
    start = await client.post(f"/api/runs/{session_id}/start", headers=teacher_headers)
    assert start.status_code == 200
    assert start.json()["status"] == "active"
    assert start.json()["started_at"] is not None

@pytest.mark.asyncio
async def test_player_start_run(client: AsyncClient, teacher_headers: dict, db_quest):
    create = await client.post("/api/runs/", json={"quest_id": str(db_quest.id), "max_players": 1}, headers=teacher_headers)
    session_id = create.json()["id"]
    code = create.json()["session_code"]

    # Player joins
    join = await client.post("/api/runs/join", json={"session_code": code, "guest_name": "P1"})
    token = join.json()["guest_token"]

    # Teacher starts session
    await client.post(f"/api/runs/{session_id}/start", headers=teacher_headers)

    # Player calls player-start
    # They should send the guest_token in headers as x-guest-token or query param
    p_start = await client.post(f"/api/runs/{session_id}/player-start", headers={"x-guest-token": token})
    assert p_start.status_code == 200
    
@pytest.mark.asyncio
async def test_teacher_monitor(client: AsyncClient, teacher_headers: dict, db_quest):
    create = await client.post("/api/runs/", json={"quest_id": str(db_quest.id), "max_players": 1}, headers=teacher_headers)
    session_id = create.json()["id"]

    # Call monitor
    monitor = await client.get(f"/api/runs/{session_id}/monitor", headers=teacher_headers)
    assert monitor.status_code == 200
    assert "session" in monitor.json()
    assert "players_progress" in monitor.json()
