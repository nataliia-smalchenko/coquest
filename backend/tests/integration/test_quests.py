import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_quest(client: AsyncClient, teacher_headers: dict, db_map):
    response = await client.post(
        "/api/quests/",
        json={
            "map_id": str(db_map.id),
            "title": "First Quest",
            "description": "This is a test quest",
            "language": "uk",
        },
        headers=teacher_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "draft"
    assert data["map_id"] == str(db_map.id)
    assert data["translations"][0]["title"] == "First Quest"


@pytest.mark.asyncio
async def test_list_quests(client: AsyncClient, teacher_headers: dict, db_map):
    # Create one quest
    await client.post(
        "/api/quests/",
        json={"map_id": str(db_map.id), "title": "List Me", "language": "en"},
        headers=teacher_headers,
    )

    response = await client.get("/api/quests/", headers=teacher_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert any(q["title"] == "List Me" for q in data)


@pytest.mark.asyncio
async def test_get_quest(client: AsyncClient, teacher_headers: dict, db_map):
    create = await client.post(
        "/api/quests/",
        json={"map_id": str(db_map.id), "title": "Get Me"},
        headers=teacher_headers,
    )
    quest_id = create.json()["id"]

    response = await client.get(f"/api/quests/{quest_id}", headers=teacher_headers)
    assert response.status_code == 200
    assert response.json()["id"] == quest_id


@pytest.mark.asyncio
async def test_update_quest(client: AsyncClient, teacher_headers: dict, db_map):
    create = await client.post(
        "/api/quests/",
        json={"map_id": str(db_map.id), "title": "Old"},
        headers=teacher_headers,
    )
    quest_id = create.json()["id"]

    update = await client.put(
        f"/api/quests/{quest_id}", json={"title": "New"}, headers=teacher_headers
    )
    assert update.status_code == 200

    get = await client.get(f"/api/quests/{quest_id}", headers=teacher_headers)
    # Check that translation was updated
    assert get.json()["translations"][0]["title"] == "New"


@pytest.mark.asyncio
async def test_quest_publish_and_archive(
    client: AsyncClient, teacher_headers: dict, db_map
):
    create = await client.post(
        "/api/quests/",
        json={"map_id": str(db_map.id), "title": "Status Test"},
        headers=teacher_headers,
    )
    quest_id = create.json()["id"]

    publish = await client.post(
        f"/api/quests/{quest_id}/publish", headers=teacher_headers
    )
    assert publish.status_code == 200
    assert publish.json()["status"] == "published"

    archive = await client.post(
        f"/api/quests/{quest_id}/archive", headers=teacher_headers
    )
    assert archive.status_code == 200
    assert archive.json()["status"] == "archived"


@pytest.mark.asyncio
async def test_student_cannot_access_quests(client: AsyncClient, student_headers: dict):
    response = await client.get("/api/quests/", headers=student_headers)
    assert response.status_code == 403
