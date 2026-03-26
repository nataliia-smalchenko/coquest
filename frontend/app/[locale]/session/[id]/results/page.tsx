"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle, XCircle, Clock, Home } from "lucide-react";
import { getResults } from "@/lib/api/sessions";
import { getSessionStorage } from "@/hooks/useGameSession";
import type {
  GameSessionDetailResponse,
  SessionProgress,
  SessionPlayer,
} from "@/types/session";

export default function ResultsPage() {
  const t = useTranslations("game.results");
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [results, setResults] = useState<GameSessionDetailResponse | null>(
    null,
  );
  const [myPlayer, setMyPlayer] = useState<SessionPlayer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [needToken, setNeedToken] = useState(false);

  const loadResults = async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = (await getResults(
        sessionId,
        token,
      )) as GameSessionDetailResponse;
      setResults(data);
      // find my player by token
      const stored = getSessionStorage(sessionId);
      if (stored) {
        const me = data.players.find((p) => p.id === stored.player_id);
        setMyPlayer(me ?? null);
      }
    } catch {
      setError(t("errorToken"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const stored = getSessionStorage(sessionId);
    if (stored) {
      loadResults(stored.guest_token);
    } else {
      setNeedToken(true);
      setLoading(false);
    }
  }, [sessionId]);

  const myProgress: SessionProgress[] = myPlayer
    ? (results?.progress ?? []).filter((p) => p.player_id === myPlayer.id)
    : [];

  const answeredProgress = myProgress.filter((p) => p.status === "answered");
  const totalQuestions = myProgress.length;
  const scores = answeredProgress.map((p) => p.score ?? 0);
  const totalScore =
    scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null;

  const startTime = results?.started_at ? new Date(results.started_at) : null;
  const endTime = myPlayer?.finished_at ? new Date(myPlayer.finished_at) : null;
  const durationMin =
    startTime && endTime
      ? Math.round((endTime.getTime() - startTime.getTime()) / 60000)
      : null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (needToken) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            {t("tokenTitle")}
          </h2>
          <input
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder={t("tokenPlaceholder")}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <button
            onClick={() => loadResults(tokenInput)}
            disabled={!tokenInput.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl text-sm transition-colors"
          >
            {t("tokenSubmit")}
          </button>
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">{error ?? t("unavailable")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Score card */}
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">
            {t("score")}
          </p>
          <div className="text-6xl font-bold text-blue-600 mb-1">
            {totalScore !== null ? `${Math.round(totalScore * 100)}%` : "—"}
          </div>
          <p className="text-sm text-gray-500">
            {myPlayer?.display_name ?? t("player")}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
            <p className="text-2xl font-bold text-gray-900">
              {answeredProgress.filter((p) => (p.score ?? 0) >= 1).length}/
              {totalQuestions}
            </p>
            <p className="text-sm text-gray-500 mt-1">{t("correct")}</p>
          </div>
          {durationMin !== null && (
            <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
              <p className="text-2xl font-bold text-gray-900">
                {durationMin} {t("minutes")}
              </p>
              <p className="text-sm text-gray-500 mt-1">{t("time")}</p>
            </div>
          )}
        </div>

        {/* Progress breakdown */}
        {myProgress.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
            {myProgress.map((p, i) => {
              const isCorrect = p.score !== null && p.score >= 1;
              const isPending = p.requires_review && p.score === null;
              const isWrong =
                p.status === "answered" && !isCorrect && !isPending;

              return (
                <div
                  key={p.id}
                  className={`px-5 py-4 ${
                    isCorrect
                      ? "bg-green-50"
                      : isPending
                        ? "bg-yellow-50"
                        : isWrong
                          ? "bg-red-50"
                          : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {isCorrect ? (
                      <CheckCircle
                        size={18}
                        className="text-green-500 flex-shrink-0"
                      />
                    ) : isPending ? (
                      <Clock
                        size={18}
                        className="text-yellow-500 flex-shrink-0"
                      />
                    ) : isWrong ? (
                      <XCircle
                        size={18}
                        className="text-red-400 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-4.5 h-4.5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                    )}
                    <span className="text-sm text-gray-700">
                      {t("question", { n: i + 1 })}
                      {p.score !== null && (
                        <span className="ml-2 text-xs text-gray-400">
                          ({Math.round(p.score * 100)}%)
                        </span>
                      )}
                    </span>
                    {isPending && (
                      <span className="ml-auto text-xs text-yellow-600 font-medium">
                        {t("pendingReview")}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Back home */}
        <button
          onClick={() => router.push("/")}
          className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 rounded-xl transition-colors text-sm"
        >
          <Home size={16} />
          {t("home")}
        </button>
      </div>
    </div>
  );
}
