"use client";

import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
  clearSessionStorage,
  getSessionStorage,
  setSessionStorage,
  useGameSession,
} from "@/hooks/useGameSession";
import { usePlayerWebSocket } from "@/hooks/useWebSocket";
import { useRouter } from "@/i18n/navigation";
import { leaveTeam, playerStartSession, startTeam } from "@/lib/api/sessions";
import type { GameSession, SessionPlayer } from "@/types/session";

function PlayerAvatar({
  name,
  color,
  hideName,
}: {
  name: string;
  color: string;
  hideName?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-md flex-shrink-0"
        style={{ backgroundColor: color }}
      >
        {name.charAt(0).toUpperCase()}
      </div>
      {!hideName && (
        <span className="text-xs text-gray-700 font-medium w-20 line-clamp-2 text-center leading-snug break-words">
          {name}
        </span>
      )}
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
    session_code?: string;
    display_name?: string;
  } | null>(null);

  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamPlayers, setTeamPlayers] = useState<SessionPlayer[]>([]);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [leavingTeam, setLeavingTeam] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const autoStartedRef = useRef(false);
  const teamIdRef = useRef<string | null>(null);

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

      const tid = last.team_id as string | undefined;
      if (tid) {
        teamIdRef.current = tid;
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
        if (teamIdRef.current && p.team_id === teamIdRef.current) {
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
  ]);

  useEffect(() => {
    if (session?.status === "completed" || session?.status === "stopped") {
      router.push(`/session/${sessionId}/results`);
    }
  }, [session, sessionId, router]);

  // Keep localStorage entry up-to-date with session_code (for returning players)
  useEffect(() => {
    if (session?.session_code && stored && !stored.session_code) {
      setSessionStorage(sessionId, {
        ...stored,
        session_code: session.session_code,
      });
      setStored((prev) =>
        prev ? { ...prev, session_code: session.session_code } : prev,
      );
    }
  }, [session?.session_code, stored, sessionId]);

  const isTeamMode = (session?.max_players ?? 1) > 1;
  const allowSolo = session?.allow_solo_in_team ?? true;
  const maxPlayers = session?.max_players ?? 1;
  const randomTeams = session?.random_teams ?? false;

  // Solo mode: skip the lobby and auto-start immediately
  useEffect(() => {
    if (!session || !stored || isTeamMode || autoStartedRef.current) return;
    autoStartedRef.current = true;

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
    } catch {
      setStartError(t("startError"));
      setStarting(false);
    }
  };

  const handleJoinAsOther = () => {
    clearSessionStorage(sessionId);
    const code = session?.session_code ?? stored?.session_code ?? "";
    router.push(`/join${code ? `?code=${code}` : ""}`);
  };

  const handleLeaveTeam = async () => {
    if (!stored || leavingTeam || !teamId) return;
    setLeavingTeam(true);
    setLeaveError(null);
    try {
      const result = await leaveTeam(sessionId, stored.guest_token);
      const newTeamId = result.player.team_id;
      teamIdRef.current = newTeamId;
      setTeamId(newTeamId);
      // Update stored display_name if changed
      setSessionStorage(sessionId, {
        ...stored,
        display_name: result.player.display_name,
      });
      // Update team players from the new team
      const mePlayer: SessionPlayer = {
        ...result.player,
        guest_token: stored.guest_token,
      };
      // Build SessionPlayer list from team (members may only have TeamPlayer fields)
      const mappedPlayers: SessionPlayer[] = result.team.players.map((p) =>
        p.id === result.player.id
          ? mePlayer
          : ({
              id: p.id,
              session_id: sessionId,
              user_id: null,
              guest_name: null,
              display_name: p.display_name,
              avatar_color: p.avatar_color,
              status: p.status,
              joined_at: "",
              started_at: null,
              finished_at: null,
              team_id: result.player.team_id,
            } as SessionPlayer),
      );
      // Always ensure the switching player is visible in their new team
      const newTeamPlayers = mappedPlayers.some((p) => p.id === mePlayer.id)
        ? mappedPlayers
        : [...mappedPlayers, mePlayer];
      setTeamPlayers(newTeamPlayers);
      setMyPlayer(mePlayer);
    } catch {
      setLeaveError(t("leaveTeamError"));
    } finally {
      setLeavingTeam(false);
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

  const teamCode = teamId ? teamId.slice(-6).toUpperCase() : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-8">
        {/* Session code + team code */}
        <div className="text-center mb-8">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">
            {t("sessionCode")}
          </p>
          <div className="text-5xl font-mono font-bold text-gray-900 tracking-widest">
            {session?.session_code ?? "------"}
          </div>
          {isTeamMode && teamCode && (
            <p className="text-xs text-gray-400 mt-1">
              {t("teamCode")}:{" "}
              <span className="font-mono font-semibold text-gray-600">
                {teamCode}
              </span>
            </p>
          )}
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
                  hideName={randomTeams}
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

            {/* Leave team button (only in team mode and if random_teams is off) */}
            {isTeamMode && !randomTeams && teamId && (
              <div className="w-full">
                {leaveError && (
                  <p className="text-xs text-red-500 text-center mb-1">
                    {leaveError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleLeaveTeam}
                  disabled={leavingTeam}
                  className="w-full py-2 rounded-xl border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 text-sm transition-colors disabled:opacity-50"
                >
                  {leavingTeam ? t("leavingTeam") : t("leaveTeam")}
                </button>
              </div>
            )}

            {/* Join as another student */}
            <button
              type="button"
              onClick={handleJoinAsOther}
              className="text-xs text-blue-500 hover:text-blue-700 underline"
            >
              {t("joinAsOther")}
            </button>
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
