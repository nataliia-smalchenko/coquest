import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_maps(client: AsyncClient, student_headers: dict, db_map):
    # Pass 'uk' to match the translation language created
    response = await client.get(
        "/api/maps/", headers={"Accept-Language": "uk", **student_headers}
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1

    # Check if our test map is in the list
    map_item = next((m for m in data if m["id"] == str(db_map.id)), None)
    assert map_item is not None
    assert map_item["slug"] == "test-island"
    assert map_item["name"] == "Тестовий острів"


@pytest.mark.asyncio
async def test_get_map_detail(client: AsyncClient, student_headers: dict, db_map):
    response = await client.get(f"/api/maps/{db_map.slug}", headers=student_headers)
    assert response.status_code == 200
    data = response.json()

    assert data["id"] == str(db_map.id)
    assert data["slug"] == "test-island"
    assert len(data["objects"]) == 1
    assert data["objects"][0]["slug"] == "point_1"


@pytest.mark.asyncio
async def test_get_missing_map(client: AsyncClient, student_headers: dict):
    response = await client.get("/api/maps/not-a-real-map", headers=student_headers)
    assert response.status_code == 404
