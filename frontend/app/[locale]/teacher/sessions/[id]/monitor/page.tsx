"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Copy,
  Check,
  Play,
  Square,
  Trash2,
  Users,
  Pencil,
} from "lucide-react";
import Cookies from "js-cookie";
import { useLocale } from "next-intl";
import {
  getMonitor,
  startSession,
  stopSession,
  deleteSession,
  deletePlayer,
  updateGuestName,
} from "@/lib/api/sessions";
import { useTeacherWebSocket } from "@/hooks/useWebSocket";
import type {
  PlayerProgressSummary,
  TeacherMonitorResponse,
  GameSession,
} from "@/types/session";

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
      <div
        className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function MonitorPage() {
  const t = useTranslations("game.monitor");
  const tCommon = useTranslations("common");
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const locale = useLocale();
  const token = Cookies.get("access_token") ?? "";

  const [monitor, setMonitor] = useState<TeacherMonitorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [stopping, setStopping] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [session, setSession] = useState<GameSession | null>(null);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  // Delete session
  const [showDeleteSession, setShowDeleteSession] = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);

  // Delete player
  const [deletePlayerId, setDeletePlayerId] = useState<string | null>(null);
  const [deletingPlayer, setDeletingPlayer] = useState(false);

  // Rename player
  const [renamePlayerId, setRenamePlayerId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  const handleStart = async () => {
    setStarting(true);
    try {
      const updated = await startSession(sessionId);
      setSession(updated);
    } catch {
      // ignore
    } finally {
      setStarting(false);
    }
  };

  const handleCopyLink = () => {
    if (!session?.session_code) return;
    const url = `${window.location.origin}/join?code=${session.session_code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDeleteSession = async () => {
    setDeletingSession(true);
    try {
      await deleteSession(sessionId);
      router.push("/teacher/sessions");
    } catch {
      // ignore
    } finally {
      setDeletingSession(false);
    }
  };

  const handleDeletePlayer = async () => {
    if (!deletePlayerId) return;
    setDeletingPlayer(true);
    try {
      await deletePlayer(sessionId, deletePlayerId);
      setDeletePlayerId(null);
      const data = await getMonitor(sessionId);
      setMonitor(data);
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
      await updateGuestName(
        sessionId,
        renamePlayerId,
        renameValue.trim() || null,
      );
      setRenamePlayerId(null);
      const data = await getMonitor(sessionId);
      setMonitor(data);
    } catch {
      // ignore
    } finally {
      setRenameSaving(false);
    }
  };

  // Load initial monitor data
  useEffect(() => {
    getMonitor(sessionId)
      .then((data) => {
        setMonitor(data);
        setSession(data.session);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  // WS
  const { messages } = useTeacherWebSocket(sessionId, token);
  const prevLen = useRef(0);

  useEffect(() => {
    if (messages.length === prevLen.current) return;
    const newMsgs = messages.slice(prevLen.current);
    prevLen.current = messages.length;

    for (const raw of newMsgs) {
      const data = raw as Record<string, unknown>;

      if (
        data.type === "session_completed" ||
        data.type === "session_stopped"
      ) {
        setSession((s) =>
          s
            ? {
                ...s,
                status:
                  data.type === "session_completed" ? "completed" : "stopped",
              }
            : s,
        );
      }

      if (data.type === "player_finished" || data.type === "player_answered") {
        // Refresh monitor data
        getMonitor(sessionId)
          .then(setMonitor)
          .catch(() => {});
      }
    }
  }, [messages, sessionId]);

  const handleStop = async () => {
    setStopping(true);
    try {
      await stopSession(sessionId);
      setShowConfirm(false);
    } catch {
      // ignore
    } finally {
      setStopping(false);
    }
  };

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

  const players = monitor?.players_progress ?? [];
  const isActive = session?.status === "active";
  const canStart =
    session?.status === "waiting" || session?.status === "scheduled";
  const canDelete = session?.status !== "active";

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="font-mono text-gray-500 text-sm">
              {session?.session_code}
            </span>
            <button
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
              {STATUS_LABEL[session?.status ?? ""] ?? session?.status ?? "—"}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-1.5 flex-wrap">
            {session?.scheduled_at && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Clock size={12} />
                {t("scheduleStart")}: {formatDate(session.scheduled_at, locale)}
              </span>
            )}
            {session?.ends_at && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Clock size={12} />
                {t("scheduleEnd")}: {formatDate(session.ends_at, locale)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canStart && (
            <button
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
              onClick={() => setShowConfirm(true)}
              className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 font-medium px-4 py-2.5 rounded-xl text-sm transition-colors border border-red-200"
            >
              <Square size={14} />
              {t("stop")}
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => setShowDeleteSession(true)}
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

      {/* Players list */}
      <div className="space-y-3">
        {players.map((pp: PlayerProgressSummary) => (
          <div
            key={pp.player.id}
            className="bg-white rounded-2xl shadow-sm p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              {/* Avatar */}
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0"
                style={{ backgroundColor: pp.player.avatar_color }}
              >
                {pp.player.display_name.charAt(0).toUpperCase()}
              </div>

              {/* Name + status */}
              <div className="flex-1 min-w-0">
                {renamePlayerId === pp.player.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
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
                      onClick={handleSaveRename}
                      disabled={renameSaving}
                      className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {tCommon("save")}
                    </button>
                    <button
                      onClick={() => setRenamePlayerId(null)}
                      className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5"
                    >
                      {tCommon("cancel")}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 truncate">
                      {pp.player.display_name}
                    </span>
                    {pp.player.status === "finished" && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                        {t("finishedBadge")}
                      </span>
                    )}
                    {pp.pending_review > 0 && (
                      <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">
                        {pp.pending_review} {t("pendingReview")}
                      </span>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  {t("completedOf", {
                    completed: pp.completed,
                    total: pp.total,
                  })}
                  {pp.score !== null && ` · ${Math.round(pp.score * 100)}%`}
                </p>
              </div>

              {/* Player actions */}
              {renamePlayerId !== pp.player.id && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() =>
                      handleStartRename(pp.player.id, pp.player.display_name)
                    }
                    className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title={t("renamePlayer")}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setDeletePlayerId(pp.player.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title={t("deletePlayer")}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
            <ProgressBar value={pp.completed} max={pp.total} />
          </div>
        ))}

        {players.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400">
            <Users size={40} className="mx-auto mb-3 opacity-30" />
            <p>{t("noParticipants")}</p>
          </div>
        )}
      </div>

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
                onClick={() => setShowConfirm(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-xl text-sm transition-colors"
              >
                {tCommon("cancel")}
              </button>
              <button
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

      {/* Confirm delete session dialog */}
      {showDeleteSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={24} className="text-red-500 flex-shrink-0" />
              <h3 className="text-lg font-semibold text-gray-900">
                {t("deleteSession")}
              </h3>
            </div>
            <p className="text-gray-600 text-sm mb-6">
              {t("deleteSessionConfirm")}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteSession(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-xl text-sm transition-colors"
              >
                {tCommon("cancel")}
              </button>
              <button
                onClick={handleDeleteSession}
                disabled={deletingSession}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl text-sm transition-colors"
              >
                {deletingSession ? "..." : tCommon("delete")}
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
                onClick={() => setDeletePlayerId(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-xl text-sm transition-colors"
              >
                {tCommon("cancel")}
              </button>
              <button
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
