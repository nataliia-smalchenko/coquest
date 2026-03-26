import json
import logging
from typing import Dict, Optional, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        # session_id -> {player_id -> WebSocket}
        self.sessions: Dict[str, Dict[str, WebSocket]] = {}
        # session_id -> teacher WebSocket
        self.teachers: Dict[str, WebSocket] = {}

    # connect / disconnect
    async def connect_player(
        self, session_id: str, player_id: str, websocket: WebSocket
    ) -> None:
        await websocket.accept()
        if session_id not in self.sessions:
            self.sessions[session_id] = {}
        self.sessions[session_id][player_id] = websocket
        logger.info("Player %s connected to session %s", player_id, session_id)

    async def connect_teacher(
        self, session_id: str, teacher_id: str, websocket: WebSocket
    ) -> None:
        await websocket.accept()
        self.teachers[session_id] = websocket
        logger.info("Teacher %s connected to session %s", teacher_id, session_id)

    async def disconnect_player(self, session_id: str, player_id: str) -> None:
        if session_id in self.sessions:
            self.sessions[session_id].pop(player_id, None)
            if not self.sessions[session_id]:
                del self.sessions[session_id]
        logger.info("Player %s disconnected from session %s", player_id, session_id)

    async def disconnect_teacher(self, session_id: str) -> None:
        self.teachers.pop(session_id, None)
        logger.info("Teacher disconnected from session %s", session_id)

    # send helpers
    async def send_to_player(
        self, session_id: str, player_id: str, message: dict
    ) -> None:
        ws = self.sessions.get(session_id, {}).get(player_id)
        if ws:
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                await self.disconnect_player(session_id, player_id)

    async def send_to_teacher(self, session_id: str, message: dict) -> None:
        ws = self.teachers.get(session_id)
        if ws:
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                await self.disconnect_teacher(session_id)

    async def broadcast_to_session(
        self,
        session_id: str,
        message: dict,
        exclude_player_id: Optional[str] = None,
    ) -> None:
        """Broadcast to all players (optionally excluding one) + teacher."""
        for pid, ws in list(self.sessions.get(session_id, {}).items()):
            if pid == exclude_player_id:
                continue
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                await self.disconnect_player(session_id, pid)
        await self.send_to_teacher(session_id, message)

    async def broadcast_to_all(self, session_id: str, message: dict) -> None:
        """Broadcast to all players + teacher without exclusions."""
        await self.broadcast_to_session(session_id, message)

    # introspection
    def get_connected_players(self, session_id: str) -> Set[str]:
        return set(self.sessions.get(session_id, {}).keys())

    def is_teacher_connected(self, session_id: str) -> bool:
        return session_id in self.teachers


manager = ConnectionManager()
