"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  CheckCircle,
  XCircle,
  Clock,
  Home,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitize";
import { getResults } from "@/lib/api/sessions";
import { clearSessionStorage, getSessionStorage } from "@/hooks/useGameSession";
import type {
  GameSessionResultResponse,
  SessionProgressResult,
  SessionPlayer,
  QuestionResultOption,
} from "@/types/session";

// helpers
function getSelectedOptionIds(answer: unknown, questionType: string): string[] {
  if (!answer || typeof answer !== "object") return [];
  const a = answer as Record<string, unknown>;
  if (questionType === "single") {
    return a.option_id ? [String(a.option_id)] : [];
  }
  if (questionType === "multiple") {
    return Array.isArray(a.option_ids)
      ? (a.option_ids as unknown[]).map(String)
      : [];
  }
  return [];
}

function getAnswerText(answer: unknown): string {
  if (!answer || typeof answer !== "object") return "";
  const a = answer as Record<string, unknown>;
  return typeof a.text === "string" ? a.text : "";
}

// expandable question detail
function QuestionDetail({
  progress,
  showCorrectAnswers,
  t,
}: {
  progress: SessionProgressResult;
  showCorrectAnswers: boolean;
  t: ReturnType<typeof useTranslations<"game.results">>;
}) {
  const { question, answer } = progress;
  if (!question) return null;

  const { body, question_type, options, correct_answers } = question;
  const selectedIds = getSelectedOptionIds(answer, question_type);
  const typedText = getAnswerText(answer);
  const isChoiceType =
    question_type === "single" || question_type === "multiple";

  return (
    <div className="px-5 pb-4 pt-1 text-sm space-y-3">
      {/* Question body */}
      <div
        className="tiptap-preview text-gray-800 font-medium leading-snug"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(body) }}
      />

      {/* Choice options */}
      {isChoiceType && options.length > 0 && (
        <ul className="space-y-1.5">
          {options.map((opt: QuestionResultOption) => {
            const isSelected = selectedIds.includes(opt.id);
            const isCorrect = showCorrectAnswers && opt.is_correct;
            const isWrongSelected =
              isSelected && showCorrectAnswers && !opt.is_correct;

            let bg = "bg-gray-50 border-gray-200";
            if (isCorrect && isSelected) bg = "bg-green-50 border-green-400";
            else if (isCorrect) bg = "bg-green-50 border-green-300";
            else if (isWrongSelected) bg = "bg-red-50 border-red-300";
            else if (isSelected) bg = "bg-blue-50 border-blue-300";

            return (
              <li
                key={opt.id}
                className={`flex items-center gap-2 border rounded-lg px-3 py-2 ${bg}`}
              >
                <span className="flex-1 text-gray-800">
                  {opt.image_url && (
                    <img
                      src={opt.image_url}
                      alt=""
                      className="max-h-24 rounded mb-1 object-contain"
                    />
                  )}
                  {opt.text}
                </span>
                {isSelected && !showCorrectAnswers && (
                  <span className="text-blue-500 text-xs font-medium">
                    {t("yourAnswer")}
                  </span>
                )}
                {isSelected && showCorrectAnswers && opt.is_correct && (
                  <CheckCircle
                    size={14}
                    className="text-green-500 flex-shrink-0"
                  />
                )}
                {isSelected && showCorrectAnswers && !opt.is_correct && (
                  <XCircle size={14} className="text-red-400 flex-shrink-0" />
                )}
                {!isSelected && showCorrectAnswers && opt.is_correct && (
                  <CheckCircle
                    size={14}
                    className="text-green-400 flex-shrink-0 opacity-60"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Short / open answer text */}
      {!isChoiceType && (
        <div className="space-y-1.5">
          {typedText && (
            <div className="border border-blue-200 bg-blue-50 rounded-lg px-3 py-2">
              <span className="text-xs text-blue-500 font-medium block mb-0.5">
                {t("yourAnswer")}
              </span>
              <span className="text-gray-800">{typedText}</span>
            </div>
          )}
          {showCorrectAnswers && correct_answers.length > 0 && (
            <div className="border border-green-200 bg-green-50 rounded-lg px-3 py-2">
              <span className="text-xs text-green-600 font-medium block mb-0.5">
                {t("correctAnswer")}
              </span>
              <span className="text-gray-800">
                {correct_answers.join(" / ")}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// main page
export default function ResultsPage() {
  const t = useTranslations("game.results");
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [results, setResults] = useState<GameSessionResultResponse | null>(
    null,
  );
  const [myPlayer, setMyPlayer] = useState<SessionPlayer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [needToken, setNeedToken] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadResults = async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getResults(sessionId, token);
      setResults(data);
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

  const myProgress: SessionProgressResult[] = myPlayer
    ? (results?.progress ?? []).filter(
        (p) => p.player_id === myPlayer.id && p.question !== null,
      )
    : [];

  const isTeamMode = (results?.max_players ?? 1) > 1;
  const myTeamId = myPlayer?.team_id ?? null;

  // Teammates (same team, not me)
  const teammates =
    isTeamMode && myTeamId && results
      ? results.players.filter(
          (p) => p.team_id === myTeamId && p.id !== myPlayer?.id,
        )
      : [];

  // Each teammate's answered questions
  const teammateProgress = (pid: string): SessionProgressResult[] =>
    (results?.progress ?? []).filter(
      (p) =>
        p.player_id === pid && p.question !== null && p.status === "answered",
    );

  const answeredProgress = myProgress.filter((p) => p.status === "answered");
  const totalQuestions = myProgress.length;
  const scores = answeredProgress.map((p) => p.score ?? 0);
  const totalScore =
    scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null;

  const earnedPoints = myProgress.reduce(
    (sum, p) => sum + (p.score ?? 0) * (p.question?.points ?? 1),
    0,
  );
  const maxPoints = myProgress.reduce(
    (sum, p) => sum + (p.question?.points ?? 1),
    0,
  );
  const maxGrade = results?.max_grade ?? null;
  const grade =
    maxGrade != null && maxPoints > 0
      ? +((earnedPoints / maxPoints) * maxGrade).toFixed(1)
      : null;

  const startTime = myPlayer?.started_at ? new Date(myPlayer.started_at) : null;
  const endTime = myPlayer?.finished_at ? new Date(myPlayer.finished_at) : null;
  const durationMin =
    startTime && endTime
      ? Math.round((endTime.getTime() - startTime.getTime()) / 60000)
      : null;

  const showScore = results?.show_score_after ?? true;
  const showCorrect = results?.show_correct_answers ?? true;

  // loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // token prompt
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

  // main results
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Score card */}
        {showScore && (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">
              {t("score")}
            </p>
            {grade !== null ? (
              <>
                <div className="text-6xl font-bold text-blue-600 mb-1">
                  {grade}
                  <span className="text-3xl text-blue-400">/{maxGrade}</span>
                </div>
                {maxPoints > 0 && (
                  <p className="text-sm text-gray-400 mt-1">
                    {+earnedPoints.toFixed(1)}/{maxPoints} {t("pointsUnit")}
                  </p>
                )}
              </>
            ) : (
              <div className="text-6xl font-bold text-blue-600 mb-1">
                {totalScore !== null ? (
                  maxPoints > 0 ? (
                    <span>
                      {+earnedPoints.toFixed(1)}
                      <span className="text-3xl text-blue-400">
                        /{maxPoints} {t("pointsUnit")}
                      </span>
                    </span>
                  ) : (
                    `${Math.round(totalScore * 100)}%`
                  )
                ) : (
                  "—"
                )}
              </div>
            )}
            <p className="text-sm text-gray-500 mt-1">
              {myPlayer?.display_name ?? t("player")}
            </p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          {showScore && (
            <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
              <p className="text-2xl font-bold text-gray-900">
                {answeredProgress.filter((p) => (p.score ?? 0) >= 1).length}/
                {totalQuestions}
              </p>
              <p className="text-sm text-gray-500 mt-1">{t("correct")}</p>
            </div>
          )}
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
          <>
            {isTeamMode && (
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">
                {t("myQuestions")}
              </p>
            )}
            <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100 overflow-hidden">
              {myProgress.map((p, i) => {
                const isCorrect = p.score !== null && p.score >= 1;
                const isPending = p.requires_review && p.score === null;
                const isWrong =
                  p.status === "answered" && !isCorrect && !isPending;
                const isExpanded = expandedIds.has(p.id);
                const hasDetail = !!p.question;

                return (
                  <div
                    key={p.id}
                    className={
                      isCorrect
                        ? "bg-green-50"
                        : isPending
                          ? "bg-yellow-50"
                          : isWrong
                            ? "bg-red-50"
                            : ""
                    }
                  >
                    {/* Row header */}
                    <div
                      className={`px-5 py-4 flex items-center gap-3 ${hasDetail ? "cursor-pointer select-none" : ""}`}
                      onClick={() => hasDetail && toggleExpand(p.id)}
                    >
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

                      <span className="text-sm text-gray-700 flex-1">
                        {p.resource_title
                          ? p.resource_title
                          : t("question", { n: i + 1 })}
                        {showScore && p.score !== null && (
                          <span className="ml-2 text-xs text-gray-400">
                            {p.question
                              ? `${+((p.score ?? 0) * p.question.points).toFixed(1)}/${p.question.points} ${t("pointsUnit")}`
                              : `${Math.round(p.score * 100)}%`}
                          </span>
                        )}
                      </span>

                      {isPending && (
                        <span className="text-xs text-yellow-600 font-medium">
                          {t("pendingReview")}
                        </span>
                      )}

                      {hasDetail &&
                        (isExpanded ? (
                          <ChevronUp
                            size={16}
                            className="text-gray-400 flex-shrink-0"
                          />
                        ) : (
                          <ChevronDown
                            size={16}
                            className="text-gray-400 flex-shrink-0"
                          />
                        ))}
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && hasDetail && (
                      <QuestionDetail
                        progress={p}
                        showCorrectAnswers={showCorrect}
                        t={t}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Team mode: teammates' questions */}
        {isTeamMode &&
          teammates.map((teammate) => {
            const tProgress = teammateProgress(teammate.id);
            if (tProgress.length === 0) return null;
            return (
              <div key={teammate.id}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">
                  {t("answeredBy", { name: teammate.display_name })}
                </p>
                <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100 overflow-hidden">
                  {tProgress.map((p, i) => {
                    const isCorrect = p.score !== null && p.score >= 1;
                    const isPending = p.requires_review && p.score === null;
                    const isWrong =
                      p.status === "answered" && !isCorrect && !isPending;
                    const isExpanded = expandedIds.has(p.id);
                    const hasDetail = !!p.question;

                    return (
                      <div
                        key={p.id}
                        className={
                          isCorrect
                            ? "bg-green-50"
                            : isPending
                              ? "bg-yellow-50"
                              : isWrong
                                ? "bg-red-50"
                                : ""
                        }
                      >
                        <div
                          className={`px-5 py-4 flex items-center gap-3 ${hasDetail ? "cursor-pointer select-none" : ""}`}
                          onClick={() => hasDetail && toggleExpand(p.id)}
                        >
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
                          <span className="text-sm text-gray-700 flex-1">
                            {p.resource_title ?? t("question", { n: i + 1 })}
                            {showScore && p.score !== null && (
                              <span className="ml-2 text-xs text-gray-400">
                                {p.question
                                  ? `${+((p.score ?? 0) * p.question.points).toFixed(1)}/${p.question.points} ${t("pointsUnit")}`
                                  : `${Math.round(p.score * 100)}%`}
                              </span>
                            )}
                          </span>
                          {isPending && (
                            <span className="text-xs text-yellow-600 font-medium">
                              {t("pendingReview")}
                            </span>
                          )}
                          {hasDetail &&
                            (isExpanded ? (
                              <ChevronUp
                                size={16}
                                className="text-gray-400 flex-shrink-0"
                              />
                            ) : (
                              <ChevronDown
                                size={16}
                                className="text-gray-400 flex-shrink-0"
                              />
                            ))}
                        </div>
                        {isExpanded && hasDetail && (
                          <QuestionDetail
                            progress={p}
                            showCorrectAnswers={showCorrect}
                            t={t}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

        {/* Play again */}
        {results.session_code && (
          <button
            onClick={() => {
              clearSessionStorage(sessionId);
              router.push(`/join?code=${results.session_code}`);
            }}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-colors text-sm"
          >
            {t("playAgain")}
          </button>
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
