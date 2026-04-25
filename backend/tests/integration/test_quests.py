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


@pytest.mark.asyncio
async def test_create_quest_with_settings(
    client: AsyncClient, teacher_headers: dict, db_map
):
    """Create a quest with custom settings (time_limit, random_order, max_grade)."""
    response = await client.post(
        "/api/quests/",
        json={
            "map_id": str(db_map.id),
            "title": "Settings Quest",
            "settings": {
                "time_limit_minutes": 15,
                "random_order": True,
                "max_grade": 12,
            },
        },
        headers=teacher_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["settings"]["time_limit_minutes"] == 15
    assert data["settings"]["random_order"] is True
    assert data["settings"]["max_grade"] == 12


@pytest.mark.asyncio
async def test_create_quest_with_resources(
    client: AsyncClient, teacher_headers: dict, db_map
):
    """Create a quest with attached resources."""
    # First create a resource to attach
    res = await client.post(
        "/api/resources/",
        json={"type": "text", "title": "Quest Resource"},
        headers=teacher_headers,
    )
    resource_id = res.json()["id"]

    response = await client.post(
        "/api/quests/",
        json={
            "map_id": str(db_map.id),
            "title": "Resource Quest",
            "resources": [
                {"resource_id": resource_id, "order_index": 0},
            ],
        },
        headers=teacher_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert len(data["resources"]) == 1
    assert data["resources"][0]["resource_id"] == resource_id
    assert data["resources"][0]["order_index"] == 0


@pytest.mark.asyncio
async def test_update_quest_description(
    client: AsyncClient, teacher_headers: dict, db_map
):
    """Update a quest's description via the same language."""
    create = await client.post(
        "/api/quests/",
        json={
            "map_id": str(db_map.id),
            "title": "Describable",
            "description": "Old desc",
            "language": "uk",
        },
        headers=teacher_headers,
    )
    quest_id = create.json()["id"]

    update = await client.put(
        f"/api/quests/{quest_id}",
        json={"description": "New desc", "language": "uk"},
        headers=teacher_headers,
    )
    assert update.status_code == 200
    tr = update.json()["translations"][0]
    assert tr["description"] == "New desc"
    # Title should remain unchanged
    assert tr["title"] == "Describable"


@pytest.mark.asyncio
async def test_update_quest_settings(
    client: AsyncClient, teacher_headers: dict, db_map
):
    """Update quest settings."""
    create = await client.post(
        "/api/quests/",
        json={"map_id": str(db_map.id), "title": "Settable"},
        headers=teacher_headers,
    )
    quest_id = create.json()["id"]

    update = await client.put(
        f"/api/quests/{quest_id}",
        json={"settings": {"time_limit_minutes": 30, "random_order": True}},
        headers=teacher_headers,
    )
    assert update.status_code == 200
    assert update.json()["settings"]["time_limit_minutes"] == 30
    assert update.json()["settings"]["random_order"] is True


@pytest.mark.asyncio
async def test_update_quest_resources(
    client: AsyncClient, teacher_headers: dict, db_map
):
    """Update quest by replacing its resources."""
    # Create two resources
    r1 = await client.post(
        "/api/resources/",
        json={"type": "text", "title": "R1"},
        headers=teacher_headers,
    )
    r2 = await client.post(
        "/api/resources/",
        json={"type": "text", "title": "R2"},
        headers=teacher_headers,
    )
    rid1 = r1.json()["id"]
    rid2 = r2.json()["id"]

    # Create quest with r1
    create = await client.post(
        "/api/quests/",
        json={
            "map_id": str(db_map.id),
            "title": "Replaceable",
            "resources": [{"resource_id": rid1, "order_index": 0}],
        },
        headers=teacher_headers,
    )
    quest_id = create.json()["id"]
    assert len(create.json()["resources"]) == 1

    # Replace resources with r2
    update = await client.put(
        f"/api/quests/{quest_id}",
        json={
            "resources": [
                {"resource_id": rid2, "order_index": 0},
            ],
        },
        headers=teacher_headers,
    )
    assert update.status_code == 200

    # Re-fetch to get fresh data
    get = await client.get(f"/api/quests/{quest_id}", headers=teacher_headers)
    updated_resources = get.json()["resources"]
    assert len(updated_resources) == 1
    assert updated_resources[0]["resource_id"] == rid2


@pytest.mark.asyncio
async def test_delete_quest(client: AsyncClient, teacher_headers: dict, db_map):
    create = await client.post(
        "/api/quests/",
        json={"map_id": str(db_map.id), "title": "To Delete"},
        headers=teacher_headers,
    )
    quest_id = create.json()["id"]

    delete = await client.delete(f"/api/quests/{quest_id}", headers=teacher_headers)
    assert delete.status_code == 204

    # Confirm it's gone
    get = await client.get(f"/api/quests/{quest_id}", headers=teacher_headers)
    assert get.status_code == 404


@pytest.mark.asyncio
async def test_get_nonexistent_quest(client: AsyncClient, teacher_headers: dict):
    import uuid

    fake_id = str(uuid.uuid4())
    response = await client.get(f"/api/quests/{fake_id}", headers=teacher_headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_quests_isolated_between_teachers(
    client: AsyncClient, teacher_headers: dict, db_map, db_session
):
    """Teacher B should not see Teacher A's quests."""
    from tests.conftest import _create_verified_user, _token_for

    # Create quest as teacher A
    await client.post(
        "/api/quests/",
        json={"map_id": str(db_map.id), "title": "Secret Quest"},
        headers=teacher_headers,
    )

    # Create teacher B
    teacher_b = await _create_verified_user(
        db_session,
        email=f"teacher_b_{__import__('uuid').uuid4().hex[:8]}@test.com",
        role="teacher",
        full_name="Teacher B",
    )
    headers_b = {"Authorization": f"Bearer {_token_for(teacher_b)}"}

    # Teacher B lists quests — should be empty
    response = await client.get("/api/quests/", headers=headers_b)
    assert response.status_code == 200
    assert len(response.json()) == 0
