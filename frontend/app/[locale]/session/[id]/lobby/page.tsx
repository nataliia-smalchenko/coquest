"use client";

import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { getSessionStorage, useGameSession } from "@/hooks/useGameSession";
import { usePlayerWebSocket } from "@/hooks/useWebSocket";
import { useRouter } from "@/i18n/navigation";
import { playerStartSession, startTeam } from "@/lib/api/sessions";
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
  const locale = useLocale();
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
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamPlayers, setTeamPlayers] = useState<SessionPlayer[]>([]);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    const s = getSessionStorage(sessionId);
    if (!s) {
      router.push("/join");
      return;
    }
    setStored(s);
    setGuestToken(s.guest_token);
  }, [sessionId, router, setGuestToken]);

  const { messages } = usePlayerWebSocket(sessionId, stored?.guest_token ?? "");

  useEffect(() => {
    const last = messages[messages.length - 1] as
      | Record<string, unknown>
      | undefined;
    if (!last) return;

    handleWsMessage(last);

    if (last.type === "connected") {
      const sess = last.session as GameSession | undefined;
      const allPlayers = last.players as SessionPlayer[] | undefined;

      if (sess) {
        setSession(sess);
        if (allPlayers) setPlayers(allPlayers);
        if (stored) {
          const me =
            sess.players?.find?.((p) => p.id === stored.player_id) ??
            (allPlayers ?? []).find((p) => p.id === stored.player_id);
          if (me) setMyPlayer(me);
        }
      }

      // In team mode, extract team_id and filter teammates
      const tid = last.team_id as string | undefined;
      if (tid) {
        setTeamId(tid);
        setTeamPlayers((allPlayers ?? []).filter((p) => p.team_id === tid));
      }
    }

    if (last.type === "player_joined") {
      const p = last.player as SessionPlayer | undefined;
      if (p) {
        setPlayers((prev) =>
          prev.find((x) => x.id === p.id) ? prev : [...prev, p],
        );
        // Add to team if same team
        if (teamId && p.team_id === teamId) {
          setTeamPlayers((prev) =>
            prev.find((x) => x.id === p.id) ? prev : [...prev, p],
          );
        }
      }
    }

    if (last.type === "player_left") {
      const pid = last.player_id as string | undefined;
      if (pid) {
        setPlayers((prev) => prev.filter((x) => x.id !== pid));
        setTeamPlayers((prev) => prev.filter((x) => x.id !== pid));
      }
    }

    if (last.type === "team_started" || last.type === "session_started") {
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
    teamId,
  ]);

  useEffect(() => {
    if (session?.status === "completed" || session?.status === "stopped") {
      router.push(`/session/${sessionId}/results`);
    }
  }, [session, sessionId, router]);

  const isTeamMode = (session?.max_players ?? 1) > 1;
  const allowSolo = session?.allow_solo_in_team ?? true;
  const maxPlayers = session?.max_players ?? 1;

  // Solo mode: skip the lobby and auto-start immediately
  useEffect(() => {
    if (!session || !stored || isTeamMode || autoStartedRef.current) return;
    autoStartedRef.current = true;

    // If already playing (e.g. page refresh), go straight to game
    const me = session.players?.find((p) => p.id === stored.player_id);
    if (me?.status === "playing") {
      router.push(`/session/${sessionId}/game`);
      return;
    }

    setStarting(true);
    playerStartSession(sessionId, stored.guest_token)
      .then(() => {
        // Navigation triggered by WS: session_started
      })
      .catch(() => {
        setStartError(t("startError"));
        setStarting(false);
        autoStartedRef.current = false;
      });
  }, [session, stored, isTeamMode, sessionId, router, t]);

  const displayPlayers = isTeamMode ? teamPlayers : players;
  const canStart =
    !isTeamMode ||
    allowSolo ||
    (teamPlayers.length >= 2 && teamPlayers.length <= maxPlayers);

  const handleStart = async () => {
    if (!stored || starting) return;
    setStarting(true);
    setStartError(null);
    try {
      if (isTeamMode && teamId) {
        await startTeam(sessionId, teamId, stored.guest_token);
      } else {
        await playerStartSession(sessionId, stored.guest_token);
      }
      // Navigation triggered by WS: team_started / session_started
    } catch {
      setStartError(t("startError"));
      setStarting(false);
    }
  };

  // Solo mode: show only a spinner while auto-starting
  if (!isTeamMode && (starting || !session)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 text-gray-500">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          {startError && <p className="text-sm text-red-500">{startError}</p>}
        </div>
      </div>
    );
  }

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
          {session?.ends_at && (
            <p className="text-xs text-gray-400 mt-2">
              {t("sessionEndsAt")}{" "}
              <span className="font-medium text-gray-600">
                {new Date(session.ends_at).toLocaleTimeString(locale, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </p>
          )}
        </div>

        {/* Players / Team members */}
        <div className="mb-8">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            {isTeamMode ? t("team") : t("players")} ({displayPlayers.length}
            {isTeamMode ? `/${maxPlayers}` : ""})
          </p>
          {displayPlayers.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">—</p>
          ) : (
            <div className="flex flex-wrap gap-4 justify-center">
              {displayPlayers.map((p) => (
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
            {isTeamMode && !allowSolo && teamPlayers.length < 2 && (
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
