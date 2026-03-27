"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { getSessionStorage, useGameSession } from "@/hooks/useGameSession";
import { usePlayerWebSocket } from "@/hooks/useWebSocket";
import { useRouter } from "@/i18n/navigation";
import { playerStartSession } from "@/lib/api/sessions";
import type { GameSession, SessionPlayer } from "@/types/session";

function PlayerAvatar({ name, color }: { name: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-md"
        style={{ backgroundColor: color }}
      >
        {name.charAt(0).toUpperCase()}
      </div>
      <span className="text-sm text-gray-700 font-medium max-w-[80px] truncate text-center">
        {name}
      </span>
    </div>
  );
}

export default function LobbyPage() {
  const t = useTranslations("game.lobby");
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const { session, setSession, setMyPlayer, setGuestToken, handleWsMessage } =
    useGameSession();

  const [stored, setStored] = useState<{
    guest_token: string;
    player_id: string;
  } | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Load stored session data
  useEffect(() => {
    const s = getSessionStorage(sessionId);
    if (!s) {
      router.push("/join");
      return;
    }
    setStored(s);
    setGuestToken(s.guest_token);
  }, [sessionId, router, setGuestToken]);

  // Connect to WebSocket
  const { messages } = usePlayerWebSocket(sessionId, stored?.guest_token ?? "");

  // Process WS messages
  useEffect(() => {
    const last = messages[messages.length - 1] as
      | Record<string, unknown>
      | undefined;
    if (!last) return;

    handleWsMessage(last);

    if (last.type === "connected") {
      const sess = last.session as GameSession | undefined;
      if (sess) {
        setSession(sess);
        // Populate players from the connected message
        const allPlayers = last.players as SessionPlayer[] | undefined;
        if (allPlayers) setPlayers(allPlayers);
        // Find myPlayer
        if (stored) {
          const me =
            sess.players?.find?.((p) => p.id === stored.player_id) ??
            (allPlayers ?? []).find((p) => p.id === stored.player_id);
          if (me) setMyPlayer(me);
        }
      }
    }

    if (last.type === "player_joined") {
      const p = last.player as SessionPlayer | undefined;
      if (p)
        setPlayers((prev) => {
          if (prev.find((x) => x.id === p.id)) return prev;
          return [...prev, p];
        });
    }

    if (last.type === "player_left") {
      const pid = last.player_id as string | undefined;
      if (pid) setPlayers((prev) => prev.filter((x) => x.id !== pid));
    }

    if (last.type === "session_started") {
      router.push(`/session/${sessionId}/game`);
    }
    if (last.type === "session_completed" || last.type === "session_stopped") {
      router.push(`/session/${sessionId}/results`);
    }
  }, [
    messages,
    handleWsMessage,
    router,
    sessionId,
    setSession,
    setMyPlayer,
    stored,
  ]);

  // Redirect if session already active
  useEffect(() => {
    if (session?.status === "active") {
      router.push(`/session/${sessionId}/game`);
    }
    if (session?.status === "completed" || session?.status === "stopped") {
      router.push(`/session/${sessionId}/results`);
    }
  }, [session, sessionId, router]);

  const isTeamMode = (session?.max_players ?? 1) > 1;
  const allowSolo = session?.allow_solo_in_team ?? true;
  const canStart = !isTeamMode || allowSolo || players.length >= 2;

  const handleStart = async () => {
    if (!stored || starting) return;
    setStarting(true);
    setStartError(null);
    try {
      await playerStartSession(sessionId, stored.guest_token);
      // Navigation happens via WS session_started event
    } catch {
      setStartError(t("startError"));
      setStarting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-8">
        {/* Session code */}
        <div className="text-center mb-8">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">
            {t("sessionCode")}
          </p>
          <div className="text-5xl font-mono font-bold text-gray-900 tracking-widest">
            {session?.session_code ?? "------"}
          </div>
        </div>

        {/* Players */}
        <div className="mb-8">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            {t("players")} ({players.length}
            {session?.max_players && session.max_players < 999
              ? `/${session.max_players}`
              : ""}
            )
          </p>
          {players.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">—</p>
          ) : (
            <div className="flex flex-wrap gap-4 justify-center">
              {players.map((p) => (
                <PlayerAvatar
                  key={p.id}
                  name={p.display_name}
                  color={p.avatar_color}
                />
              ))}
            </div>
          )}
        </div>

        {/* Start button or waiting indicator */}
        {session && (
          <div className="flex flex-col items-center gap-3">
            {isTeamMode && !allowSolo && players.length < 2 && (
              <p className="text-sm text-gray-400 text-center">
                {t("minPlayers")}
              </p>
            )}
            {startError && (
              <p className="text-sm text-red-500 text-center">{startError}</p>
            )}
            <button
              type="button"
              onClick={handleStart}
              disabled={!canStart || starting}
              className="w-full py-3 rounded-xl text-white font-semibold text-base transition-all"
              style={{
                backgroundColor: canStart && !starting ? "#2563eb" : "#93c5fd",
                cursor: canStart && !starting ? "pointer" : "not-allowed",
              }}
            >
              {starting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-white animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </span>
                  {t("starting")}
                </span>
              ) : (
                t("start")
              )}
            </button>

            {isTeamMode && (
              <p className="text-xs text-gray-400 text-center">
                {allowSolo ? t("waitingOptional") : t("waitingRequired")}
              </p>
            )}
          </div>
        )}

        {!session && (
          <div className="flex items-center justify-center gap-3 text-gray-500 text-sm">
            <span className="inline-flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
            {t("waiting")}
          </div>
        )}
      </div>
    </div>
  );
}
