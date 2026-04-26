"use client";

import Cookies from "js-cookie";
import {
  AlertTriangle,
  Check,
  CheckCircle,
  Clock,
  Copy,
  ExternalLink,
  Pencil,
  Play,
  RefreshCw,
  Settings,
  Square,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TimerDisplay from "@/components/game/TimerDisplay";
import { useTeacherWebSocket } from "@/hooks/useWebSocket";
import { Link, useRouter } from "@/i18n/navigation";
import {
  deletePlayer,
  deleteRun,
  getMonitor,
  getPlayerProgressDetail,
  restartRun,
  reviewAnswer,
  startRun,
  stopRun,
  updateGuestName,
  updateRunSettings,
} from "@/lib/api/runs";
import { sanitizeHtml } from "@/lib/sanitize";
import type {
  GameRun,
  PlayerProgressSummary,
  RunProgressResult,
  RunUpdate,
  TeacherMonitorResponse,
} from "@/types/run";

// helpers
function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(iso: string, locale: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const time = d.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} ${time}`;
}

function formatDuration(startedAt: string, finishedAt: string) {
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function SettingChip({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs rounded-full font-medium ${
        on ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400"
      }`}
      style={{ padding: "3px 10px" }}
    >
      {on ? <Check size={11} /> : <X size={11} />}
      {label}
    </span>
  );
}

const SEGMENT_COLORS = {
  correct: "#4ade80",
  incorrect: "#f87171",
  viewed: "#60a5fa",
  pending: "#9ca3af",
};

// Segmented bar: correct=green, incorrect=red, viewed=blue, pending=gray
function SegmentedProgressBar({ pp }: { pp: PlayerProgressSummary }) {
  const { total, correct, incorrect, viewed, pending_review } = pp;
  if (total === 0) return null;

  const segments = [
    { count: correct, color: SEGMENT_COLORS.correct },
    { count: incorrect, color: SEGMENT_COLORS.incorrect },
    { count: viewed, color: SEGMENT_COLORS.viewed },
    { count: pending_review, color: SEGMENT_COLORS.pending },
  ];

  return (
    <div className="w-full flex rounded-full h-2 overflow-hidden bg-gray-100 gap-px">
      {segments.map(({ count, color }) =>
        count > 0 ? (
          <div
            key={color}
            className="h-full transition-all duration-300"
            style={{
              width: `${(count / total) * 100}%`,
              backgroundColor: color,
            }}
          />
        ) : null,
      )}
    </div>
  );
}

function SegmentLegend({
  pp,
  t,
}: {
  pp: PlayerProgressSummary;
  t: ReturnType<typeof useTranslations<"game.monitor">>;
}) {
  const items = [
    { count: pp.correct, color: SEGMENT_COLORS.correct, label: t("correct") },
    {
      count: pp.incorrect,
      color: SEGMENT_COLORS.incorrect,
      label: t("incorrect"),
    },
    { count: pp.viewed, color: SEGMENT_COLORS.viewed, label: t("viewedText") },
    {
      count: pp.pending_review,
      color: SEGMENT_COLORS.pending,
      label: t("pendingReview"),
    },
  ];
  return (
    <div className="flex flex-wrap mt-1">
      {items
        .filter((it) => it.count > 0)
        .map((it) => (
          <span
            key={it.label}
            className="flex items-center gap-1.5 text-xs text-gray-500 mr-2"
          >
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: it.color }}
            />
            {it.count} {it.label.toLocaleLowerCase()}
          </span>
        ))}
    </div>
  );
}

// Player detail drawer

function PlayerDetailDrawer({
  runId,
  pp,
  onClose,
  onReviewed,
  t,
}: {
  runId: string;
  pp: PlayerProgressSummary;
  onClose: () => void;
  onReviewed: () => void;
  t: ReturnType<typeof useTranslations<"game.monitor">>;
}) {
  const [items, setItems] = useState<RunProgressResult[] | null>(null);
  const [reviewScores, setReviewScores] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    getPlayerProgressDetail(runId, pp.player.id)
      .then(setItems)
      .catch(() => setItems([]));
  }, [runId, pp.player.id]);

  const handleReview = async (progressId: string) => {
    const raw = reviewScores[progressId];
    if (raw === undefined || raw === "") return;
    const score = Math.min(100, Math.max(0, Number(raw))) / 100;
    setSubmitting(progressId);
    try {
      await reviewAnswer(progressId, score);
      onReviewed();
      // Refresh items
      const updated = await getPlayerProgressDetail(runId, pp.player.id);
      setItems(updated);
    } catch {
      // ignore
    } finally {
      setSubmitting(null);
    }
  };

  // Only show items this player actually answered/viewed (skip unstarted)
  // Unreviewed open questions float to the top, the rest sorted by step_order (quest order)
  const questionItems = (items ?? [])
    .filter((p) => p.question !== null && p.status !== "assigned")
    .sort((a, b) => {
      const aPending = a.requires_review && a.score === null ? 0 : 1;
      const bPending = b.requires_review && b.score === null ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      return (a.step_order ?? 0) - (b.step_order ?? 0);
    });
  const textItems = (items ?? []).filter(
    (p) =>
      p.question === null &&
      p.resource_title !== null &&
      p.status !== "assigned",
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismisses drawer on click
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        justifyContent: "flex-end",
        backgroundColor: "rgba(0,0,0,0.4)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div
            className="rounded-full flex items-center justify-center text-white font-bold text-sm"
            style={{
              backgroundColor: pp.player.avatar_color,
              width: 36,
              height: 36,
              minWidth: 36,
              minHeight: 36,
            }}
          >
            {pp.player.display_name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 truncate">
              {pp.player.display_name}
            </p>
            <p className="text-xs text-gray-400">
              {pp.completed}/{pp.total}
              {pp.grade != null
                ? ` · ${t("numberOfPoints")}: ${pp.total_score ?? 0}/${pp.max_score} · ${t("scoreLabel")}: ${pp.grade}/${pp.max_grade}`
                : pp.max_score != null && pp.max_score > 0
                  ? ` · ${t("numberOfPoints")}: ${pp.total_score ?? 0}/${pp.max_score}`
                  : pp.score !== null
                    ? ` · ${Math.round(pp.score * 100)}%`
                    : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items === null ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Questions */}
              {questionItems.map((p) => {
                const isCorrect = p.score !== null && p.score >= 1;
                const isPending = p.requires_review && p.score === null;
                const isWrong =
                  p.status === "answered" && !isCorrect && !isPending;
                const notStarted = p.status === "assigned";

                let cardBorderColor = "#e5e7eb";
                let cardBg = "#ffffff";
                if (isPending) {
                  cardBorderColor = "#9ca3af";
                  cardBg = "#ffffff";
                } else if (isCorrect) {
                  cardBorderColor = "#86efac";
                  cardBg = "#f0fdf4";
                } else if (isWrong) {
                  cardBorderColor = "#fca5a5";
                  cardBg = "#fef2f2";
                } else if (notStarted) {
                  cardBorderColor = "#e5e7eb";
                  cardBg = "#f9fafb";
                }

                // Get selected options
                const q = p.question ?? {
                  question_type: "open",
                  options: [],
                  body: "",
                  points: 0,
                  correct_answers: [] as string[],
                };
                const answer = p.answer as Record<string, unknown> | null;
                const isChoice =
                  q.question_type === "single" ||
                  q.question_type === "multiple";
                const selectedIds: string[] =
                  isChoice && answer
                    ? q.question_type === "single"
                      ? [
                          String(
                            (answer as Record<string, unknown>).option_id ?? "",
                          ),
                        ]
                      : (
                          ((answer as Record<string, unknown>)
                            .option_ids as string[]) ?? []
                        ).map(String)
                    : [];
                const typedText =
                  !isChoice &&
                  answer &&
                  typeof (answer as Record<string, unknown>).text === "string"
                    ? String((answer as Record<string, unknown>).text)
                    : "";

                return (
                  <div
                    key={p.id}
                    className="rounded-xl p-4"
                    style={{
                      border: `1px solid ${cardBorderColor}`,
                      backgroundColor: cardBg,
                    }}
                  >
                    {/* Title row */}
                    <div className="flex items-start gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        {p.resource_title && (
                          <p className="text-xs font-medium text-gray-500 mb-1 truncate">
                            {p.resource_title}
                          </p>
                        )}
                        <div
                          className="tiptap-preview text-sm text-gray-800 font-medium"
                          // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized
                          dangerouslySetInnerHTML={{
                            __html: sanitizeHtml(q.body),
                          }}
                        />
                      </div>
                      <div className="flex-shrink-0 mt-0.5">
                        {isCorrect && (
                          <CheckCircle size={16} className="text-green-500" />
                        )}
                        {isWrong && <X size={16} className="text-red-400" />}
                        {isPending && (
                          <Clock size={16} className="text-gray-400" />
                        )}
                        {notStarted && (
                          <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                        )}
                      </div>
                    </div>

                    {/* Score badge */}
                    {p.score !== null && (
                      <p className="text-xs text-gray-500 mb-2">
                        {t("scoreLabel")}:{" "}
                        {`${+(p.score * q.points).toFixed(1)}/${q.points} ${t("pointsUnit")}`}
                      </p>
                    )}

                    {/* Choice options */}
                    {isChoice && q.options.length > 0 && (
                      <ul className="space-y-1 mb-2">
                        {q.options.map((opt) => {
                          const sel = selectedIds.includes(opt.id);
                          let optBorder = "#e5e7eb";
                          let optBg = "#ffffff";
                          let optColor = "#374151";
                          let optFontWeight = "normal";
                          if (opt.is_correct && sel) {
                            optBorder = "#16a34a";
                            optBg = "#dcfce7";
                            optColor = "#14532d";
                            optFontWeight = "600";
                          } else if (opt.is_correct) {
                            optBorder = "#86efac";
                            optBg = "#f0fdf4";
                            optColor = "#15803d";
                          } else if (sel) {
                            optBorder = "#ef4444";
                            optBg = "#fee2e2";
                            optColor = "#7f1d1d";
                            optFontWeight = "600";
                          }
                          return (
                            <li
                              key={opt.id}
                              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs"
                              style={{
                                border: `1px solid ${optBorder}`,
                                backgroundColor: optBg,
                                color: optColor,
                                fontWeight: optFontWeight,
                              }}
                            >
                              <span className="flex-1">
                                {opt.image_url && (
                                  <Image
                                    src={opt.image_url}
                                    alt=""
                                    width={0}
                                    height={0}
                                    sizes="200px"
                                    className="rounded mb-1"
                                    style={{
                                      width: "auto",
                                      maxHeight: "6rem",
                                      objectFit: "contain",
                                    }}
                                  />
                                )}
                                {opt.text}
                              </span>
                              {opt.is_correct && (
                                <CheckCircle
                                  size={12}
                                  className="text-green-600 flex-shrink-0"
                                />
                              )}
                              {sel && !opt.is_correct && (
                                <X
                                  size={12}
                                  className="text-red-500 flex-shrink-0"
                                />
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {/* Text/open answer */}
                    {!isChoice && typedText && (
                      <div
                        className="border bg-blue-50 rounded-lg px-3 py-2 text-xs text-gray-800 mb-2"
                        style={{
                          border: "1px solid #8EC5FF",
                        }}
                      >
                        <span className="block text-blue-500 font-medium mb-0.5">
                          {t("playerDetail")}
                        </span>
                        {typedText}
                      </div>
                    )}
                    {!isChoice && q.correct_answers.length > 0 && (
                      <div className="border border-green-200 bg-green-50 rounded-lg px-3 py-2 text-xs text-gray-800 mb-2">
                        <span className="block text-green-600 font-medium mb-0.5">
                          {t("correctAnswer")}
                        </span>
                        {q.correct_answers.join(" / ")}
                      </div>
                    )}

                    {/* Review form */}
                    {isPending && (
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          placeholder={t("reviewScore")}
                          value={reviewScores[p.id] ?? ""}
                          onChange={(e) =>
                            setReviewScores((prev) => ({
                              ...prev,
                              [p.id]: e.target.value,
                            }))
                          }
                          className="flex-1 border border-gray-300 rounded-lg px-2.5 py-1 text-sm  bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleReview(p.id)}
                          disabled={submitting === p.id || !reviewScores[p.id]}
                          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                        >
                          {submitting === p.id ? "..." : t("submitReview")}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Text materials summary */}
              {textItems.length > 0 && (
                <div className="border border-gray-200 rounded-xl p-4 bg-white">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    {t("viewedText")}
                  </p>
                  <ul className="space-y-1">
                    {textItems.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center gap-2 text-sm text-gray-700"
                      >
                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            p.status === "viewed"
                              ? "bg-blue-400"
                              : "bg-gray-300"
                          }`}
                        />
                        <span className="flex-1 truncate">
                          {p.resource_title ?? "—"}
                        </span>
                        {p.status === "viewed" && (
                          <span className="text-xs text-blue-500 font-medium">
                            {t("viewedText")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {questionItems.length === 0 && textItems.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-12">
                  {t("notStarted")}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const TEAM_PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
  "#84cc16",
];

// main page

export default function MonitorPage() {
  const t = useTranslations("game.monitor");
  const tRun = useTranslations("game.run");
  const tCommon = useTranslations("common");
  const params = useParams();
  const router = useRouter();
  const runId = params.id as string;

  const locale = useLocale();
  const token = Cookies.get("access_token") ?? "";

  const [monitor, setMonitor] = useState<TeacherMonitorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [stopping, setStopping] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [run, setRun] = useState<GameRun | null>(null);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  const [showDeleteRun, setShowDeleteRun] = useState(false);
  const [deletingRun, setDeletingRun] = useState(false);

  const [deletePlayerId, setDeletePlayerId] = useState<string | null>(null);
  const [deletingPlayer, setDeletingPlayer] = useState(false);

  const [renamePlayerId, setRenamePlayerId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  // Edit settings
  const [showEditSettings, setShowEditSettings] = useState(false);
  const [editForm, setEditForm] = useState<RunUpdate>({});
  const [savingSettings, setSavingSettings] = useState(false);

  // Restart
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [restarting, setRestarting] = useState(false);

  // Detail drawer
  const [detailPlayer, setDetailPlayer] =
    useState<PlayerProgressSummary | null>(null);

  const handleStart = async () => {
    setStarting(true);
    try {
      const updated = await startRun(runId);
      setRun(updated);
    } catch {
      // ignore
    } finally {
      setStarting(false);
    }
  };

  const handleCopyLink = () => {
    if (!run?.join_code) return;
    const url = `${window.location.origin}/join?code=${run.join_code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDeleteRun = async () => {
    setDeletingRun(true);
    try {
      await deleteRun(runId);
      router.push("/teacher/runs");
    } catch {
      // ignore
    } finally {
      setDeletingRun(false);
    }
  };

  const handleDeletePlayer = async () => {
    if (!deletePlayerId) return;
    setDeletingPlayer(true);
    try {
      await deletePlayer(runId, deletePlayerId);
      setDeletePlayerId(null);
      const data = await getMonitor(runId);
      setMonitor(data);
      setRun((s) => (s ? { ...data.run, status: s.status } : data.run));
    } catch {
      // ignore
    } finally {
      setDeletingPlayer(false);
    }
  };

  const handleStartRename = (playerId: string, currentName: string) => {
    setRenamePlayerId(playerId);
    setRenameValue(currentName);
  };

  const handleSaveRename = async () => {
    if (!renamePlayerId) return;
    setRenameSaving(true);
    try {
      await updateGuestName(runId, renamePlayerId, renameValue.trim() || null);
      setRenamePlayerId(null);
      const data = await getMonitor(runId);
      setMonitor(data);
      setRun((s) => (s ? { ...data.run, status: s.status } : data.run));
    } catch {
      // ignore
    } finally {
      setRenameSaving(false);
    }
  };

  const handleOpenEditSettings = () => {
    if (!run) return;
    setEditForm({
      name: run.name ?? "",
      show_feedback_after_answer: run.show_feedback_after_answer,
      show_score_after: run.show_score_after,
      show_correct_answers: run.show_correct_answers,
      keep_completed_in_materials: run.keep_completed_in_materials,
      ends_at: run.ends_at ?? undefined,
      scheduled_at: run.scheduled_at ?? undefined,
    });
    setShowEditSettings(true);
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const payload: RunUpdate = { ...editForm };
      // Convert empty string name to null
      if (payload.name === "") payload.name = null;
      const updated = await updateRunSettings(runId, payload);
      setRun((s) => (s ? { ...s, ...updated } : updated));
      setShowEditSettings(false);
    } catch {
      // ignore
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRestart = async () => {
    setRestarting(true);
    try {
      const updated = await restartRun(runId);
      setRun(updated);
      setShowRestartConfirm(false);
      const data = await getMonitor(runId);
      setMonitor(data);
    } catch {
      // ignore
    } finally {
      setRestarting(false);
    }
  };

  // detailPlayer changes when user opens a player — store in ref so refreshMonitor
  // is always up-to-date without being recreated on every detail-panel open/close
  const detailPlayerRef = useRef(detailPlayer);
  detailPlayerRef.current = detailPlayer;

  const refreshMonitor = useCallback(
    () =>
      getMonitor(runId)
        .then((data) => {
          setMonitor(data);
          setRun((s) => (s ? { ...data.run, status: s.status } : data.run));
          // Sync detailPlayer panel if open
          const dp = detailPlayerRef.current;
          if (dp) {
            const updated = data.players_progress.find(
              (p) => p.player.id === dp.player.id,
            );
            if (updated) setDetailPlayer(updated);
          }
        })
        .catch(() => {}),
    [runId],
  );

  useEffect(() => {
    getMonitor(runId)
      .then((data) => {
        setMonitor(data);
        setRun(data.run);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [runId]);

  const handleWsMessage = useCallback(
    (raw: unknown) => {
      const data = raw as Record<string, unknown>;

      if (data.type === "run_completed" || data.type === "run_stopped") {
        setRun((s) =>
          s
            ? {
                ...s,
                status: data.type === "run_completed" ? "completed" : "stopped",
              }
            : s,
        );
      }

      if (data.type === "player_finished" || data.type === "player_answered") {
        refreshMonitor();
      }
    },
    [refreshMonitor],
  );

  useTeacherWebSocket(runId, token, handleWsMessage);

  const handleStop = async () => {
    setStopping(true);
    try {
      await stopRun(runId);
      setShowConfirm(false);
    } catch {
      // ignore
    } finally {
      setStopping(false);
    }
  };

  const players = useMemo(() => {
    const list = monitor?.players_progress ?? [];
    return [...list].sort((a, b) => {
      // Players with finished_at come first, sorted descending (most recent first)
      const aTime = a.player.finished_at
        ? new Date(a.player.finished_at).getTime()
        : 0;
      const bTime = b.player.finished_at
        ? new Date(b.player.finished_at).getTime()
        : 0;
      return bTime - aTime;
    });
  }, [monitor?.players_progress]);

  // Map unique team_ids to stable colors
  const teamColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    let i = 0;
    for (const pp of players) {
      if (pp.player.team_id && !(pp.player.team_id in map)) {
        map[pp.player.team_id] = TEAM_PALETTE[i % TEAM_PALETTE.length];
        i++;
      }
    }
    return map;
  }, [players]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const STATUS_LABEL: Record<string, string> = {
    waiting: t("statusWaiting"),
    active: t("statusActive"),
    completed: t("statusCompleted"),
    stopped: t("statusStopped"),
    scheduled: t("statusScheduled"),
  };

  const runStatus =
    run?.status === "active" &&
    run.ends_at &&
    new Date(run.ends_at) < new Date()
      ? "stopped"
      : run?.status;
  const isActive = runStatus === "active";
  const canStart = runStatus === "waiting" || runStatus === "scheduled";
  const canDelete = runStatus !== "active";
  const canRestart = runStatus === "stopped" || runStatus === "completed";

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">
              {run?.name ?? t("title")}
            </h1>
            <Link
              href={`/teacher/quests/${run?.quest_id}`}
              className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors"
            >
              <ExternalLink size={13} />
              {t("questPreview")}
            </Link>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="font-mono text-gray-500 text-sm">
              {run?.join_code}
            </span>
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              {copied ? (
                <Check size={13} className="text-green-500" />
              ) : (
                <Copy size={13} />
              )}
              {copied ? t("copied") : t("copyLink")}
            </button>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                isActive
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {STATUS_LABEL[runStatus ?? ""] ?? runStatus ?? "—"}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-1.5 flex-wrap">
            {run?.scheduled_at && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Clock size={12} />
                {t("scheduleStart")}: {formatDate(run.scheduled_at, locale)}
              </span>
            )}
            {run?.ends_at &&
              run.status !== "stopped" &&
              run.status !== "completed" && (
                <span className="flex items-center gap-1 text-xs font-medium text-gray-600">
                  <Clock size={12} />
                  {t("runEndsAt")}: {formatDate(run.ends_at, locale)}
                  {isActive && new Date(run.ends_at) > new Date() && (
                    <span className="ml-1 text-gray-400 font-normal">
                      (<TimerDisplay ends_at={run.ends_at} /> {t("timeLeft")})
                    </span>
                  )}
                </span>
              )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canStart && (
            <button
              type="button"
              onClick={handleStart}
              disabled={starting}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium px-4 py-2.5 rounded-xl text-sm transition-colors"
            >
              <Play size={14} />
              {starting ? "..." : t("start")}
            </button>
          )}
          {isActive && (
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 font-medium px-4 py-2.5 rounded-xl text-sm transition-colors border border-red-200"
            >
              <Square size={14} />
              {t("stop")}
            </button>
          )}
          {canRestart && (
            <button
              type="button"
              onClick={() => setShowRestartConfirm(true)}
              className="flex items-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-600 font-medium px-4 py-2.5 rounded-xl text-sm transition-colors border border-blue-200"
            >
              <RefreshCw size={14} />
              {t("restart")}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => setShowDeleteRun(true)}
              className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-red-600 font-medium px-3 py-2.5 rounded-xl text-sm transition-colors border border-gray-200"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{players.length}</p>
          <p className="text-xs text-gray-400 mt-0.5 flex items-center justify-center gap-1">
            <Users size={11} /> {t("participants")}
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-green-600">
            {players.filter((p) => p.player.status === "finished").length}
          </p>
          <p className="text-xs text-gray-400 mt-0.5 flex items-center justify-center gap-1">
            <CheckCircle size={11} /> {t("finished")}
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-orange-500">
            {players.reduce((sum, p) => sum + p.pending_review, 0)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5 flex items-center justify-center gap-1">
            <Clock size={11} /> {t("pendingReviewCount")}
          </p>
        </div>
      </div>

      {/* Run settings */}
      {run && (
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {t("settingsTitle")}
            </p>
            <button
              type="button"
              onClick={handleOpenEditSettings}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-600 transition-colors"
            >
              <Settings size={13} />
              {t("editSettings")}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 px-1">
            <span
              className="inline-flex items-center gap-1.5 text-xs rounded-full bg-blue-50 text-blue-700 font-medium"
              style={{ padding: "3px 10px" }}
            >
              {run.max_players === 1 ? (
                <>
                  <User size={11} /> {tRun("solo")}
                </>
              ) : (
                <>
                  <Users size={11} /> {tRun("teamMode")} · {run.max_players}
                </>
              )}
            </span>
            {run.max_players > 1 && (
              <SettingChip
                on={run.allow_solo_in_team}
                label={tRun("allowSolo")}
              />
            )}
            <SettingChip
              on={run.show_feedback_after_answer}
              label={tRun("showFeedback")}
            />
            <SettingChip
              on={run.keep_completed_in_materials}
              label={tRun("keepCompleted")}
            />
            <SettingChip on={run.show_score_after} label={tRun("showScore")} />
            {run.show_score_after && (
              <SettingChip
                on={run.show_correct_answers}
                label={tRun("showCorrect")}
              />
            )}
          </div>
        </div>
      )}

      {/* Players list */}
      <div className="space-y-3">
        {players.map((pp: PlayerProgressSummary) => (
          // biome-ignore lint/a11y/useSemanticElements: player card needs div for complex layout
          <div
            key={pp.player.id}
            className="bg-white rounded-2xl shadow-sm p-5 cursor-pointer hover:shadow-md transition-shadow"
            role="button"
            tabIndex={0}
            onClick={() => setDetailPlayer(pp)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setDetailPlayer(pp);
              }
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="rounded-full flex items-center justify-center text-white font-bold text-base"
                style={{
                  backgroundColor: pp.player.avatar_color,
                  width: 40,
                  height: 40,
                  minWidth: 40,
                  minHeight: 40,
                }}
              >
                {pp.player.display_name.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                {renamePlayerId === pp.player.id ? (
                  // biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation wrapper for rename input
                  <div
                    role="presentation"
                    className="flex items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveRename();
                        if (e.key === "Escape") setRenamePlayerId(null);
                      }}
                      placeholder={t("renamePlaceholder")}
                      className="border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-900 focus:border-gray-500 w-40"
                    />
                    <button
                      type="button"
                      onClick={handleSaveRename}
                      disabled={renameSaving}
                      className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {tCommon("save")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamePlayerId(null)}
                      className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5"
                    >
                      {tCommon("cancel")}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 truncate">
                      {pp.player.display_name}
                    </span>
                    {pp.player.team_id && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full block font-mono font-semibold text-white flex-shrink-0"
                        style={{
                          backgroundColor: teamColorMap[pp.player.team_id],
                        }}
                      >
                        #{pp.player.team_id.slice(0, 4)}
                      </span>
                    )}
                    {pp.player.status === "finished" && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                        {t("finishedBadge")}
                      </span>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  {t("completedOf", {
                    completed: pp.completed,
                    total: pp.total,
                  })}
                  {pp.grade != null
                    ? ` · ${t("numberOfPoints")}: ${pp.total_score ?? 0}/${pp.max_score} · ${t("scoreLabel")}: ${pp.grade}/${pp.max_grade}`
                    : pp.max_score != null && pp.max_score > 0
                      ? ` · ${t("numberOfPoints")}: ${pp.total_score ?? 0}/${pp.max_score}`
                      : pp.score !== null
                        ? ` · ${Math.round(pp.score * 100)}%`
                        : ""}
                </p>
              </div>

              {renamePlayerId !== pp.player.id && (
                // biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation wrapper for action buttons
                <div
                  role="presentation"
                  className="flex items-center gap-1 flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() =>
                      handleStartRename(pp.player.id, pp.player.display_name)
                    }
                    className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title={t("renamePlayer")}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletePlayerId(pp.player.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title={t("deletePlayer")}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>

            <SegmentedProgressBar pp={pp} />
            <SegmentLegend pp={pp} t={t} />

            {/* Timing row */}
            <div className="flex flex-wrap items-center gap-1 gap-y-0.5 mt-1 text-xs text-gray-400">
              <span>
                {t("joinedAt")}: {formatTime(pp.player.joined_at, locale)}
              </span>
              {pp.player.finished_at && (
                <>
                  <span className="text-gray-300">·</span>
                  <span>
                    {t("finishedAt")}:{" "}
                    {formatTime(pp.player.finished_at, locale)}
                  </span>
                </>
              )}
              {pp.player.started_at && pp.player.finished_at && (
                <>
                  <span className="text-gray-300">·</span>
                  <span>
                    {t("durationLabel")}:{" "}
                    {formatDuration(
                      pp.player.started_at,
                      pp.player.finished_at,
                    )}
                  </span>
                </>
              )}
            </div>
          </div>
        ))}

        {players.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400">
            <Users size={40} className="mx-auto mb-3 opacity-30" />
            <p>{t("noParticipants")}</p>
          </div>
        )}
      </div>

      {/* Player detail drawer */}
      {detailPlayer && (
        <PlayerDetailDrawer
          runId={runId}
          pp={detailPlayer}
          onClose={() => setDetailPlayer(null)}
          onReviewed={refreshMonitor}
          t={t}
        />
      )}

      {/* Confirm stop dialog */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={24} className="text-red-500 flex-shrink-0" />
              <h3 className="text-lg font-semibold text-gray-900">
                {t("stop")}
              </h3>
            </div>
            <p className="text-gray-600 text-sm mb-6">{t("stopConfirm")}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-xl text-sm transition-colors"
              >
                {tCommon("cancel")}
              </button>
              <button
                type="button"
                onClick={handleStop}
                disabled={stopping}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl text-sm transition-colors"
              >
                {stopping ? "..." : t("stop")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete run dialog */}
      {showDeleteRun && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={24} className="text-red-500 flex-shrink-0" />
              <h3 className="text-lg font-semibold text-gray-900">
                {t("deleteRun")}
              </h3>
            </div>
            <p className="text-gray-600 text-sm mb-6">
              {t("deleteRunConfirm")}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteRun(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-xl text-sm transition-colors"
              >
                {tCommon("cancel")}
              </button>
              <button
                type="button"
                onClick={handleDeleteRun}
                disabled={deletingRun}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl text-sm transition-colors"
              >
                {deletingRun ? "..." : tCommon("delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit settings modal */}
      {showEditSettings && run && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {t("editSettings")}
            </h3>

            {/* Name */}
            <div>
              <label
                htmlFor="edit-run-name"
                className="block text-xs font-medium text-gray-500 mb-1"
              >
                {t("runName")}
              </label>
              <input
                id="edit-run-name"
                value={editForm.name ?? ""}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, name: e.target.value }))
                }
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-gray-400 outline-none"
              />
            </div>

            {/* Ends at */}
            <div>
              <label
                htmlFor="edit-run-ends-at"
                className="block text-xs font-medium text-gray-500 mb-1"
              >
                {t("endsAt")}
              </label>
              <input
                id="edit-run-ends-at"
                type="datetime-local"
                value={
                  editForm.ends_at
                    ? new Date(editForm.ends_at).toISOString().slice(0, 16)
                    : ""
                }
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    ends_at: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  }))
                }
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-gray-400 outline-none"
              />
            </div>

            {/* Toggles */}
            {(
              [
                ["show_feedback_after_answer", tRun("showFeedback")],
                ["keep_completed_in_materials", tRun("keepCompleted")],
                ["show_score_after", tRun("showScore")],
                ["show_correct_answers", tRun("showCorrect")],
              ] as [keyof RunUpdate, string][]
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-3 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={!!(editForm[key] as boolean | undefined)}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, [key]: e.target.checked }))
                  }
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <span className="text-sm text-gray-700">{label}</span>
              </label>
            ))}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowEditSettings(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-xl text-sm transition-colors"
              >
                {tCommon("cancel")}
              </button>
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl text-sm transition-colors"
              >
                {savingSettings ? "..." : t("saveSettings")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm restart dialog */}
      {showRestartConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle
                size={24}
                className="text-orange-500 flex-shrink-0"
              />
              <h3 className="text-lg font-semibold text-gray-900">
                {t("restart")}
              </h3>
            </div>
            <p className="text-gray-600 text-sm mb-6">{t("restartConfirm")}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowRestartConfirm(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-xl text-sm transition-colors"
              >
                {tCommon("cancel")}
              </button>
              <button
                type="button"
                onClick={handleRestart}
                disabled={restarting}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl text-sm transition-colors"
              >
                {restarting ? "..." : t("restart")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete player dialog */}
      {deletePlayerId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={24} className="text-red-500 flex-shrink-0" />
              <h3 className="text-lg font-semibold text-gray-900">
                {t("deletePlayer")}
              </h3>
            </div>
            <p className="text-gray-600 text-sm mb-6">
              {t("deletePlayerConfirm")}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeletePlayerId(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-xl text-sm transition-colors"
              >
                {tCommon("cancel")}
              </button>
              <button
                type="button"
                onClick={handleDeletePlayer}
                disabled={deletingPlayer}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl text-sm transition-colors"
              >
                {deletingPlayer ? "..." : tCommon("delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
