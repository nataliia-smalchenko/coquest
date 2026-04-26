"use client";

import { BookOpen, Lightbulb, MessageSquare, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChatPanel from "@/components/game/ChatPanel";
import MapInteractive from "@/components/game/MapInteractive";
import ResourceModal from "@/components/game/ResourceModal";
import TimerDisplay from "@/components/game/TimerDisplay";
import { getRunStorage, useGameRun } from "@/hooks/useGameRun";
import { usePlayerWebSocket } from "@/hooks/useWebSocket";
import { useRouter } from "@/i18n/navigation";
import { getMap } from "@/lib/api/maps";
import {
  getGameInfo,
  getMyProgress,
  getProgressResource,
  getTeamProgress,
  getTeamStepInfo,
  markViewed,
  playerTimeout,
  submitAnswer,
} from "@/lib/api/runs";
import type { MapResponse } from "@/types/map";
import type { ResourceDetailPublicResponse } from "@/types/resource";
import type { GameInfoResponse, GameRun, RunProgress } from "@/types/run";

interface AnswerResult {
  correct: boolean | null;
  score: number | null;
  requires_review: boolean;
}

interface TeamStepInfo {
  resource_type: "question" | "text";
  active_player_id: string | null;
  hint_player_id: string | null;
  map_object_id: string | null;
  progress_updates?: Array<{
    player_id: string;
    progress_id: string;
    map_object_id: string;
    step_order: number | null;
  }>;
}

export default function GamePage() {
  const t = useTranslations("game.game");
  const params = useParams();
  const router = useRouter();
  const locale = useLocale();
  const runId = params.id as string;

  const {
    run,
    setRun,
    myPlayer,
    setMyPlayer,
    setGuestToken,
    progress,
    setProgress,
    updateProgress,
    updatePlayer,
    chatMessages,
    handleWsMessage,
  } = useGameRun();

  const [stored, setStored] = useState<{
    guest_token: string;
    player_id: string;
  } | null>(null);
  const [gameInfo, setGameInfo] = useState<GameInfoResponse | null>(null);
  const [map, setMap] = useState<MapResponse | null>(null);
  const [loadingMap, setLoadingMap] = useState(true);

  // Teammates' completed progress (for team materials panel)
  const [teamProgress, setTeamProgress] = useState<RunProgress[]>([]);

  // Cache resource titles by resource_id (populated when a resource is loaded)
  const [resourceTitles, setResourceTitles] = useState<Record<string, string>>(
    {},
  );

  // Modal state
  const [modalProgressId, setModalProgressId] = useState<string | null>(null);
  const [modalResource, setModalResource] =
    useState<ResourceDetailPublicResponse | null>(null);
  const [modalResourceLoading, setModalResourceLoading] = useState(false);
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Panel state
  const [showChat, setShowChat] = useState(false);
  const [showMaterials, setShowMaterials] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);

  // Hint overlay
  const [pendingHint, setPendingHint] = useState<string | null>(null);
  const [pendingHintIsTeam, setPendingHintIsTeam] = useState(false); // is hint for-a-teammate
  const shownHintObjects = useRef<Set<string>>(new Set());

  // Team step state: who has active object, who has hint
  const [teamStepInfo, setTeamStepInfo] = useState<TeamStepInfo | null>(null);

  // Viewers of current text step (team mode)
  const [textViewers, setTextViewers] = useState<string[]>([]);

  // Temporary highlight on the active object when user presses the hint button
  const [highlightObjectId, setHighlightObjectId] = useState<string | null>(
    null,
  );
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isTeamMode = (run?.max_players ?? 1) > 1;
  const myPlayerId = stored?.player_id ?? "";

  // The one currently assigned (and not yet completed) map object in MY progress
  const activeProgress = useMemo(
    () =>
      progress.find((p) => p.status === "assigned" && p.map_object_id) ?? null,
    [progress],
  );
  const activeObjectId = activeProgress?.map_object_id ?? null;

  // In team mode: am I the active player for current question step?
  const iAmActivePlayer =
    !isTeamMode ||
    !teamStepInfo ||
    teamStepInfo.resource_type === "text" ||
    teamStepInfo.active_player_id === myPlayerId ||
    teamStepInfo.active_player_id === null;

  const handleHintFlash = () => {
    if (!activeObjectId) return;
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightObjectId(activeObjectId);
    highlightTimerRef.current = setTimeout(
      () => setHighlightObjectId(null),
      1200,
    );
  };

  const token = stored?.guest_token ?? "";

  // Personal timer
  const playerEndsAt = useMemo(() => {
    const mins = gameInfo?.settings?.time_limit_minutes;
    const startedAt = myPlayer?.started_at;
    if (!mins || !startedAt) return null;
    return new Date(new Date(startedAt).getTime() + mins * 60000).toISOString();
  }, [gameInfo?.settings?.time_limit_minutes, myPlayer?.started_at]);

  const effectiveEndsAt = useMemo(() => {
    const candidates = [playerEndsAt, run?.ends_at].filter(Boolean) as string[];
    if (candidates.length === 0) return null;
    return candidates.reduce((a, b) => (new Date(a) < new Date(b) ? a : b));
  }, [playerEndsAt, run?.ends_at]);

  const showFeedback =
    run?.show_feedback_after_answer ??
    gameInfo?.settings?.show_feedback_after_answer ??
    false;
  const showFeedbackRef = useRef(showFeedback);
  showFeedbackRef.current = showFeedback;

  const keepCompleted =
    run?.keep_completed_in_materials ??
    gameInfo?.settings?.keep_completed_in_materials ??
    true;

  // Load stored run data
  useEffect(() => {
    const s = getRunStorage(runId);
    if (!s) {
      router.push("/join");
      return;
    }
    setStored(s);
    setGuestToken(s.guest_token);
  }, [runId, router, setGuestToken]);

  // Load game info + map + progress
  useEffect(() => {
    if (!stored) return;
    const load = async () => {
      try {
        const info = await getGameInfo(runId, stored.guest_token, locale);
        setGameInfo(info);
        if (info.map_slug) {
          const mapData = await getMap(info.map_slug, locale);
          setMap(mapData);
        }
      } catch {
        // ignore
      }
      try {
        const prog = await getMyProgress(runId, stored.guest_token);
        setProgress(prog);
      } catch {
        // ignore
      }
      setLoadingMap(false);
    };
    load();
  }, [stored, runId, locale, setProgress]);

  // In team mode: load team progress for materials panel (reconnect case)
  useEffect(() => {
    if (!stored || !isTeamMode) return;
    getTeamProgress(runId, stored.guest_token)
      .then(setTeamProgress)
      .catch(() => {});
  }, [stored, runId, isTeamMode]);

  // In team mode: load initial step info (hint/active player) for reconnect/page-load case
  useEffect(() => {
    if (!stored || !isTeamMode || !myPlayer?.team_id || !map) return;
    getTeamStepInfo(runId, myPlayer.team_id, stored.guest_token).then((si) => {
      if (!si) return;
      setTeamStepInfo(si as TeamStepInfo);
      // Show hint if I am the hint player
      if (si.hint_player_id === stored.player_id && si.map_object_id) {
        const obj = map.objects.find((o) => o.id === si.map_object_id);
        if (obj?.hints[0]) {
          setPendingHint(obj.hints[0].hint_text);
          setPendingHintIsTeam(
            si.resource_type === "question" &&
              si.active_player_id !== stored.player_id,
          );
        }
      }
    });
  }, [stored, runId, isTeamMode, myPlayer?.team_id, map]);

  // Show hint when a new active object is revealed
  // Solo mode only — team mode uses WS team_step events
  // Track by progress ID so recycled objects show hints again
  useEffect(() => {
    if (isTeamMode) return;
    if (!activeObjectId || !activeProgress?.id || !map) return;
    if (shownHintObjects.current.has(activeProgress.id)) return;
    shownHintObjects.current.add(activeProgress.id);

    const obj = map.objects.find((o) => o.id === activeObjectId);
    if (!obj?.hints[0]) return;

    setPendingHint(obj.hints[0].hint_text);
    setPendingHintIsTeam(false);
  }, [activeObjectId, activeProgress, map, isTeamMode]);

  // Handle team_step event: show hint to hint player
  const handleTeamStepEvent = useCallback(
    (stepInfo: TeamStepInfo) => {
      setTeamStepInfo(stepInfo);
      setTextViewers([]);

      // Show hint to hint player
      if (
        stepInfo.hint_player_id === myPlayerId &&
        stepInfo.map_object_id &&
        map
      ) {
        const obj = map.objects.find((o) => o.id === stepInfo.map_object_id);
        if (obj?.hints[0]) {
          setPendingHint(obj.hints[0].hint_text);
          // "for teammate" only when hint player is NOT the active player
          setPendingHintIsTeam(
            stepInfo.resource_type === "question" &&
              stepInfo.active_player_id !== myPlayerId,
          );
        }
      }
    },
    [myPlayerId, map],
  );

  const modalProgressIdRef = useRef<string | null>(null);
  modalProgressIdRef.current = modalProgressId;

  // Refs for mutable values read inside the WS handler.
  // Using refs avoids stale closures without putting them in useCallback deps
  // (which would recreate the callback on every state change and cause reconnects).
  const storedRef = useRef(stored);
  storedRef.current = stored;
  const isTeamModeRef = useRef(isTeamMode);
  isTeamModeRef.current = isTeamMode;
  const showChatRef = useRef(showChat);
  showChatRef.current = showChat;
  const handleTeamStepEventRef = useRef(handleTeamStepEvent);
  handleTeamStepEventRef.current = handleTeamStepEvent;
  const myPlayerIdRef = useRef(myPlayerId);
  myPlayerIdRef.current = myPlayerId;

  const handleWsMessageCb = useCallback(
    (raw: unknown) => {
      const data = raw as Record<string, unknown>;
      handleWsMessage(data);

      if (data.type === "connected") {
        const run = data.run as GameRun | undefined;
        const players = Array.isArray(data.players)
          ? (data.players as import("@/types/run").RunPlayer[])
          : [];
        if (run) {
          setRun({ ...run, players });
          const current = storedRef.current;
          if (current) {
            const me = players.find((p) => p.id === current.player_id);
            if (me) {
              setMyPlayer(me);
              if (me.status === "finished") {
                router.push(`/run/${runId}/results`);
              }
            }
          }
        }
      }

      if (data.type === "run_started") {
        const prog = data.progress as RunProgress[] | undefined;
        if (prog) setProgress(prog);
        const playerStartedAt = data.player_started_at as
          | string
          | null
          | undefined;
        if (playerStartedAt && storedRef.current?.player_id) {
          updatePlayer({
            id: storedRef.current.player_id,
            started_at: playerStartedAt,
          });
        }
      }

      if (data.type === "team_started") {
        const prog = data.progress as RunProgress[] | undefined;
        if (prog) setProgress(prog);
        const playerStartedAt = data.player_started_at as
          | string
          | null
          | undefined;
        if (playerStartedAt && storedRef.current?.player_id) {
          updatePlayer({
            id: storedRef.current.player_id,
            started_at: playerStartedAt,
          });
        }
        // Apply initial step info for hint/active player
        const si = data.step_info as TeamStepInfo | undefined;
        if (si?.hint_player_id) {
          handleTeamStepEventRef.current({ ...si, progress_updates: [] });
        }
      }

      if (data.type === "answer_result") {
        const prog = data.progress as RunProgress;
        if (prog) updateProgress(prog);
        if (
          showFeedbackRef.current &&
          prog?.id === modalProgressIdRef.current
        ) {
          setAnswerResult({
            correct: (data.correct as boolean | null) ?? null,
            score: (data.score as number | null) ?? null,
            requires_review: prog.requires_review,
          });
        }
      }

      if (data.type === "team_step_advanced") {
        const si = data as unknown as TeamStepInfo & {
          completed_by_progress?: RunProgress | null;
        };
        handleTeamStepEventRef.current(si);

        // Add teammate's completed question to team materials
        if (si.completed_by_progress && si.resource_type === "question") {
          const cp = si.completed_by_progress;
          if (cp.player_id !== myPlayerIdRef.current) {
            setTeamProgress((prev) => {
              const exists = prev.some((p) => p.id === cp.id);
              return exists ? prev : [...prev, cp];
            });
          }
        }
        // Reload own progress to pick up newly activated items
        const current = storedRef.current;
        if (current) {
          getMyProgress(runId, current.guest_token)
            .then(setProgress)
            .catch(() => {});
        }
      }

      if (data.type === "team_text_viewed") {
        const viewers = data.viewers as string[] | undefined;
        if (viewers) setTextViewers(viewers);
      }

      if (data.type === "chat_message" && !showChatRef.current) {
        setUnreadChat((n) => n + 1);
      }

      if (data.type === "player_finished") {
        const finishedId = data.player_id as string;
        // Solo mode: redirect immediately. Team mode: isTeamDone derived state handles the overlay.
        if (
          finishedId === storedRef.current?.player_id &&
          !isTeamModeRef.current
        ) {
          router.push(`/run/${runId}/results`);
        }
      }

      if (data.type === "run_completed" || data.type === "run_stopped") {
        router.push(`/run/${runId}/results`);
      }
    },
    // All mutable values are read via refs — deps here are stable references only
    [
      handleWsMessage,
      setRun,
      setMyPlayer,
      setProgress,
      updateProgress,
      updatePlayer,
      runId,
      router,
    ],
  );

  // WS
  const { send: wsSend, reconnecting } = usePlayerWebSocket(
    runId,
    token,
    handleWsMessageCb,
  );

  // Reset unread when chat opens
  useEffect(() => {
    if (showChat) setUnreadChat(0);
  }, [showChat]);

  const handleObjectClick = useCallback(
    async (_mapObjectId: string, progressId: string) => {
      if (!stored) return;
      // Check if this is a completed item (own or teammate's)
      const ownItem = progress.find((p) => p.id === progressId);
      const teamItem = teamProgress.find((p) => p.id === progressId);
      const isCompleted =
        ownItem?.status === "answered" ||
        ownItem?.status === "viewed" ||
        !!teamItem;
      // In team mode: block interaction on active (assigned) items for non-active players
      if (
        isTeamMode &&
        !isCompleted &&
        teamStepInfo &&
        teamStepInfo.resource_type === "question"
      ) {
        if (!ownItem) return;
      }
      setModalProgressId(progressId);
      setModalResource(null);
      setAnswerResult(null);
      setModalResourceLoading(true);
      try {
        const res = await getProgressResource(progressId, stored.guest_token);
        setModalResource(res);
        // Cache the title for the materials panel
        const prog =
          progress.find((p) => p.id === progressId) ??
          teamProgress.find((p) => p.id === progressId);
        if (prog?.resource_id && res.title) {
          setResourceTitles((prev) => ({
            ...prev,
            [prog.resource_id ?? ""]: res.title,
          }));
        }
      } catch {
        setModalResource(null);
      } finally {
        setModalResourceLoading(false);
      }
    },
    [stored, isTeamMode, teamStepInfo, progress, teamProgress],
  );

  const handleMarkViewed = async () => {
    if (!modalProgressId || !stored) return;
    setIsSubmitting(true);
    try {
      const updated = await markViewed(modalProgressId, stored.guest_token);
      updateProgress(updated);
      setModalProgressId(null);
      getMyProgress(runId, stored.guest_token)
        .then(setProgress)
        .catch(() => {});
    } catch {
      // ignore
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitAnswer = async (answer: Record<string, unknown>) => {
    if (!modalProgressId || !stored) return;
    setIsSubmitting(true);
    try {
      const updated = await submitAnswer(
        modalProgressId,
        answer,
        stored.guest_token,
      );
      updateProgress(updated);
      if (showFeedback) {
        setAnswerResult({
          correct: updated.score !== null ? updated.score >= 1 : null,
          score: updated.score ?? null,
          requires_review: updated.requires_review,
        });
      } else {
        setModalProgressId(null);
        setAnswerResult(null);
      }
      getMyProgress(runId, stored.guest_token)
        .then(setProgress)
        .catch(() => {});
    } catch {
      // ignore
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendChat = useCallback(
    (message: string) => {
      wsSend({ type: "chat_message", message });
    },
    [wsSend],
  );

  const modalProgress =
    progress.find((p) => p.id === modalProgressId) ??
    teamProgress.find((p) => p.id === modalProgressId) ??
    null;

  const completedCount = progress.filter(
    (p) => p.status === "answered" || p.status === "viewed",
  ).length;
  const totalCount = progress.length;

  const isAllCompleted = totalCount > 0 && completedCount === totalCount;

  // Team done: every player on my team has status "finished"
  const isTeamDone = useMemo(() => {
    if (!isTeamMode || !myPlayer?.team_id) return false;
    const teamPlayers = (run?.players ?? []).filter(
      (p) => p.team_id === myPlayer.team_id,
    );
    return (
      teamPlayers.length > 0 &&
      teamPlayers.every((p) => p.status === "finished")
    );
  }, [isTeamMode, myPlayer?.team_id, run?.players]);

  // Solo redirect is handled by the "player_finished" WS event (see handleWsMessageCb).
  // Do NOT redirect based on isAllCompleted — the local progress array may be transiently
  // "all done" before newly queued items arrive from the server via getMyProgress().

  // Team text step: waiting info
  const totalTeamMembers =
    run?.players?.filter((p) => p.team_id === myPlayer?.team_id).length ?? 0;

  const isWaitingForTeammates =
    isTeamMode &&
    teamStepInfo?.resource_type === "text" &&
    textViewers.length > 0 &&
    textViewers.length < totalTeamMembers &&
    textViewers.includes(myPlayerId);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-900">
      {/* Reconnecting banner */}
      {reconnecting && (
        <div className="bg-yellow-500 text-yellow-950 text-xs font-medium text-center py-1 flex-shrink-0">
          {t("reconnecting")}
        </div>
      )}

      {/* Header */}
      <header className="h-14 bg-gray-800 text-white flex items-center justify-between px-4 flex-shrink-0 z-10">
        <span className="text-sm font-medium truncate max-w-[160px]">
          {gameInfo?.quest_title ?? "Quest"}
        </span>

        <div className="flex items-center gap-3">
          {effectiveEndsAt && (
            <TimerDisplay
              ends_at={effectiveEndsAt}
              onExpire={async () => {
                if (playerEndsAt && stored) {
                  try {
                    await playerTimeout(runId, stored.guest_token);
                  } catch {
                    // ignore
                  }
                }
                router.push(`/run/${runId}/results`);
              }}
            />
          )}

          <span className="text-xs text-gray-400 font-mono">
            {completedCount}/{totalCount}
          </span>

          {/* Hint flash button — solo or active player in team */}
          {activeObjectId && iAmActivePlayer && (
            <button
              type="button"
              onClick={handleHintFlash}
              className="p-1.5 rounded-lg hover:bg-gray-700 transition-colors text-yellow-400"
              title={t("hintTitle")}
            >
              <Lightbulb size={18} />
            </button>
          )}

          {/* Chat toggle — only in team mode */}
          {isTeamMode && (
            <button
              type="button"
              onClick={() => {
                setShowChat((v) => !v);
                setShowMaterials(false);
              }}
              className="relative p-1.5 rounded-lg hover:bg-gray-700 transition-colors"
            >
              <MessageSquare size={18} />
              {unreadChat > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {unreadChat > 9 ? "9+" : unreadChat}
                </span>
              )}
            </button>
          )}

          {keepCompleted && (
            <button
              type="button"
              onClick={() => {
                setShowMaterials((v) => !v);
                setShowChat(false);
              }}
              className="p-1.5 rounded-lg hover:bg-gray-700 transition-colors"
            >
              <BookOpen size={18} />
            </button>
          )}
        </div>
      </header>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Map */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-2 min-w-0">
          {loadingMap && (
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">{t("loadingMap")}</span>
            </div>
          )}
          {!loadingMap && map && (
            <MapInteractive
              map={map}
              progress={progress}
              onObjectClick={handleObjectClick}
              activeObjectId={
                pendingHint ? null : iAmActivePlayer ? activeObjectId : null
              }
              highlightObjectId={highlightObjectId}
              className="rounded-xl shadow-lg max-h-full"
            />
          )}
          {!loadingMap && !map && (
            <p className="text-gray-500 text-sm">{t("mapUnavailable")}</p>
          )}
        </div>

        {/* Chat panel */}
        {showChat && isTeamMode && (
          <div className="fixed right-0 top-14 bottom-0 z-30 w-72 bg-gray-800 flex flex-col border-l border-gray-700 sm:relative sm:top-auto sm:bottom-auto sm:inset-x-auto sm:z-auto sm:flex-shrink-0">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 flex-shrink-0">
              <span className="text-sm font-medium text-white">
                {t("chat")}
              </span>
              <button
                type="button"
                onClick={() => setShowChat(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <ChatPanel
                messages={chatMessages}
                myPlayerId={myPlayer?.id ?? ""}
                onSend={handleSendChat}
              />
            </div>
          </div>
        )}

        {/* Materials panel */}
        {showMaterials && keepCompleted && (
          <div className="fixed right-0 top-14 bottom-0 z-30 w-72 bg-gray-800 overflow-y-auto border-l border-gray-700 sm:relative sm:top-auto sm:bottom-auto sm:inset-x-auto sm:z-auto sm:flex-shrink-0">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
              <span className="text-sm font-medium text-white">
                {t("materials")}
              </span>
              <button
                type="button"
                onClick={() => setShowMaterials(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-3 space-y-2">
              {/* Own completed items */}
              {progress
                .filter((p) => p.status === "answered" || p.status === "viewed")
                .map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => {
                      handleObjectClick(p.map_object_id ?? "", p.id);
                      setShowMaterials(false);
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors bg-gray-700/50 text-gray-300 hover:bg-gray-700"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          p.status === "viewed" ? "bg-green-400" : "bg-gray-400"
                        }`}
                      />
                      <span className="truncate">
                        {(p.resource_id && resourceTitles[p.resource_id]) ||
                          (p.resource_id ? t("resource") : "—")}
                      </span>
                    </span>
                  </button>
                ))}
              {/* Team mode: show teammates' completed questions */}
              {isTeamMode &&
                teamProgress
                  .filter((p) => p.status === "answered")
                  .map((p) => {
                    const teammate = run?.players.find(
                      (pl) => pl.id === p.player_id,
                    );
                    return (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => {
                          handleObjectClick(p.map_object_id ?? "", p.id);
                          setShowMaterials(false);
                        }}
                        className="w-full text-left px-3 py-2.5 rounded-lg text-sm bg-purple-900/30 text-purple-200 hover:bg-purple-900/50 transition-colors"
                      >
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0 bg-purple-400" />
                          <span className="truncate">
                            {teammate
                              ? t("teamAnsweredBy", {
                                  name: teammate.display_name,
                                })
                              : t("resource")}
                          </span>
                        </span>
                      </button>
                    );
                  })}
              {progress.length === 0 && (
                <p className="text-gray-500 text-xs text-center py-4">
                  {t("waitingStart")}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Completion overlay */}
      {(isTeamMode ? isTeamDone : isAllCompleted) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center text-3xl">
              🎉
            </div>
            <p className="text-lg font-bold text-gray-900">{t("completed")}</p>
            <button
              type="button"
              onClick={() => router.push(`/run/${runId}/results`)}
              className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors"
            >
              {t("viewResults")}
            </button>
          </div>
        </div>
      )}

      {/* Team text step: waiting for teammates overlay */}
      {isWaitingForTeammates && !pendingHint && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 px-4 py-3 rounded-2xl shadow-lg text-sm font-medium text-white"
          style={{ backgroundColor: "rgba(30,30,50,0.9)", maxWidth: "320px" }}
        >
          {t("teamWaitingViewers", {
            count: textViewers.length,
            total: totalTeamMembers,
          })}
        </div>
      )}

      {/* Hint overlay */}
      {pendingHint && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center text-2xl">
              🗺️
            </div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              {pendingHintIsTeam
                ? t("teamHintForTeammate")
                : teamStepInfo?.resource_type === "text"
                  ? t("teamHintForText")
                  : t("hintTitle")}
            </p>
            <p className="text-gray-800 text-base leading-relaxed">
              {pendingHint}
            </p>
            <button
              type="button"
              onClick={() => setPendingHint(null)}
              className="mt-2 w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors"
            >
              {pendingHintIsTeam ? t("teamHintDismiss") : t("hintGo")}
            </button>
          </div>
        </div>
      )}

      {/* Resource modal */}
      {modalProgressId && modalProgress && (
        <ResourceModal
          progress={modalProgress}
          resource={modalResource}
          loading={modalResourceLoading}
          answerResult={answerResult}
          onClose={() => {
            setModalProgressId(null);
            setAnswerResult(null);
          }}
          onMarkViewed={handleMarkViewed}
          onSubmitAnswer={handleSubmitAnswer}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}
