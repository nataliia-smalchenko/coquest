"use client"

import { useEffect, useState } from "react"
import { useRouter } from "@/i18n/navigation"
import { useTranslations } from "next-intl"
import { Activity, AlertTriangle, BarChart2, Clock, Trash2, Users } from "lucide-react"
import { useLocale } from "next-intl"
import { listSessions, deleteSession } from "@/lib/api/sessions"
import { useAuth } from "@/hooks/useAuth"
import type { SessionListItem, SessionStatus } from "@/types/session"

const STATUS_STYLE: Record<SessionStatus, string> = {
  waiting: "bg-gray-100 text-gray-600",
  active: "bg-green-100 text-green-700",
  completed: "bg-blue-100 text-blue-700",
  stopped: "bg-red-100 text-red-600",
  scheduled: "bg-yellow-100 text-yellow-700",
}

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function TeacherSessionsPage() {
  const t = useTranslations("game.monitor")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const router = useRouter()
  useAuth()

  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const STATUS_LABEL: Record<SessionStatus, string> = {
    waiting: t("statusWaiting"),
    active: t("statusActive"),
    completed: t("statusCompleted"),
    stopped: t("statusStopped"),
    scheduled: t("statusScheduled"),
  }

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await deleteSession(deleteId)
      setSessions((prev) => prev.filter((s) => s.id !== deleteId))
      setDeleteId(null)
    } catch {
      // ignore
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <p className="text-gray-500 text-sm mt-1">{t("sessionsCount", { count: sessions.length })}</p>
      </div>

      {sessions.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400">
          <Activity size={40} className="mx-auto mb-3 opacity-30" />
          <p>{t("noSessions")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => router.push(`/teacher/sessions/${s.id}/monitor`)}
              className="bg-white rounded-2xl shadow-sm p-5 flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer"
            >
              {/* Status dot */}
              <div
                className={`w-3 h-3 rounded-full flex-shrink-0 ${
                  s.status === "active" ? "bg-green-500 animate-pulse" : "bg-gray-300"
                }`}
              />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono font-bold text-gray-900 text-lg tracking-widest">
                    {s.session_code}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[s.status]}`}
                  >
                    {STATUS_LABEL[s.status]}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                  <span className="flex items-center gap-1">
                    <Users size={12} />
                    {s.players_count} {s.max_players < 999 ? `/ ${s.max_players}` : ""} {t("participants")}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {formatDate(s.created_at, locale)}
                  </span>
                  {s.scheduled_at && (
                    <span className="flex items-center gap-1">
                      {t("scheduleStartLabel")}: {formatDate(s.scheduled_at, locale)}
                    </span>
                  )}
                  {s.ends_at && (
                    <span className="flex items-center gap-1">
                      {t("scheduleEndLabel")}: {formatDate(s.ends_at, locale)}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div
                className="flex items-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                {s.status === "active" && (
                  <button
                    onClick={() => router.push(`/teacher/sessions/${s.id}/monitor`)}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                  >
                    <BarChart2 size={13} />
                    {t("monitoring")}
                  </button>
                )}
                {(s.status === "completed" || s.status === "stopped") && (
                  <button
                    onClick={() => router.push(`/teacher/sessions/${s.id}/monitor`)}
                    className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                  >
                    <BarChart2 size={13} />
                    {t("results")}
                  </button>
                )}
                {s.status !== "active" && (
                  <button
                    onClick={() => setDeleteId(s.id)}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title={t("deleteSession")}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirm delete session dialog */}
      {deleteId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={24} className="text-red-500 flex-shrink-0" />
              <h3 className="text-lg font-semibold text-gray-900">{t("deleteSession")}</h3>
            </div>
            <p className="text-gray-600 text-sm mb-6">{t("deleteSessionConfirm")}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-xl text-sm transition-colors"
              >
                {tCommon("cancel")}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl text-sm transition-colors"
              >
                {deleting ? "..." : tCommon("delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
