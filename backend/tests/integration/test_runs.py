import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_and_list_runs(
    client: AsyncClient, teacher_headers: dict, db_resource_set, db_map
):
    create = await client.post(
        "/api/runs/",
        json={
            "resource_set_id": str(db_resource_set.id),
            "map_id": str(db_map.id),
            "max_players": 1,
            "allow_solo_in_team": True,
            "random_teams": False,
        },
        headers=teacher_headers,
    )
    assert create.status_code == 201
    data = create.json()
    assert data["resource_set_id"] == str(db_resource_set.id)
    assert data["status"] == "waiting"
    join_code = data["join_code"]

    list_resp = await client.get("/api/runs/", headers=teacher_headers)
    assert list_resp.status_code == 200
    sessions = list_resp.json()
    assert len(sessions) >= 1
    assert any(s["join_code"] == join_code for s in sessions)


@pytest.mark.asyncio
async def test_join_run_as_guest(
    client: AsyncClient, teacher_headers: dict, db_resource_set, db_map
):
    create = await client.post(
        "/api/runs/",
        json={
            "resource_set_id": str(db_resource_set.id),
            "map_id": str(db_map.id),
            "max_players": 1,
        },
        headers=teacher_headers,
    )
    join_code = create.json()["join_code"]

    join = await client.post(
        "/api/runs/join", json={"join_code": join_code, "guest_name": "TestGuest"}
    )
    assert join.status_code == 200
    player_data = join.json()
    assert player_data["guest_name"] == "TestGuest"
    assert "guest_token" in player_data

    list_resp = await client.get(
        "/api/runs/",
        headers={"Authorization": f"Bearer {player_data['guest_token']}"},
    )
    assert list_resp.status_code in [401, 403]


@pytest.mark.asyncio
async def test_rejoin_run(
    client: AsyncClient, teacher_headers: dict, db_resource_set, db_map
):
    create = await client.post(
        "/api/runs/",
        json={
            "resource_set_id": str(db_resource_set.id),
            "map_id": str(db_map.id),
            "max_players": 1,
        },
        headers=teacher_headers,
    )
    join_code = create.json()["join_code"]

    join = await client.post(
        "/api/runs/join", json={"join_code": join_code, "guest_name": "Rejoiner"}
    )
    token = join.json()["guest_token"]

    rejoin = await client.post(
        "/api/runs/rejoin", json={"join_code": join_code, "guest_token": token}
    )
    assert rejoin.status_code == 200
    assert rejoin.json()["guest_name"] == "Rejoiner"


@pytest.mark.asyncio
async def test_start_run(
    client: AsyncClient, teacher_headers: dict, db_resource_set, db_map
):
    create = await client.post(
        "/api/runs/",
        json={
            "resource_set_id": str(db_resource_set.id),
            "map_id": str(db_map.id),
            "max_players": 1,
        },
        headers=teacher_headers,
    )
    run_id = create.json()["id"]

    start = await client.post(f"/api/runs/{run_id}/start", headers=teacher_headers)
    assert start.status_code == 200
    assert start.json()["status"] == "active"
    assert start.json()["started_at"] is not None


@pytest.mark.asyncio
async def test_player_start_run(
    client: AsyncClient, teacher_headers: dict, db_resource_set, db_map
):
    create = await client.post(
        "/api/runs/",
        json={
            "resource_set_id": str(db_resource_set.id),
            "map_id": str(db_map.id),
            "max_players": 1,
        },
        headers=teacher_headers,
    )
    run_id = create.json()["id"]
    code = create.json()["join_code"]

    join = await client.post(
        "/api/runs/join", json={"join_code": code, "guest_name": "P1"}
    )
    token = join.json()["guest_token"]

    await client.post(f"/api/runs/{run_id}/start", headers=teacher_headers)

    p_start = await client.post(
        f"/api/runs/{run_id}/player-start", headers={"x-guest-token": token}
    )
    assert p_start.status_code == 200


@pytest.mark.asyncio
async def test_teacher_monitor(
    client: AsyncClient, teacher_headers: dict, db_resource_set, db_map
):
    create = await client.post(
        "/api/runs/",
        json={
            "resource_set_id": str(db_resource_set.id),
            "map_id": str(db_map.id),
            "max_players": 1,
        },
        headers=teacher_headers,
    )
    run_id = create.json()["id"]

    monitor = await client.get(f"/api/runs/{run_id}/monitor", headers=teacher_headers)
    assert monitor.status_code == 200
    assert "run" in monitor.json()
    assert "players_progress" in monitor.json()
