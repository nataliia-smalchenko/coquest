"use client"

import { create } from "zustand"
import type {
  ChatMessage,
  GameSession,
  SessionPlayer,
  SessionProgress,
} from "@/types/session"

interface GameSessionStore {
  session: GameSession | null
  myPlayer: SessionPlayer | null
  progress: SessionProgress[]
  chatMessages: ChatMessage[]
  guestToken: string | null

  setSession: (session: GameSession) => void
  setMyPlayer: (player: SessionPlayer) => void
  setGuestToken: (token: string) => void
  setProgress: (progress: SessionProgress[]) => void
  updateProgress: (progress: SessionProgress) => void
  addChatMessage: (msg: ChatMessage) => void
  updatePlayer: (partial: Partial<SessionPlayer> & { id: string }) => void
  reset: () => void

  handleWsMessage: (data: Record<string, unknown>) => void
}

export const useGameSession = create<GameSessionStore>((set, get) => ({
  session: null,
  myPlayer: null,
  progress: [],
  chatMessages: [],
  guestToken: null,

  setSession: (session) => set({ session }),
  setMyPlayer: (player) => set({ myPlayer: player }),
  setGuestToken: (token) => set({ guestToken: token }),
  setProgress: (progress) => set({ progress }),

  updateProgress: (updated) =>
    set((state) => ({
      progress: state.progress.some((p) => p.id === updated.id)
        ? state.progress.map((p) => (p.id === updated.id ? updated : p))
        : [...state.progress, updated],
    })),

  addChatMessage: (msg) =>
    set((state) => ({ chatMessages: [...state.chatMessages, msg] })),

  updatePlayer: (partial) =>
    set((state) => {
      if (!state.session) return {}
      return {
        session: {
          ...state.session,
          players: (state.session.players ?? []).map((p) =>
            p.id === partial.id ? { ...p, ...partial } : p,
          ),
        },
        myPlayer:
          state.myPlayer?.id === partial.id
            ? { ...state.myPlayer, ...partial }
            : state.myPlayer,
      }
    }),

  reset: () =>
    set({
      session: null,
      myPlayer: null,
      progress: [],
      chatMessages: [],
      guestToken: null,
    }),

  handleWsMessage: (data) => {
    const { setSession, updateProgress, addChatMessage, updatePlayer } = get()
    const type = data.type as string

    switch (type) {
      case "connected": {
        if (data.session) {
          const sess = data.session as GameSession
          setSession({ ...sess, players: sess.players ?? [] })
        }
        break
      }
      case "player_joined": {
        set((state) => {
          if (!state.session) return {}
          const player = data.player as SessionPlayer
          const existing = state.session.players ?? []
          if (existing.some((p) => p.id === player.id)) return {}
          return {
            session: {
              ...state.session,
              players: [...existing, player],
            },
          }
        })
        break
      }
      case "player_left": {
        updatePlayer({ id: data.player_id as string, status: "waiting" })
        break
      }
      case "session_started": {
        set((state) => ({
          session: state.session
            ? { ...state.session, status: "active", ...(data.session as Partial<GameSession> ?? {}) }
            : state.session,
          progress: Array.isArray(data.progress)
            ? (data.progress as SessionProgress[])
            : state.progress,
        }))
        break
      }
      case "answer_result": {
        if (data.progress) updateProgress(data.progress as SessionProgress)
        break
      }
      case "text_viewed": {
        // handled by answer_result pattern — backend sends updated progress
        break
      }
      case "object_updated": {
        // New progress item assigned to a map object; will be fetched by component
        break
      }
      case "player_finished": {
        updatePlayer({ id: data.player_id as string, status: "finished" })
        break
      }
      case "session_completed": {
        set((state) => ({
          session: state.session
            ? { ...state.session, status: "completed" }
            : state.session,
        }))
        break
      }
      case "session_stopped": {
        set((state) => ({
          session: state.session
            ? { ...state.session, status: "stopped" }
            : state.session,
        }))
        break
      }
      case "chat_message": {
        addChatMessage({
          id: `${Date.now()}-${Math.random()}`,
          session_id: get().session?.id ?? "",
          player_id: data.player_id as string,
          display_name: data.display_name as string,
          message: data.message as string,
          created_at: (data.created_at as string) ?? new Date().toISOString(),
        })
        break
      }
    }
  },
}))

export function getSessionStorage(sessionId: string): {
  guest_token: string
  player_id: string
} | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(`coquest_session_${sessionId}`)
    return raw ? (JSON.parse(raw) as { guest_token: string; player_id: string }) : null
  } catch {
    return null
  }
}

export function setSessionStorage(
  sessionId: string,
  data: { guest_token: string; player_id: string },
) {
  if (typeof window === "undefined") return
  localStorage.setItem(`coquest_session_${sessionId}`, JSON.stringify(data))
}
