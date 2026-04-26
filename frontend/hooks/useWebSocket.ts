"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const WS_BASE =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000"
    : "ws://localhost:8000";

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const RECONNECT_MAX_ATTEMPTS = 10;

/**
 * Core WebSocket hook.
 *
 * `onMessage` is stored in a ref internally, so replacing the callback
 * (e.g. after a state change in the consumer) never triggers a reconnect.
 * Messages are delivered directly to the callback — no state accumulation.
 *
 * `authMessage` — if provided, sent as the first frame after the socket opens
 * (used by the player endpoint which expects `{ token }` before it will
 * respond with the `connected` payload).
 */
function useWebSocket(
  url: string | null,
  onMessage: (data: unknown) => void,
  authMessage?: Record<string, unknown> | null,
) {
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  // Always holds the latest callback without causing reconnects
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const authMessageRef = useRef(authMessage);
  authMessageRef.current = authMessage;

  const wsRef = useRef<WebSocket | null>(null);
  const attemptsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When true, no reconnect attempts will be made (intentional close)
  const stoppedRef = useRef(false);

  const connect = useCallback(() => {
    if (!url || stoppedRef.current) return;

    const socket = new WebSocket(url);

    socket.onopen = () => {
      if (authMessageRef.current) {
        socket.send(JSON.stringify(authMessageRef.current));
      }
      setConnected(true);
      setReconnecting(false);
      attemptsRef.current = 0;
    };

    socket.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string);
        onMessageRef.current(data); // deliver directly — no array growth
      } catch {
        // ignore malformed frames
      }
    };

    socket.onclose = () => {
      setConnected(false);
      wsRef.current = null;

      if (stoppedRef.current) return;
      if (attemptsRef.current >= RECONNECT_MAX_ATTEMPTS) return;

      const delay = Math.min(
        RECONNECT_BASE_MS * 2 ** attemptsRef.current,
        RECONNECT_MAX_MS,
      );
      attemptsRef.current += 1;
      setReconnecting(true);
      timerRef.current = setTimeout(connect, delay);
    };

    socket.onerror = () => {
      // onclose fires after onerror, so reconnect is handled there
    };

    wsRef.current = socket;
  }, [url]); // onMessage intentionally excluded — accessed via ref

  useEffect(() => {
    stoppedRef.current = false;
    attemptsRef.current = 0;
    connect();

    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
      setReconnecting(false);
    };
  }, [connect]);

  const send = useCallback((data: unknown) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }, []);

  return { connected, reconnecting, send };
}

export function usePlayerWebSocket(
  runId: string,
  guestToken: string,
  onMessage: (data: unknown) => void,
) {
  const url =
    runId && guestToken ? `${WS_BASE}/api/ws/run/${runId}/player` : null;
  const authMessage = guestToken ? { token: guestToken } : null;
  return useWebSocket(url, onMessage, authMessage);
}

export function useTeacherWebSocket(
  runId: string,
  token: string,
  onMessage: (data: unknown) => void,
) {
  const url =
    runId && token
      ? `${WS_BASE}/api/ws/run/${runId}/teacher?token=${token}`
      : null;
  return useWebSocket(url, onMessage);
}
