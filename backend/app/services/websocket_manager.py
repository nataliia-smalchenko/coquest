import json
from typing import Dict, Optional, Set

import structlog
from fastapi import WebSocket
from starlette.websockets import WebSocketState

log = structlog.get_logger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        # run_id -> {player_id -> WebSocket}  (active player WS connections)
        self.player_connections: Dict[str, Dict[str, WebSocket]] = {}
        # run_id -> teacher WebSocket
        self.teachers: Dict[str, WebSocket] = {}

    # connect / disconnect
    async def connect_player(
        self, run_id: str, player_id: str, websocket: WebSocket
    ) -> None:
        # Skip accept if the connection was already accepted (e.g. in ws_player)
        if websocket.application_state != WebSocketState.CONNECTED:
            await websocket.accept()
        if run_id not in self.player_connections:
            self.player_connections[run_id] = {}
        self.player_connections[run_id][player_id] = websocket
        log.info("player_connected", run_id=run_id, player_id=player_id)

    async def connect_teacher(
        self, run_id: str, teacher_id: str, websocket: WebSocket
    ) -> None:
        await websocket.accept()
        self.teachers[run_id] = websocket
        log.info("teacher_connected", run_id=run_id, teacher_id=teacher_id)

    async def disconnect_player(self, run_id: str, player_id: str) -> None:
        if run_id in self.player_connections:
            self.player_connections[run_id].pop(player_id, None)
            if not self.player_connections[run_id]:
                del self.player_connections[run_id]
        log.info("player_disconnected", run_id=run_id, player_id=player_id)

    async def disconnect_teacher(self, run_id: str) -> None:
        self.teachers.pop(run_id, None)
        log.info("teacher_disconnected", run_id=run_id)

    # send helpers
    async def send_to_player(self, run_id: str, player_id: str, message: dict) -> None:
        ws = self.player_connections.get(run_id, {}).get(player_id)
        if ws:
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                log.error(
                    "send_to_player_failed",
                    run_id=run_id,
                    player_id=player_id,
                    exc_info=True,
                )
                await self.disconnect_player(run_id, player_id)

    async def send_to_teacher(self, run_id: str, message: dict) -> None:
        ws = self.teachers.get(run_id)
        if ws:
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                log.error(
                    "send_to_teacher_failed",
                    run_id=run_id,
                    exc_info=True,
                )
                await self.disconnect_teacher(run_id)

    async def broadcast_to_run(
        self,
        run_id: str,
        message: dict,
        exclude_player_id: Optional[str] = None,
    ) -> None:
        """Broadcast to all players (optionally excluding one) + teacher."""
        for pid, ws in list(self.player_connections.get(run_id, {}).items()):
            if pid == exclude_player_id:
                continue
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                log.error(
                    "broadcast_failed",
                    run_id=run_id,
                    player_id=pid,
                    exc_info=True,
                )
                await self.disconnect_player(run_id, pid)
        await self.send_to_teacher(run_id, message)

    async def broadcast_to_team(
        self,
        run_id: str,
        player_ids: list[str],
        message: dict,
    ) -> None:
        """Send a message only to specific players within a run (e.g. team members)."""
        target_set = set(player_ids)
        for pid, ws in list(self.player_connections.get(run_id, {}).items()):
            if pid not in target_set:
                continue
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                log.error(
                    "broadcast_to_team_failed",
                    run_id=run_id,
                    player_id=pid,
                    exc_info=True,
                )
                await self.disconnect_player(run_id, pid)

    async def broadcast_to_all(self, run_id: str, message: dict) -> None:
        """Broadcast to all players + teacher without exclusions."""
        await self.broadcast_to_run(run_id, message)

    # introspection
    def get_connected_players(self, run_id: str) -> Set[str]:
        return set(self.player_connections.get(run_id, {}).keys())

    def is_teacher_connected(self, run_id: str) -> bool:
        return run_id in self.teachers


manager = ConnectionManager()
