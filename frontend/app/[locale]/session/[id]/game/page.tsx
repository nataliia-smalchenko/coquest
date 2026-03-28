"use client";

import { BookOpen, Lightbulb, MessageSquare, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import ChatPanel from "@/components/game/ChatPanel";
import MapInteractive from "@/components/game/MapInteractive";
import ResourceModal from "@/components/game/ResourceModal";
import TimerDisplay from "@/components/game/TimerDisplay";
import { getSessionStorage, useGameSession } from "@/hooks/useGameSession";
import { usePlayerWebSocket } from "@/hooks/useWebSocket";
import { useRouter } from "@/i18n/navigation";
import { getMap } from "@/lib/api/maps";
import {
  getGameInfo,
  getMyProgress,
  getProgressResource,
  markViewed,
  playerTimeout,
  submitAnswer,
} from "@/lib/api/sessions";
import type { MapResponse } from "@/types/map";
import type { ResourceDetailPublicResponse } from "@/types/resource";
import type {
  GameInfoResponse,
  GameSession,
  SessionProgress,
} from "@/types/session";

interface AnswerResult {
  correct: boolean | null;
  score: number | null;
  requires_review: boolean;
}

export default function GamePage() {
  const t = useTranslations("game.game");
  const params = useParams();
  const router = useRouter();
  const locale = useLocale();
  const sessionId = params.id as string;

  const {
    session,
    setSession,
    myPlayer,
    setMyPlayer,
    setGuestToken,
    progress,
    setProgress,
    updateProgress,
    updatePlayer,
    chatMessages,
    handleWsMessage,
  } = useGameSession();

  const [stored, setStored] = useState<{
    guest_token: string;
    player_id: string;
  } | null>(null);
  const [gameInfo, setGameInfo] = useState<GameInfoResponse | null>(null);
  const [map, setMap] = useState<MapResponse | null>(null);
  const [loadingMap, setLoadingMap] = useState(true);

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

  // Hint overlay — shown when a new active object is revealed
  const [pendingHint, setPendingHint] = useState<string | null>(null);
  const shownHintObjects = useRef<Set<string>>(new Set());

  // Temporary highlight on the active object when user presses the hint button
  const [highlightObjectId, setHighlightObjectId] = useState<string | null>(
    null,
  );
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // The one currently assigned (and not yet completed) object
  const activeObjectId = useMemo(
    () =>
      progress.find((p) => p.status === "assigned" && p.map_object_id)
        ?.map_object_id ?? null,
    [progress],
  );

  // Personal timer: based on when THIS player started + quest time limit
  const playerEndsAt = useMemo(() => {
    const mins = gameInfo?.settings?.time_limit_minutes;
    const startedAt = myPlayer?.started_at;
    if (!mins || !startedAt) return null;
    return new Date(new Date(startedAt).getTime() + mins * 60000).toISOString();
  }, [gameInfo?.settings?.time_limit_minutes, myPlayer?.started_at]);

  // Effective timer: the earlier of the personal timer and the global session deadline
  const effectiveEndsAt = useMemo(() => {
    const candidates = [playerEndsAt, session?.ends_at].filter(
      Boolean,
    ) as string[];
    if (candidates.length === 0) return null;
    return candidates.reduce((a, b) => (new Date(a) < new Date(b) ? a : b));
  }, [playerEndsAt, session?.ends_at]);

  const showFeedback =
    session?.show_feedback_after_answer ??
    gameInfo?.settings?.show_feedback_after_answer ??
    false;
  const showFeedbackRef = useRef(showFeedback);
  showFeedbackRef.current = showFeedback;

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

  // Load game info + map + progress
  useEffect(() => {
    if (!stored) return;
    const load = async () => {
      try {
        const info = await getGameInfo(sessionId, stored.guest_token, locale);
        setGameInfo(info);
        if (info.map_slug) {
          const mapData = await getMap(info.map_slug);
          setMap(mapData);
        }
      } catch {
        // ignore
      }
      try {
        const prog = await getMyProgress(sessionId, stored.guest_token);
        setProgress(prog);
      } catch {
        // ignore — will be set via WS session_started
      }
      setLoadingMap(false);
    };
    load();
  }, [stored, sessionId, locale, setProgress]);

  // Show hint when a new active object is revealed
  useEffect(() => {
    if (!activeObjectId || !map) return;
    if (shownHintObjects.current.has(activeObjectId)) return;
    shownHintObjects.current.add(activeObjectId);

    const obj = map.objects.find((o) => o.id === activeObjectId);
    if (!obj) return;

    const localized = obj.hints.filter((h) => h.language === locale);
    const fallback = obj.hints.filter((h) => h.language === "uk");
    const candidates =
      localized.length > 0
        ? localized
        : fallback.length > 0
          ? fallback
          : obj.hints;
    if (candidates.length === 0) return;

    const hint = candidates[Math.floor(Math.random() * candidates.length)];
    setPendingHint(hint.hint_text);
  }, [activeObjectId, map, locale]);

  // WS
  const { messages, send: wsSend } = usePlayerWebSocket(sessionId, token);

  const modalProgressIdRef = useRef<string | null>(null);
  modalProgressIdRef.current = modalProgressId;

  const prevLen = useRef(0);
  useEffect(() => {
    if (messages.length === prevLen.current) return;
    const newMsgs = messages.slice(prevLen.current);
    prevLen.current = messages.length;

    for (const raw of newMsgs) {
      const data = raw as Record<string, unknown>;
      handleWsMessage(data);

      if (data.type === "connected") {
        const sess = data.session as GameSession | undefined;
        const players = Array.isArray(data.players)
          ? (data.players as import("@/types/session").SessionPlayer[])
          : [];
        if (sess) {
          setSession({ ...sess, players });
          if (stored) {
            const me = players.find((p) => p.id === stored.player_id);
            if (me) {
              setMyPlayer(me);
              // Already finished (e.g. reconnect after completing or time expiry)
              if (me.status === "finished") {
                router.push(`/session/${sessionId}/results`);
              }
            }
          }
        }
      }

      if (data.type === "session_started" || data.type === "team_started") {
        const prog = data.progress as SessionProgress[] | undefined;
        if (prog) setProgress(prog);
        const playerStartedAt = data.player_started_at as
          | string
          | null
          | undefined;
        if (playerStartedAt && stored?.player_id) {
          updatePlayer({ id: stored.player_id, started_at: playerStartedAt });
        }
      }

      if (data.type === "answer_result") {
        const prog = data.progress as SessionProgress;
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

      if (data.type === "chat_message" && !showChat) {
        setUnreadChat((n) => n + 1);
      }

      if (data.type === "player_finished") {
        const finishedId = data.player_id as string;
        const myId = stored?.player_id;
        if (finishedId === myId) {
          router.push(`/session/${sessionId}/results`);
        }
      }

      if (
        data.type === "session_completed" ||
        data.type === "session_stopped"
      ) {
        router.push(`/session/${sessionId}/results`);
      }
    }
  }, [
    messages,
    handleWsMessage,
    setSession,
    setMyPlayer,
    stored,
    setProgress,
    updateProgress,
    showChat,
    sessionId,
    router,
  ]);

  // Reset unread when chat opens
  useEffect(() => {
    if (showChat) setUnreadChat(0);
  }, [showChat]);

  const handleObjectClick = useCallback(
    async (_mapObjectId: string, progressId: string) => {
      if (!stored) return;
      setModalProgressId(progressId);
      setModalResource(null);
      setAnswerResult(null);
      setModalResourceLoading(true);
      try {
        const res = await getProgressResource(progressId, stored.guest_token);
        setModalResource(res);
      } catch {
        setModalResource(null);
      } finally {
        setModalResourceLoading(false);
      }
    },
    [stored],
  );

  const handleMarkViewed = async () => {
    if (!modalProgressId || !stored) return;
    setIsSubmitting(true);
    try {
      const updated = await markViewed(modalProgressId, stored.guest_token);
      updateProgress(updated);
      setModalProgressId(null);
      // Reload progress to pick up any queue advances
      getMyProgress(sessionId, stored.guest_token)
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
      // Reload progress to pick up any queue advances (next object)
      getMyProgress(sessionId, stored.guest_token)
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

  const modalProgress = progress.find((p) => p.id === modalProgressId) ?? null;

  const completedCount = progress.filter(
    (p) => p.status === "answered" || p.status === "viewed",
  ).length;
  // totalCount = all quest resources, including queued ones not yet on the map
  const totalCount = progress.length;

  const isAllCompleted = totalCount > 0 && completedCount === totalCount;

  // Redirect to results when all materials are completed (during gameplay or after reload)
  useEffect(() => {
    if (isAllCompleted) {
      router.push(`/session/${sessionId}/results`);
    }
  }, [isAllCompleted, sessionId, router]);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-900">
      {/* Header */}
      <header className="h-14 bg-gray-800 text-white flex items-center justify-between px-4 flex-shrink-0 z-10">
        <span className="text-sm font-medium truncate max-w-[160px]">
          {gameInfo?.quest_title ?? "Quest"}
        </span>

        <div className="flex items-center gap-3">
          {/* Timer */}
          {effectiveEndsAt && (
            <TimerDisplay
              ends_at={effectiveEndsAt}
              onExpire={async () => {
                if (playerEndsAt && stored) {
                  try {
                    await playerTimeout(sessionId, stored.guest_token);
                  } catch {
                    // ignore — backend may already have finished the player
                  }
                }
                router.push(`/session/${sessionId}/results`);
              }}
            />
          )}

          {/* Progress */}
          <span className="text-xs text-gray-400 font-mono">
            {completedCount}/{totalCount}
          </span>

          {/* Hint flash button */}
          {activeObjectId && (
            <button
              type="button"
              onClick={handleHintFlash}
              className="p-1.5 rounded-lg hover:bg-gray-700 transition-colors text-yellow-400"
              title={t("hintTitle")}
            >
              <Lightbulb size={18} />
            </button>
          )}

          {/* Chat toggle — hidden in solo mode */}
          {(session?.max_players ?? 0) > 1 && (
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

          {/* Materials toggle — hidden when keep_completed_in_materials is off */}
          {(session?.keep_completed_in_materials ??
            gameInfo?.settings?.keep_completed_in_materials ??
            true) && (
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
              <span className="text-sm">Завантаження карти...</span>
            </div>
          )}
          {!loadingMap && map && (
            <MapInteractive
              map={map}
              progress={progress}
              onObjectClick={handleObjectClick}
              activeObjectId={pendingHint ? null : activeObjectId}
              highlightObjectId={highlightObjectId}
              className="rounded-xl shadow-lg max-h-full"
            />
          )}
          {!loadingMap && !map && (
            <p className="text-gray-500 text-sm">Карта недоступна</p>
          )}
        </div>

        {/* Chat panel — only in team mode */}
        {showChat && (session?.max_players ?? 0) > 1 && (
          <div className="w-72 flex-shrink-0 border-l border-gray-700 flex flex-col">
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
        {showMaterials && (
          <div className="w-72 flex-shrink-0 border-l border-gray-700 bg-gray-800 overflow-y-auto">
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
              {progress
                .filter((p) => {
                  // Only show items that have been revealed on the map
                  if (!p.map_object_id) return false;
                  const keep =
                    session?.keep_completed_in_materials ??
                    gameInfo?.settings?.keep_completed_in_materials ??
                    true;
                  if (
                    !keep &&
                    (p.status === "viewed" || p.status === "answered")
                  )
                    return false;
                  return true;
                })
                .map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => {
                      handleObjectClick(p.map_object_id ?? "", p.id);
                      setShowMaterials(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      p.status === "assigned"
                        ? "bg-blue-900/50 text-blue-200 hover:bg-blue-900"
                        : "bg-gray-700/50 text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          p.status === "assigned"
                            ? "bg-blue-400"
                            : p.status === "viewed"
                              ? "bg-green-400"
                              : "bg-gray-400"
                        }`}
                      />
                      <span className="truncate">
                        {p.resource_id ? "Ресурс" : "—"}
                      </span>
                    </span>
                  </button>
                ))}
              {progress.length === 0 && (
                <p className="text-gray-500 text-xs text-center py-4">
                  Очікування початку...
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Completion overlay */}
      {isAllCompleted && (
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
              onClick={() => router.push(`/session/${sessionId}/results`)}
              className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors"
            >
              {t("viewResults")}
            </button>
          </div>
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
              {t("hintTitle")}
            </p>
            <p className="text-gray-800 text-base leading-relaxed">
              {pendingHint}
            </p>
            <button
              type="button"
              onClick={() => setPendingHint(null)}
              className="mt-2 w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors"
            >
              {t("hintGo")}
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
