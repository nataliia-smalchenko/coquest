"use client";

import { create } from "zustand";
import type {
  ChatMessage,
  GameSession,
  SessionPlayer,
  SessionProgress,
} from "@/types/session";

interface GameSessionStore {
  session: GameSession | null;
  myPlayer: SessionPlayer | null;
  progress: SessionProgress[];
  chatMessages: ChatMessage[];
  guestToken: string | null;

  setSession: (session: GameSession) => void;
  setMyPlayer: (player: SessionPlayer) => void;
  setGuestToken: (token: string) => void;
  setProgress: (progress: SessionProgress[]) => void;
  updateProgress: (progress: SessionProgress) => void;
  addChatMessage: (msg: ChatMessage) => void;
  updatePlayer: (partial: Partial<SessionPlayer> & { id: string }) => void;
  reset: () => void;

  handleWsMessage: (data: Record<string, unknown>) => void;
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
      if (!state.session) return {};
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
      };
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
    const { setSession, updateProgress, addChatMessage, updatePlayer } = get();
    const type = data.type as string;

    switch (type) {
      case "connected": {
        if (data.session) {
          const sess = data.session as GameSession;
          const players = Array.isArray(data.players)
            ? (data.players as SessionPlayer[])
            : (sess.players ?? []);
          setSession({ ...sess, players });
        }
        break;
      }
      case "player_joined": {
        set((state) => {
          if (!state.session) return {};
          const player = data.player as SessionPlayer;
          const existing = state.session.players ?? [];
          if (existing.some((p) => p.id === player.id)) return {};
          return {
            session: {
              ...state.session,
              players: [...existing, player],
            },
          };
        });
        break;
      }
      case "player_left": {
        set((state) => {
          if (!state.session) return {};
          return {
            session: {
              ...state.session,
              players: (state.session.players ?? []).map((p) =>
                p.id === (data.player_id as string) && p.status !== "finished"
                  ? { ...p, status: "waiting" }
                  : p,
              ),
            },
            myPlayer:
              state.myPlayer?.id === (data.player_id as string) &&
              state.myPlayer.status !== "finished"
                ? { ...state.myPlayer, status: "waiting" }
                : state.myPlayer,
          };
        });
        break;
      }
      case "session_started": {
        set((state) => ({
          session: state.session
            ? {
                ...state.session,
                status: "active",
                ...((data.session as Partial<GameSession>) ?? {}),
              }
            : state.session,
          progress: Array.isArray(data.progress)
            ? (data.progress as SessionProgress[])
            : state.progress,
        }));
        break;
      }
      case "answer_result": {
        if (data.progress) updateProgress(data.progress as SessionProgress);
        break;
      }
      case "text_viewed": {
        // handled by answer_result pattern — backend sends updated progress
        break;
      }
      case "object_updated": {
        // New progress item assigned to a map object; will be fetched by component
        break;
      }
      case "player_finished": {
        updatePlayer({ id: data.player_id as string, status: "finished" });
        break;
      }
      case "session_completed": {
        set((state) => ({
          session: state.session
            ? { ...state.session, status: "completed" }
            : state.session,
        }));
        break;
      }
      case "session_stopped": {
        set((state) => ({
          session: state.session
            ? { ...state.session, status: "stopped" }
            : state.session,
        }));
        break;
      }
      case "chat_message": {
        addChatMessage({
          id: `${Date.now()}-${Math.random()}`,
          session_id: get().session?.id ?? "",
          player_id: data.player_id as string,
          display_name: data.display_name as string,
          message: data.message as string,
          created_at: (data.created_at as string) ?? new Date().toISOString(),
        });
        break;
      }
    }
  },
}));

// localStorage is intentionally used here (not sessionStorage) to enable the
// cross-tab / cross-browser-restart rejoin flow: a student who closes their tab
// mid-game can return to /join, enter the same code, and resume as the same player.
// guest_token is a low-value credential (scoped to one game session); the XSS risk
// is accepted and mitigated at the application layer by DOMPurify sanitization.
export function getSessionStorage(sessionId: string): {
  guest_token: string;
  player_id: string;
  session_code?: string;
  display_name?: string;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`coquest_session_${sessionId}`);
    return raw
      ? (JSON.parse(raw) as {
          guest_token: string;
          player_id: string;
          session_code?: string;
          display_name?: string;
        })
      : null;
  } catch {
    return null;
  }
}

export function setSessionStorage(
  sessionId: string,
  data: {
    guest_token: string;
    player_id: string;
    session_code?: string;
    display_name?: string;
  },
) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`coquest_session_${sessionId}`, JSON.stringify(data));
  if (data.session_code) {
    localStorage.setItem(`coquest_code_${data.session_code}`, sessionId);
  }
}

export function getSessionStorageByCode(code: string): {
  session_id: string;
  guest_token: string;
  player_id: string;
  display_name?: string;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const sessionId = localStorage.getItem(
      `coquest_code_${code.toUpperCase()}`,
    );
    if (!sessionId) return null;
    const stored = getSessionStorage(sessionId);
    if (!stored) return null;
    return { session_id: sessionId, ...stored };
  } catch {
    return null;
  }
}

export function clearSessionStorage(sessionId: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(`coquest_session_${sessionId}`);
    if (raw) {
      const data = JSON.parse(raw) as { session_code?: string };
      if (data.session_code) {
        localStorage.removeItem(`coquest_code_${data.session_code}`);
      }
    }
  } catch {
    // ignore
  }
  localStorage.removeItem(`coquest_session_${sessionId}`);
}
