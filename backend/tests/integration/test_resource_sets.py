import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_resource_set(client: AsyncClient, teacher_headers: dict):
    response = await client.post(
        "/api/resource-sets/",
        json={
            "title": "First Resource Set",
            "description": "This is a test resource set",
            "language": "uk",
        },
        headers=teacher_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "draft"
    assert data["translations"][0]["title"] == "First Resource Set"


@pytest.mark.asyncio
async def test_list_resource_sets(client: AsyncClient, teacher_headers: dict):
    await client.post(
        "/api/resource-sets/",
        json={"title": "List Me", "language": "en"},
        headers=teacher_headers,
    )

    response = await client.get("/api/resource-sets/", headers=teacher_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert any(rs["title"] == "List Me" for rs in data)


@pytest.mark.asyncio
async def test_get_resource_set(client: AsyncClient, teacher_headers: dict):
    create = await client.post(
        "/api/resource-sets/",
        json={"title": "Get Me"},
        headers=teacher_headers,
    )
    rs_id = create.json()["id"]

    response = await client.get(f"/api/resource-sets/{rs_id}", headers=teacher_headers)
    assert response.status_code == 200
    assert response.json()["id"] == rs_id


@pytest.mark.asyncio
async def test_update_resource_set(client: AsyncClient, teacher_headers: dict):
    create = await client.post(
        "/api/resource-sets/",
        json={"title": "Old"},
        headers=teacher_headers,
    )
    rs_id = create.json()["id"]

    update = await client.put(
        f"/api/resource-sets/{rs_id}", json={"title": "New"}, headers=teacher_headers
    )
    assert update.status_code == 200

    get = await client.get(f"/api/resource-sets/{rs_id}", headers=teacher_headers)
    assert get.json()["translations"][0]["title"] == "New"


@pytest.mark.asyncio
async def test_resource_set_publish_and_archive(
    client: AsyncClient, teacher_headers: dict
):
    create = await client.post(
        "/api/resource-sets/",
        json={"title": "Status Test"},
        headers=teacher_headers,
    )
    rs_id = create.json()["id"]

    publish = await client.post(
        f"/api/resource-sets/{rs_id}/publish", headers=teacher_headers
    )
    assert publish.status_code == 200
    assert publish.json()["status"] == "published"

    archive = await client.post(
        f"/api/resource-sets/{rs_id}/archive", headers=teacher_headers
    )
    assert archive.status_code == 200
    assert archive.json()["status"] == "archived"


@pytest.mark.asyncio
async def test_student_cannot_access_resource_sets(
    client: AsyncClient, student_headers: dict
):
    response = await client.get("/api/resource-sets/", headers=student_headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_create_resource_set_with_settings(
    client: AsyncClient, teacher_headers: dict
):
    response = await client.post(
        "/api/resource-sets/",
        json={
            "title": "Settings Set",
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
async def test_create_resource_set_with_resources(
    client: AsyncClient, teacher_headers: dict
):
    res = await client.post(
        "/api/resources/",
        json={"type": "text", "title": "Set Resource"},
        headers=teacher_headers,
    )
    resource_id = res.json()["id"]

    response = await client.post(
        "/api/resource-sets/",
        json={
            "title": "Resource Set",
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
async def test_update_resource_set_description(
    client: AsyncClient, teacher_headers: dict
):
    create = await client.post(
        "/api/resource-sets/",
        json={
            "title": "Describable",
            "description": "Old desc",
            "language": "uk",
        },
        headers=teacher_headers,
    )
    rs_id = create.json()["id"]

    update = await client.put(
        f"/api/resource-sets/{rs_id}",
        json={"description": "New desc", "language": "uk"},
        headers=teacher_headers,
    )
    assert update.status_code == 200
    tr = update.json()["translations"][0]
    assert tr["description"] == "New desc"
    assert tr["title"] == "Describable"


@pytest.mark.asyncio
async def test_update_resource_set_settings(client: AsyncClient, teacher_headers: dict):
    create = await client.post(
        "/api/resource-sets/",
        json={"title": "Settable"},
        headers=teacher_headers,
    )
    rs_id = create.json()["id"]

    update = await client.put(
        f"/api/resource-sets/{rs_id}",
        json={"settings": {"time_limit_minutes": 30, "random_order": True}},
        headers=teacher_headers,
    )
    assert update.status_code == 200
    assert update.json()["settings"]["time_limit_minutes"] == 30
    assert update.json()["settings"]["random_order"] is True


@pytest.mark.asyncio
async def test_update_resource_set_resources(
    client: AsyncClient, teacher_headers: dict
):
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

    create = await client.post(
        "/api/resource-sets/",
        json={
            "title": "Replaceable",
            "resources": [{"resource_id": rid1, "order_index": 0}],
        },
        headers=teacher_headers,
    )
    rs_id = create.json()["id"]
    assert len(create.json()["resources"]) == 1

    update = await client.put(
        f"/api/resource-sets/{rs_id}",
        json={
            "resources": [
                {"resource_id": rid2, "order_index": 0},
            ],
        },
        headers=teacher_headers,
    )
    assert update.status_code == 200

    get = await client.get(f"/api/resource-sets/{rs_id}", headers=teacher_headers)
    updated_resources = get.json()["resources"]
    assert len(updated_resources) == 1
    assert updated_resources[0]["resource_id"] == rid2


@pytest.mark.asyncio
async def test_delete_resource_set(client: AsyncClient, teacher_headers: dict):
    create = await client.post(
        "/api/resource-sets/",
        json={"title": "To Delete"},
        headers=teacher_headers,
    )
    rs_id = create.json()["id"]

    delete = await client.delete(f"/api/resource-sets/{rs_id}", headers=teacher_headers)
    assert delete.status_code == 204

    get = await client.get(f"/api/resource-sets/{rs_id}", headers=teacher_headers)
    assert get.status_code == 404


@pytest.mark.asyncio
async def test_get_nonexistent_resource_set(client: AsyncClient, teacher_headers: dict):
    import uuid

    fake_id = str(uuid.uuid4())
    response = await client.get(
        f"/api/resource-sets/{fake_id}", headers=teacher_headers
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_resource_sets_isolated_between_teachers(
    client: AsyncClient, teacher_headers: dict, db_session
):
    from tests.conftest import _create_verified_user, _token_for

    await client.post(
        "/api/resource-sets/",
        json={"title": "Secret Set"},
        headers=teacher_headers,
    )

    teacher_b = await _create_verified_user(
        db_session,
        email=f"teacher_b_{__import__('uuid').uuid4().hex[:8]}@test.com",
        role="teacher",
        full_name="Teacher B",
    )
    headers_b = {"Authorization": f"Bearer {_token_for(teacher_b)}"}

    response = await client.get("/api/resource-sets/", headers=headers_b)
    assert response.status_code == 200
    assert len(response.json()) == 0
