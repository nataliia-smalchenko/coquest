"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const WS_BASE =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000"
    : "ws://localhost:8000"

export function usePlayerWebSocket(sessionId: string, guestToken: string) {
  const [connected, setConnected] = useState(false)
  const [messages, setMessages] = useState<unknown[]>([])
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!sessionId || !guestToken) return

    const url = `${WS_BASE}/api/ws/session/${sessionId}/player?guest_token=${guestToken}`
    const socket = new WebSocket(url)

    socket.onopen = () => setConnected(true)
    socket.onclose = () => setConnected(false)
    socket.onerror = () => setConnected(false)
    socket.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string)
        setMessages((prev) => [...prev, data])
      } catch {
        // ignore parse errors
      }
    }

    wsRef.current = socket
    return () => {
      socket.close()
      wsRef.current = null
    }
  }, [sessionId, guestToken])

  const send = useCallback((data: unknown) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data))
    }
  }, [])

  return { connected, messages, send }
}

export function useTeacherWebSocket(sessionId: string, token: string) {
  const [connected, setConnected] = useState(false)
  const [messages, setMessages] = useState<unknown[]>([])
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!sessionId || !token) return

    const url = `${WS_BASE}/api/ws/session/${sessionId}/teacher?token=${token}`
    const socket = new WebSocket(url)

    socket.onopen = () => setConnected(true)
    socket.onclose = () => setConnected(false)
    socket.onerror = () => setConnected(false)
    socket.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string)
        setMessages((prev) => [...prev, data])
      } catch {
        // ignore parse errors
      }
    }

    wsRef.current = socket
    return () => {
      socket.close()
      wsRef.current = null
    }
  }, [sessionId, token])

  const send = useCallback((data: unknown) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data))
    }
  }, [])

  return { connected, messages, send }
}
