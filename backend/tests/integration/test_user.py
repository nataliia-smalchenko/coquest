import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_me(client: AsyncClient, teacher_headers: dict):
    response = await client.get("/api/user/me", headers=teacher_headers)
    assert response.status_code == 200
    data = response.json()
    assert "email" in data
    assert data["role"] == "teacher"
    assert data["preferred_language"] == "uk"


@pytest.mark.asyncio
async def test_update_language(client: AsyncClient, teacher_headers: dict):
    response = await client.patch(
        "/api/user/language", json={"language": "en"}, headers=teacher_headers
    )
    assert response.status_code == 200
    assert response.json()["preferred_language"] == "en"

    # Verify it persisted
    me_resp = await client.get("/api/user/me", headers=teacher_headers)
    assert me_resp.json()["preferred_language"] == "en"


@pytest.mark.asyncio
async def test_update_profile(client: AsyncClient, student_headers: dict):
    # Student upgrades to Teacher
    response = await client.patch(
        "/api/user/profile",
        json={"full_name": "New Name", "role": "teacher"},
        headers=student_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["full_name"] == "New Name"
    assert data["role"] == "teacher"


@pytest.mark.asyncio
async def test_teacher_cannot_downgrade_with_resources(
    client: AsyncClient, teacher_headers: dict
):
    # Teacher gives themselves a resource first
    await client.post(
        "/api/resources/",
        json={"type": "text", "title": "My Text"},
        headers=teacher_headers,
    )

    # Teacher tries to downgrade to student
    response = await client.patch(
        "/api/user/profile", json={"role": "student"}, headers=teacher_headers
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "cannot_change_role"
