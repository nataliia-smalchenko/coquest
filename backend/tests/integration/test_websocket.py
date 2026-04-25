"""
Integration tests for WebSocket endpoints.

WebSocket handlers use their own AsyncSessionLocal (not the DI-injected get_db),
so data must be committed to the test DB for them to see it.
Fixtures for this are defined in conftest.py (ws_db, ws_run_and_player, etc.).
"""

import json
import uuid

import pytest
from httpx import AsyncClient
from httpx_ws import aconnect_ws
from httpx_ws.transport import ASGIWebSocketTransport

from app.main import app


@pytest.mark.asyncio
async def test_player_ws_connect_and_receive_connected(ws_run_and_player):
    """Player connects via WS and receives a 'connected' message."""
    info = ws_run_and_player
    sid = info["session_id"]

    async with AsyncClient(
        transport=ASGIWebSocketTransport(app=app), base_url="http://test"
    ) as client:
        async with aconnect_ws(
            f"/api/ws/session/{sid}/player",
            client,
        ) as ws:
            await ws.send_text(json.dumps({"token": info["guest_token"]}))
            msg = json.loads(await ws.receive_text())
            assert msg["type"] == "connected"
            assert msg["player_id"] == info["player_id"]
            assert "session" in msg


@pytest.mark.asyncio
async def test_teacher_ws_connect(ws_run_and_player):
    """Teacher connects via WS and receives a 'connected' message."""
    info = ws_run_and_player
    sid = info["session_id"]

    async with AsyncClient(
        transport=ASGIWebSocketTransport(app=app), base_url="http://test"
    ) as client:
        async with aconnect_ws(
            f"/api/ws/session/{sid}/teacher?token={info['teacher_token']}",
            client,
        ) as ws:
            msg = json.loads(await ws.receive_text())
            assert msg["type"] == "connected"
            assert msg["role"] == "teacher"
            assert msg["session"]["id"] == sid


@pytest.mark.asyncio
async def test_teacher_receives_player_joined(ws_run_and_player):
    """When a player connects, the teacher gets a 'player_joined' event."""
    info = ws_run_and_player
    sid = info["session_id"]

    async with AsyncClient(
        transport=ASGIWebSocketTransport(app=app), base_url="http://test"
    ) as client:
        # Teacher connects first
        async with aconnect_ws(
            f"/api/ws/session/{sid}/teacher?token={info['teacher_token']}",
            client,
        ) as teacher_ws:
            t_msg = json.loads(await teacher_ws.receive_text())
            assert t_msg["type"] == "connected"

            # Now player connects
            async with aconnect_ws(
                f"/api/ws/session/{sid}/player",
                client,
            ) as player_ws:
                await player_ws.send_text(json.dumps({"token": info["guest_token"]}))
                p_msg = json.loads(await player_ws.receive_text())
                assert p_msg["type"] == "connected"

                # Teacher should receive 'player_joined'
                joined_msg = json.loads(await teacher_ws.receive_text())
                assert joined_msg["type"] == "player_joined"
                assert joined_msg["player"]["id"] == info["player_id"]


@pytest.mark.asyncio
async def test_player_sends_unknown_type_gets_error(ws_run_and_player):
    """Sending an unknown message type returns an error."""
    info = ws_run_and_player
    sid = info["session_id"]

    async with AsyncClient(
        transport=ASGIWebSocketTransport(app=app), base_url="http://test"
    ) as client:
        async with aconnect_ws(
            f"/api/ws/session/{sid}/player",
            client,
        ) as ws:
            await ws.send_text(json.dumps({"token": info["guest_token"]}))
            _ = await ws.receive_text()  # connected

            await ws.send_text(json.dumps({"type": "nonsense"}))
            err_msg = json.loads(await ws.receive_text())
            assert err_msg["type"] == "error"
            assert "Invalid message format" in err_msg["detail"]


@pytest.mark.asyncio
async def test_player_chat_message_broadcast(ws_run_and_player):
    """Player sends a chat message and it gets broadcast to player and teacher."""
    info = ws_run_and_player
    sid = info["session_id"]

    async with AsyncClient(
        transport=ASGIWebSocketTransport(app=app), base_url="http://test"
    ) as client:
        # Teacher connects first
        async with aconnect_ws(
            f"/api/ws/session/{sid}/teacher?token={info['teacher_token']}",
            client,
        ) as teacher_ws:
            _ = await teacher_ws.receive_text()  # connected

            # Player connects
            async with aconnect_ws(
                f"/api/ws/session/{sid}/player",
                client,
            ) as player_ws:
                await player_ws.send_text(json.dumps({"token": info["guest_token"]}))
                _ = await player_ws.receive_text()  # connected

                # Teacher receives exactly one 'player_joined' (broadcast_to_session includes teacher)
                joined = json.loads(await teacher_ws.receive_text())
                assert joined["type"] == "player_joined"

                # Player sends chat
                await player_ws.send_text(
                    json.dumps({"type": "chat_message", "message": "Hello!"})
                )

                # Player receives the chat broadcast
                player_chat = json.loads(await player_ws.receive_text())
                assert player_chat["type"] == "chat_message"
                assert player_chat["message"] == "Hello!"
                assert player_chat["display_name"] == "WSPlayer"

                # Teacher receives the chat broadcast
                teacher_chat = json.loads(await teacher_ws.receive_text())
                assert teacher_chat["type"] == "chat_message"
                assert teacher_chat["message"] == "Hello!"


@pytest.mark.asyncio
async def test_teacher_sends_unknown_type_gets_error(ws_run_and_player):
    """Teacher sending an unknown message type returns an error."""
    info = ws_run_and_player
    sid = info["session_id"]

    async with AsyncClient(
        transport=ASGIWebSocketTransport(app=app), base_url="http://test"
    ) as client:
        async with aconnect_ws(
            f"/api/ws/session/{sid}/teacher?token={info['teacher_token']}",
            client,
        ) as ws:
            _ = await ws.receive_text()  # connected

            await ws.send_text(json.dumps({"type": "invalid_command"}))
            err_msg = json.loads(await ws.receive_text())
            assert err_msg["type"] == "error"
            assert "Invalid message format" in err_msg["detail"]


@pytest.mark.asyncio
async def test_invalid_guest_token_rejected():
    """A player with an invalid guest_token should be disconnected."""
    fake_session_id = str(uuid.uuid4())

    async with AsyncClient(
        transport=ASGIWebSocketTransport(app=app), base_url="http://test"
    ) as client:
        try:
            async with aconnect_ws(
                f"/api/ws/session/{fake_session_id}/player",
                client,
            ) as ws:
                await ws.send_text(json.dumps({"token": "bad_token"}))
                try:
                    await ws.receive_text()
                    pytest.fail("Expected WebSocket to be closed")
                except Exception:
                    pass  # Expected — server closed connection
        except Exception:
            pass  # Connection rejected at handshake — also valid


@pytest.mark.asyncio
async def test_invalid_teacher_token_rejected():
    """A teacher with an invalid JWT should be disconnected."""
    fake_session_id = str(uuid.uuid4())

    async with AsyncClient(
        transport=ASGIWebSocketTransport(app=app), base_url="http://test"
    ) as client:
        try:
            async with aconnect_ws(
                f"/api/ws/session/{fake_session_id}/teacher?token=bad_jwt_token",
                client,
            ) as ws:
                try:
                    await ws.receive_text()
                    pytest.fail("Expected WebSocket to be closed")
                except Exception:
                    pass
        except Exception:
            pass
