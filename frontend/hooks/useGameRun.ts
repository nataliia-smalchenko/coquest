"use client";

import { create } from "zustand";
import type { ChatMessage, GameRun, RunPlayer, RunProgress } from "@/types/run";

interface GameRunStore {
  run: GameRun | null;
  myPlayer: RunPlayer | null;
  progress: RunProgress[];
  chatMessages: ChatMessage[];
  guestToken: string | null;

  setRun: (run: GameRun) => void;
  setMyPlayer: (player: RunPlayer) => void;
  setGuestToken: (token: string) => void;
  setProgress: (progress: RunProgress[]) => void;
  updateProgress: (progress: RunProgress) => void;
  addChatMessage: (msg: ChatMessage) => void;
  updatePlayer: (partial: Partial<RunPlayer> & { id: string }) => void;
  reset: () => void;

  handleWsMessage: (data: Record<string, unknown>) => void;
}

export const useGameRun = create<GameRunStore>((set, get) => ({
  run: null,
  myPlayer: null,
  progress: [],
  chatMessages: [],
  guestToken: null,

  setRun: (run) => set({ run }),
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
      if (!state.run) return {};
      return {
        run: {
          ...state.run,
          players: (state.run.players ?? []).map((p) =>
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
      run: null,
      myPlayer: null,
      progress: [],
      chatMessages: [],
      guestToken: null,
    }),

  handleWsMessage: (data) => {
    const { setRun, updateProgress, addChatMessage, updatePlayer } = get();
    const type = data.type as string;

    switch (type) {
      case "connected": {
        if (data.run) {
          const run = data.run as GameRun;
          const players = Array.isArray(data.players)
            ? (data.players as RunPlayer[])
            : (run.players ?? []);
          setRun({ ...run, players });
        }
        break;
      }
      case "player_joined": {
        set((state) => {
          if (!state.run) return {};
          const player = data.player as RunPlayer;
          const existing = state.run.players ?? [];
          if (existing.some((p) => p.id === player.id)) return {};
          return {
            run: {
              ...state.run,
              players: [...existing, player],
            },
          };
        });
        break;
      }
      case "player_left": {
        set((state) => {
          if (!state.run) return {};
          return {
            run: {
              ...state.run,
              players: (state.run.players ?? []).map((p) =>
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
      case "run_started": {
        set((state) => ({
          run: state.run
            ? {
                ...state.run,
                status: "active",
                ...((data.run as Partial<GameRun>) ?? {}),
              }
            : state.run,
          progress: Array.isArray(data.progress)
            ? (data.progress as RunProgress[])
            : state.progress,
        }));
        break;
      }
      case "answer_result": {
        if (data.progress) updateProgress(data.progress as RunProgress);
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
      case "run_completed": {
        set((state) => ({
          run: state.run ? { ...state.run, status: "completed" } : state.run,
        }));
        break;
      }
      case "run_stopped": {
        set((state) => ({
          run: state.run ? { ...state.run, status: "stopped" } : state.run,
        }));
        break;
      }
      case "chat_message": {
        addChatMessage({
          id: `${Date.now()}-${Math.random()}`,
          run_id: get().run?.id ?? "",
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
// guest_token is a low-value credential (scoped to one game run); the XSS risk
// is accepted and mitigated at the application layer by DOMPurify sanitization.
export function getRunStorage(runId: string): {
  guest_token: string;
  player_id: string;
  join_code?: string;
  display_name?: string;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`coquest_run_${runId}`);
    return raw
      ? (JSON.parse(raw) as {
          guest_token: string;
          player_id: string;
          join_code?: string;
          display_name?: string;
        })
      : null;
  } catch {
    return null;
  }
}

export function setRunStorage(
  runId: string,
  data: {
    guest_token: string;
    player_id: string;
    join_code?: string;
    display_name?: string;
  },
) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`coquest_run_${runId}`, JSON.stringify(data));
  if (data.join_code) {
    localStorage.setItem(`coquest_code_${data.join_code}`, runId);
  }
}

export function getRunStorageByCode(code: string): {
  run_id: string;
  guest_token: string;
  player_id: string;
  display_name?: string;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const runId = localStorage.getItem(`coquest_code_${code.toUpperCase()}`);
    if (!runId) return null;
    const stored = getRunStorage(runId);
    if (!stored) return null;
    return { run_id: runId, ...stored };
  } catch {
    return null;
  }
}

export function clearRunStorage(runId: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(`coquest_run_${runId}`);
    if (raw) {
      const data = JSON.parse(raw) as { join_code?: string };
      if (data.join_code) {
        localStorage.removeItem(`coquest_code_${data.join_code}`);
      }
    }
  } catch {
    // ignore
  }
  localStorage.removeItem(`coquest_run_${runId}`);
}
