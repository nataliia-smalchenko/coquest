"""
Integration tests for /api/resources endpoints.

Coverage:
  Folders  – create, list, delete, access control
  Tags     – create, list, delete
  Resources – create (text + question), list, get, update, delete, isolation
  Content  – upsert text content, upsert question
  Auth     – student cannot call teacher-only endpoints
"""

import uuid
import pytest
from httpx import AsyncClient


# Folders
@pytest.mark.asyncio
async def test_create_folder(client: AsyncClient, teacher_headers: dict):
    response = await client.post(
        "/api/resources/folders",
        json={"name": "My Folder"},
        headers=teacher_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "My Folder"
    assert data["parent_id"] is None
    assert "id" in data


@pytest.mark.asyncio
async def test_list_folders_empty(client: AsyncClient, teacher_headers: dict):
    response = await client.get("/api/resources/folders", headers=teacher_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_list_folders_after_create(client: AsyncClient, teacher_headers: dict):
    await client.post(
        "/api/resources/folders",
        json={"name": "Folder A"},
        headers=teacher_headers,
    )
    response = await client.get("/api/resources/folders", headers=teacher_headers)
    assert response.status_code == 200
    names = [f["name"] for f in response.json()]
    assert "Folder A" in names


@pytest.mark.asyncio
async def test_delete_folder(client: AsyncClient, teacher_headers: dict):
    create = await client.post(
        "/api/resources/folders",
        json={"name": "To Delete"},
        headers=teacher_headers,
    )
    folder_id = create.json()["id"]

    delete = await client.delete(
        f"/api/resources/folders/{folder_id}",
        headers=teacher_headers,
    )
    assert delete.status_code == 204

    # Confirm it's gone
    folders = await client.get("/api/resources/folders", headers=teacher_headers)
    ids = [f["id"] for f in folders.json()]
    assert folder_id not in ids


@pytest.mark.asyncio
async def test_folders_isolated_between_teachers(
    client: AsyncClient, teacher_headers: dict, student_headers: dict
):
    """Student cannot list teacher folders — 403 only."""
    response = await client.get("/api/resources/folders", headers=student_headers)
    assert response.status_code == 403


# Tags
@pytest.mark.asyncio
async def test_create_tag(client: AsyncClient, teacher_headers: dict):
    response = await client.post(
        "/api/resources/tags",
        json={"name": "Physics", "color": "#ff0000"},
        headers=teacher_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Physics"
    assert data["color"] == "#ff0000"


@pytest.mark.asyncio
async def test_list_tags(client: AsyncClient, teacher_headers: dict):
    await client.post(
        "/api/resources/tags",
        json={"name": "Math"},
        headers=teacher_headers,
    )
    response = await client.get("/api/resources/tags", headers=teacher_headers)
    assert response.status_code == 200
    assert any(t["name"] == "Math" for t in response.json())


@pytest.mark.asyncio
async def test_delete_tag(client: AsyncClient, teacher_headers: dict):
    create = await client.post(
        "/api/resources/tags",
        json={"name": "Temp Tag"},
        headers=teacher_headers,
    )
    tag_id = create.json()["id"]

    delete = await client.delete(
        f"/api/resources/tags/{tag_id}",
        headers=teacher_headers,
    )
    assert delete.status_code == 204


# Resources (CRUD)
@pytest.mark.asyncio
async def test_create_text_resource(client: AsyncClient, teacher_headers: dict):
    response = await client.post(
        "/api/resources/",
        json={"type": "text", "title": "Water Cycle"},
        headers=teacher_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Water Cycle"
    assert data["type"] == "text"
    assert data["has_content"] is False


@pytest.mark.asyncio
async def test_create_question_resource(client: AsyncClient, teacher_headers: dict):
    response = await client.post(
        "/api/resources/",
        json={"type": "question", "title": "What is H2O?"},
        headers=teacher_headers,
    )
    assert response.status_code == 201
    assert response.json()["type"] == "question"


@pytest.mark.asyncio
async def test_create_resource_with_folder_and_tag(
    client: AsyncClient, teacher_headers: dict
):
    folder = await client.post(
        "/api/resources/folders",
        json={"name": "Science"},
        headers=teacher_headers,
    )
    folder_id = folder.json()["id"]

    tag = await client.post(
        "/api/resources/tags",
        json={"name": "Bio"},
        headers=teacher_headers,
    )
    tag_id = tag.json()["id"]

    response = await client.post(
        "/api/resources/",
        json={
            "type": "text",
            "title": "Cell Structure",
            "folder_id": folder_id,
            "tag_ids": [tag_id],
        },
        headers=teacher_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["folder_id"] == folder_id
    assert any(t["id"] == tag_id for t in data["tags"])


@pytest.mark.asyncio
async def test_list_resources(client: AsyncClient, teacher_headers: dict):
    await client.post(
        "/api/resources/",
        json={"type": "text", "title": "Resource Alpha"},
        headers=teacher_headers,
    )
    response = await client.get("/api/resources/", headers=teacher_headers)
    assert response.status_code == 200
    titles = [r["title"] for r in response.json()]
    assert "Resource Alpha" in titles


@pytest.mark.asyncio
async def test_get_resource(client: AsyncClient, teacher_headers: dict):
    create = await client.post(
        "/api/resources/",
        json={"type": "text", "title": "Get Me"},
        headers=teacher_headers,
    )
    resource_id = create.json()["id"]

    response = await client.get(
        f"/api/resources/{resource_id}",
        headers=teacher_headers,
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Get Me"


@pytest.mark.asyncio
async def test_update_resource_title(client: AsyncClient, teacher_headers: dict):
    create = await client.post(
        "/api/resources/",
        json={"type": "text", "title": "Old Title"},
        headers=teacher_headers,
    )
    resource_id = create.json()["id"]

    update = await client.put(
        f"/api/resources/{resource_id}",
        json={"title": "New Title"},
        headers=teacher_headers,
    )
    assert update.status_code == 200
    assert update.json()["title"] == "New Title"


@pytest.mark.asyncio
async def test_delete_resource(client: AsyncClient, teacher_headers: dict):
    create = await client.post(
        "/api/resources/",
        json={"type": "text", "title": "Delete Me"},
        headers=teacher_headers,
    )
    resource_id = create.json()["id"]

    delete = await client.delete(
        f"/api/resources/{resource_id}",
        headers=teacher_headers,
    )
    assert delete.status_code == 204

    get = await client.get(
        f"/api/resources/{resource_id}",
        headers=teacher_headers,
    )
    assert get.status_code == 404


@pytest.mark.asyncio
async def test_resources_isolated_between_teachers(
    client: AsyncClient, teacher_headers: dict, student_headers: dict
):
    """A student cannot reach the resources list at all (403)."""
    response = await client.get("/api/resources/", headers=student_headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_get_nonexistent_resource_returns_404(
    client: AsyncClient, teacher_headers: dict
):
    fake_id = uuid.uuid4()
    response = await client.get(
        f"/api/resources/{fake_id}",
        headers=teacher_headers,
    )
    assert response.status_code == 404


# Content (text)
VALID_TIPTAP_DOC = {
    "type": "doc",
    "content": [
        {
            "type": "paragraph",
            "content": [{"type": "text", "text": "Hello world"}],
        }
    ],
}


@pytest.mark.asyncio
async def test_upsert_text_content(client: AsyncClient, teacher_headers: dict):
    create = await client.post(
        "/api/resources/",
        json={"type": "text", "title": "With Content"},
        headers=teacher_headers,
    )
    resource_id = create.json()["id"]

    response = await client.post(
        f"/api/resources/{resource_id}/text-content",
        json={"body": VALID_TIPTAP_DOC, "images": []},
        headers=teacher_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["body"]["type"] == "doc"

    # Verify detail endpoint reflects has_content (bug was fixed in resource_service.get_resource)
    detail = await client.get(
        f"/api/resources/{resource_id}",
        headers=teacher_headers,
    )
    assert detail.json()["has_content"] is True


@pytest.mark.asyncio
async def test_text_content_requires_tiptap_doc(
    client: AsyncClient, teacher_headers: dict
):
    create = await client.post(
        "/api/resources/",
        json={"type": "text", "title": "Bad Content"},
        headers=teacher_headers,
    )
    resource_id = create.json()["id"]

    response = await client.post(
        f"/api/resources/{resource_id}/text-content",
        json={"body": {"type": "not_doc", "content": []}, "images": []},
        headers=teacher_headers,
    )
    assert response.status_code == 422


# Content (question)
@pytest.mark.asyncio
async def test_upsert_question_content(client: AsyncClient, teacher_headers: dict):
    create = await client.post(
        "/api/resources/",
        json={"type": "question", "title": "Some Question"},
        headers=teacher_headers,
    )
    resource_id = create.json()["id"]

    response = await client.post(
        f"/api/resources/{resource_id}/question",
        json={
            "question_type": "single",
            "body": "<p>What is 2+2?</p>",
            "options": [
                {"id": "a", "text": "3", "is_correct": False},
                {"id": "b", "text": "4", "is_correct": True},
            ],
            "correct_answers": ["b"],
            "points": 1,
        },
        headers=teacher_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["correct_answers"] == ["b"]
    assert len(data["options"]) == 2
