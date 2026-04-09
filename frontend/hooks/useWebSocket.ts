"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const WS_BASE =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000"
    : "ws://localhost:8000"

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30000
const RECONNECT_MAX_ATTEMPTS = 10

function useWebSocket(url: string | null) {
  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [messages, setMessages] = useState<unknown[]>([])

  const wsRef = useRef<WebSocket | null>(null)
  const attemptsRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // When set to true, no reconnect attempts will be made (intentional close)
  const stoppedRef = useRef(false)

  const connect = useCallback(() => {
    if (!url || stoppedRef.current) return

    const socket = new WebSocket(url)

    socket.onopen = () => {
      setConnected(true)
      setReconnecting(false)
      attemptsRef.current = 0
    }

    socket.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string)
        setMessages((prev) => [...prev, data])
      } catch {
        // ignore parse errors
      }
    }

    socket.onclose = () => {
      setConnected(false)
      wsRef.current = null

      if (stoppedRef.current) return
      if (attemptsRef.current >= RECONNECT_MAX_ATTEMPTS) return

      const delay = Math.min(
        RECONNECT_BASE_MS * 2 ** attemptsRef.current,
        RECONNECT_MAX_MS,
      )
      attemptsRef.current += 1
      setReconnecting(true)
      timerRef.current = setTimeout(connect, delay)
    }

    socket.onerror = () => {
      // onclose fires after onerror, so reconnect is handled there
    }

    wsRef.current = socket
  }, [url])

  useEffect(() => {
    stoppedRef.current = false
    attemptsRef.current = 0
    connect()

    return () => {
      stoppedRef.current = true
      if (timerRef.current) clearTimeout(timerRef.current)
      wsRef.current?.close()
      wsRef.current = null
      setConnected(false)
      setReconnecting(false)
    }
  }, [connect])

  const send = useCallback((data: unknown) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data))
    }
  }, [])

  return { connected, reconnecting, messages, send }
}

export function usePlayerWebSocket(sessionId: string, guestToken: string) {
  const url =
    sessionId && guestToken
      ? `${WS_BASE}/api/ws/session/${sessionId}/player?guest_token=${guestToken}`
      : null
  return useWebSocket(url)
}

export function useTeacherWebSocket(sessionId: string, token: string) {
  const url =
    sessionId && token
      ? `${WS_BASE}/api/ws/session/${sessionId}/teacher?token=${token}`
      : null
  return useWebSocket(url)
}
