"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { useRouter } from "@/i18n/navigation"
import { useLocale, useTranslations } from "next-intl"
import { BookOpen, MessageSquare, X } from "lucide-react"
import { getGameInfo, getMyProgress, getProgressResource, submitAnswer, markViewed } from "@/lib/api/sessions"
import { getMap } from "@/lib/api/maps"
import { useGameSession, getSessionStorage } from "@/hooks/useGameSession"
import { usePlayerWebSocket } from "@/hooks/useWebSocket"
import MapInteractive from "@/components/game/MapInteractive"
import ResourceModal from "@/components/game/ResourceModal"
import ChatPanel from "@/components/game/ChatPanel"
import TimerDisplay from "@/components/game/TimerDisplay"
import type { MapResponse } from "@/types/map"
import type { ResourceDetailResponse } from "@/types/resource"
import type { GameInfoResponse, GameSession, SessionProgress } from "@/types/session"

interface AnswerResult {
  correct: boolean | null
  score: number | null
  requires_review: boolean
}

export default function GamePage() {
  const t = useTranslations("game.game")
  const params = useParams()
  const router = useRouter()
  const locale = useLocale()
  const sessionId = params.id as string

  const {
    session,
    setSession,
    myPlayer,
    setMyPlayer,
    setGuestToken,
    progress,
    setProgress,
    updateProgress,
    chatMessages,
    handleWsMessage,
    guestToken,
  } = useGameSession()

  const [stored, setStored] = useState<{ guest_token: string; player_id: string } | null>(null)
  const [gameInfo, setGameInfo] = useState<GameInfoResponse | null>(null)
  const [map, setMap] = useState<MapResponse | null>(null)
  const [loadingMap, setLoadingMap] = useState(true)

  // Modal state
  const [modalProgressId, setModalProgressId] = useState<string | null>(null)
  const [modalResource, setModalResource] = useState<ResourceDetailResponse | null>(null)
  const [modalResourceLoading, setModalResourceLoading] = useState(false)
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Panel state
  const [showChat, setShowChat] = useState(false)
  const [showMaterials, setShowMaterials] = useState(false)
  const [unreadChat, setUnreadChat] = useState(0)

  const token = stored?.guest_token ?? ""

  // Load stored session data
  useEffect(() => {
    const s = getSessionStorage(sessionId)
    if (!s) {
      router.push("/join")
      return
    }
    setStored(s)
    setGuestToken(s.guest_token)
  }, [sessionId, router, setGuestToken])

  // Load game info + map + progress
  useEffect(() => {
    if (!stored) return
    const load = async () => {
      try {
        const info = await getGameInfo(sessionId, stored.guest_token, locale)
        setGameInfo(info)
        if (info.map_slug) {
          const mapData = await getMap(info.map_slug)
          setMap(mapData)
        }
      } catch {
        // ignore
      }
      try {
        const prog = await getMyProgress(sessionId, stored.guest_token)
        setProgress(prog)
      } catch {
        // ignore — will be set via WS session_started
      }
      setLoadingMap(false)
    }
    load()
  }, [stored, sessionId, locale, setProgress])

  // WS
  const { messages, send: wsSend } = usePlayerWebSocket(sessionId, token)

  const prevLen = useRef(0)
  useEffect(() => {
    if (messages.length === prevLen.current) return
    const newMsgs = messages.slice(prevLen.current)
    prevLen.current = messages.length

    for (const raw of newMsgs) {
      const data = raw as Record<string, unknown>
      handleWsMessage(data)

      if (data.type === "connected") {
        const sess = data.session as GameSession | undefined
        if (sess) {
          setSession(sess)
          if (stored) {
            const me = sess.players?.find((p) => p.id === stored.player_id)
            if (me) setMyPlayer(me)
          }
        }
      }

      if (data.type === "session_started") {
        const prog = data.progress as SessionProgress[] | undefined
        if (prog) setProgress(prog)
      }

      if (data.type === "answer_result") {
        const prog = data.progress as SessionProgress
        if (prog) updateProgress(prog)
        if (prog?.id === modalProgressId) {
          setAnswerResult({
            correct: (data.correct as boolean | null) ?? null,
            score: (data.score as number | null) ?? null,
            requires_review: prog.requires_review,
          })
        }
      }

      if (data.type === "object_updated") {
        // Reload my progress to pick up new assignment
        if (stored) {
          getMyProgress(sessionId, stored.guest_token).then(setProgress).catch(() => {})
        }
      }

      if (data.type === "chat_message" && !showChat) {
        setUnreadChat((n) => n + 1)
      }

      if (data.type === "player_finished") {
        const finishedId = data.player_id as string
        const myId = stored?.player_id
        if (finishedId === myId) {
          router.push(`/session/${sessionId}/results`)
        }
      }

      if (data.type === "session_completed" || data.type === "session_stopped") {
        router.push(`/session/${sessionId}/results`)
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
    modalProgressId,
    showChat,
    sessionId,
    router,
  ])

  // Redirect when all progress completed
  useEffect(() => {
    if (progress.length > 0 && progress.every((p) => p.status === "answered" || p.status === "viewed")) {
      router.push(`/session/${sessionId}/results`)
    }
  }, [progress, sessionId, router])

  // Reset unread when chat opens
  useEffect(() => {
    if (showChat) setUnreadChat(0)
  }, [showChat])

  const handleObjectClick = useCallback(
    async (mapObjectId: string, progressId: string) => {
      if (!stored) return
      setModalProgressId(progressId)
      setModalResource(null)
      setAnswerResult(null)
      setModalResourceLoading(true)
      try {
        const res = await getProgressResource(progressId, stored.guest_token)
        setModalResource(res)
      } catch {
        setModalResource(null)
      } finally {
        setModalResourceLoading(false)
      }
    },
    [stored],
  )

  const handleMarkViewed = async () => {
    if (!modalProgressId || !stored) return
    setIsSubmitting(true)
    try {
      const updated = await markViewed(modalProgressId, stored.guest_token)
      updateProgress(updated)
      setModalProgressId(null)
    } catch {
      // ignore
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmitAnswer = async (answer: Record<string, unknown>) => {
    if (!modalProgressId || !stored) return
    setIsSubmitting(true)
    try {
      await submitAnswer(modalProgressId, answer, stored.guest_token)
      // result will arrive via WS answer_result
    } catch {
      // ignore
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSendChat = useCallback(
    (message: string) => {
      wsSend({ type: "chat_message", message })
    },
    [wsSend],
  )

  const modalProgress = progress.find((p) => p.id === modalProgressId) ?? null

  const completedCount = progress.filter(
    (p) => p.status === "answered" || p.status === "viewed",
  ).length
  const totalCount = progress.length

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-900">
      {/* Header */}
      <header className="h-14 bg-gray-800 text-white flex items-center justify-between px-4 flex-shrink-0 z-10">
        <span className="text-sm font-medium truncate max-w-[160px]">
          {gameInfo?.quest_title ?? "Quest"}
        </span>

        <div className="flex items-center gap-3">
          {/* Timer */}
          {session?.ends_at && <TimerDisplay ends_at={session.ends_at} />}

          {/* Progress */}
          <span className="text-xs text-gray-400 font-mono">
            {completedCount}/{totalCount}
          </span>

          {/* Chat toggle */}
          <button
            onClick={() => {
              setShowChat((v) => !v)
              setShowMaterials(false)
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

          {/* Materials toggle */}
          <button
            onClick={() => {
              setShowMaterials((v) => !v)
              setShowChat(false)
            }}
            className="p-1.5 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <BookOpen size={18} />
          </button>
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
              className="rounded-xl shadow-lg max-h-full"
            />
          )}
          {!loadingMap && !map && (
            <p className="text-gray-500 text-sm">Карта недоступна</p>
          )}
        </div>

        {/* Chat panel */}
        {showChat && (
          <div className="w-72 flex-shrink-0 border-l border-gray-700 flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 flex-shrink-0">
              <span className="text-sm font-medium text-white">{t("chat")}</span>
              <button onClick={() => setShowChat(false)} className="text-gray-400 hover:text-white">
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
              <span className="text-sm font-medium text-white">{t("materials")}</span>
              <button onClick={() => setShowMaterials(false)} className="text-gray-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="p-3 space-y-2">
              {progress
                .filter((p) => {
                  const keep = gameInfo?.settings?.keep_completed_in_materials ?? true
                  if (!keep && (p.status === "viewed" || p.status === "answered")) return false
                  return true
                })
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      handleObjectClick(p.map_object_id ?? "", p.id)
                      setShowMaterials(false)
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
                      <span className="truncate">{p.resource_id ? "Ресурс" : "—"}</span>
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

      {/* Resource modal */}
      {modalProgressId && modalProgress && (
        <ResourceModal
          progress={modalProgress}
          resource={modalResource}
          loading={modalResourceLoading}
          answerResult={answerResult}
          onClose={() => {
            setModalProgressId(null)
            setAnswerResult(null)
          }}
          onMarkViewed={handleMarkViewed}
          onSubmitAnswer={handleSubmitAnswer}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  )
}
