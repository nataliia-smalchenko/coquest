"use client";

import { generateHTML } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { CheckCircle, Clock, Lock, Wifi, WifiOff, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ResizableImage } from "@/components/editor/ResizableImage";
import TimerDisplay from "@/components/game/TimerDisplay";
import { useHighlightCode } from "@/hooks/useHighlightCode";
import { getProgressResource, markViewed, submitAnswer } from "@/lib/api/runs";
import { sanitizeHtml } from "@/lib/sanitize";
import type { ResourceDetailPublicResponse } from "@/types/resource";
import type { GameInfoResponse, RunProgress } from "@/types/run";
import QuestionForm from "./QuestionForm";

interface AnswerResult {
  correct: boolean | null;
  score: number | null;
  requires_review: boolean;
}

interface TestViewProps {
  gameInfo: GameInfoResponse;
  progress: RunProgress[];
  guestToken: string;
  runId?: string;
  onProgressUpdate: (p: RunProgress) => void;
  reconnecting?: boolean;
  endsAt?: string;
  onTimeout?: () => void;
  onComplete?: () => void;
}

function renderTiptap(body: Record<string, unknown>): string {
  try {
    return generateHTML(body as Parameters<typeof generateHTML>[0], [
      StarterKit,
      ResizableImage,
    ]);
  } catch {
    return "";
  }
}

export default function TestView({
  gameInfo,
  progress,
  guestToken,
  onProgressUpdate,
  reconnecting,
  endsAt,
  onTimeout,
  onComplete,
}: TestViewProps) {
  const t = useTranslations("game.game");
  const settings = gameInfo.settings;
  const isTeacherManaged = gameInfo.test_mode === "teacher_managed";
  const keepCompleted = settings?.keep_completed_in_materials ?? true;
  const showFeedback = settings?.show_feedback_after_answer ?? false;

  // Sort progress by step_order
  const sorted = useMemo(
    () =>
      [...progress].sort((a, b) => (a.step_order ?? 0) - (b.step_order ?? 0)),
    [progress],
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [resource, setResource] = useState<ResourceDetailPublicResponse | null>(
    null,
  );
  const [loadingResource, setLoadingResource] = useState(false);
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shownFeedback, setShownFeedback] = useState<Set<string>>(new Set());

  const currentProgress = sorted[currentIndex] ?? null;
  const totalQuestions = sorted.length;
  const answeredCount = sorted.filter(
    (p) => p.status === "answered" || p.status === "viewed",
  ).length;
  const allCompleted = answeredCount === totalQuestions && totalQuestions > 0;

  const contentRef = useHighlightCode<HTMLDivElement>([resource, answerResult]);

  // Determine which questions are accessible
  const isQuestionAccessible = useCallback(
    (index: number) => {
      const p = sorted[index];
      if (!p) return false;

      // In teacher-managed mode, only questions in current progress are visible
      if (isTeacherManaged) {
        const inProgress = progress.some((pp) => pp.id === p.id);
        if (!inProgress) return false;
      }

      // If keep_completed is OFF, can't go back to completed questions
      if (!keepCompleted) {
        const done = p.status === "answered" || p.status === "viewed";
        if (done && index !== currentIndex) return false;
      }

      return true;
    },
    [sorted, progress, isTeacherManaged, keepCompleted, currentIndex],
  );

  // Load resource when current step changes
  const currentProgressId = currentProgress?.id ?? null;
  useEffect(() => {
    if (!currentProgressId) {
      setResource(null);
      return;
    }
    setLoadingResource(true);
    setAnswerResult(null);
    getProgressResource(currentProgressId, guestToken)
      .then(setResource)
      .catch(() => setResource(null))
      .finally(() => setLoadingResource(false));
  }, [currentProgressId, guestToken]);

  // Show feedback from WS updates
  useEffect(() => {
    if (!currentProgress || !showFeedback) return;
    if (
      currentProgress.status === "answered" &&
      currentProgress.score !== null &&
      !shownFeedback.has(currentProgress.id)
    ) {
      setAnswerResult({
        correct: currentProgress.score >= 1.0,
        score: currentProgress.score,
        requires_review: currentProgress.requires_review,
      });
    }
  }, [currentProgress, showFeedback, shownFeedback]);

  // When new questions appear (teacher advances), auto-navigate if keep_completed is OFF
  useEffect(() => {
    if (!isTeacherManaged || keepCompleted) return;
    const lastIdx = sorted.findLastIndex(
      (p) => p.status === "assigned" && progress.some((pp) => pp.id === p.id),
    );
    if (lastIdx >= 0) {
      setCurrentIndex(lastIdx);
      setAnswerResult(null);
    }
  }, [isTeacherManaged, keepCompleted, sorted, progress]);

  const handleSubmitAnswer = useCallback(
    async (answer: Record<string, unknown>) => {
      if (!currentProgress) return;
      setIsSubmitting(true);
      try {
        const updated = await submitAnswer(
          currentProgress.id,
          answer,
          guestToken,
        );
        onProgressUpdate(updated);

        if (showFeedback) {
          setAnswerResult({
            correct: updated.score !== null ? updated.score >= 1.0 : null,
            score: updated.score,
            requires_review: updated.requires_review,
          });
          setShownFeedback((prev) => new Set(prev).add(currentProgress.id));
        } else {
          // Auto-advance to next unanswered
          const nextIdx = sorted.findIndex(
            (p, i) => i > currentIndex && p.status === "assigned",
          );
          if (nextIdx >= 0) setCurrentIndex(nextIdx);
        }
      } catch {
        // ignore
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      currentProgress,
      guestToken,
      onProgressUpdate,
      showFeedback,
      sorted,
      currentIndex,
    ],
  );

  const handleMarkViewed = useCallback(async () => {
    if (!currentProgress) return;
    setIsSubmitting(true);
    try {
      const updated = await markViewed(currentProgress.id, guestToken);
      onProgressUpdate(updated);
      const nextIdx = sorted.findIndex(
        (p, i) => i > currentIndex && p.status === "assigned",
      );
      if (nextIdx >= 0) setCurrentIndex(nextIdx);
    } catch {
      // ignore
    } finally {
      setIsSubmitting(false);
    }
  }, [currentProgress, guestToken, onProgressUpdate, sorted, currentIndex]);

  const navigateTo = (index: number) => {
    if (isQuestionAccessible(index)) {
      setCurrentIndex(index);
      setAnswerResult(null);
    }
  };

  const isAnswered =
    currentProgress?.status === "answered" ||
    currentProgress?.status === "viewed";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-800 truncate">
            {gameInfo.resource_set_title}
          </h1>
          <div className="flex items-center gap-3">
            {reconnecting && (
              <WifiOff size={16} className="text-orange-500 animate-pulse" />
            )}
            {!reconnecting && endsAt && (
              <Wifi size={14} className="text-green-500" />
            )}
            {endsAt && <TimerDisplay ends_at={endsAt} onExpire={onTimeout} />}
            <span className="text-sm text-gray-500">
              {answeredCount}/{totalQuestions}
            </span>
          </div>
        </div>
      </header>

      {/* Question number bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-2.5 flex-shrink-0">
        <div className="max-w-3xl mx-auto flex items-center gap-1.5 overflow-x-auto">
          {sorted.map((p, i) => {
            const isLocked =
              isTeacherManaged && !progress.some((pp) => pp.id === p.id);
            const done = p.status === "answered" || p.status === "viewed";
            const isCurrent = i === currentIndex;
            const accessible = isQuestionAccessible(i);

            let bgColor: string;
            let textColor: string;
            let borderColor: string;

            if (isLocked) {
              bgColor = "bg-gray-100";
              textColor = "text-gray-400";
              borderColor = "border-gray-200";
            } else if (isCurrent) {
              bgColor = "bg-blue-600";
              textColor = "text-white";
              borderColor = "border-blue-600";
            } else if (done) {
              bgColor = "bg-green-50";
              textColor = "text-green-700";
              borderColor = "border-green-300";
            } else if (!accessible) {
              bgColor = "bg-gray-50";
              textColor = "text-gray-400";
              borderColor = "border-gray-200";
            } else {
              bgColor = "bg-white";
              textColor = "text-gray-700";
              borderColor = "border-gray-300";
            }

            return (
              <button
                key={p.id}
                type="button"
                disabled={!accessible}
                onClick={() => navigateTo(i)}
                className={`w-9 h-9 rounded-lg text-xs font-bold flex items-center justify-center flex-shrink-0 border transition-all ${bgColor} ${textColor} ${borderColor} ${
                  accessible && !isCurrent
                    ? "hover:border-blue-400 hover:bg-blue-50 cursor-pointer"
                    : ""
                } ${!accessible ? "cursor-not-allowed" : ""}`}
                title={
                  isLocked ? t("questionLocked") : t("questionN", { n: i + 1 })
                }
              >
                {isLocked ? (
                  <Lock size={12} />
                ) : done && !isCurrent ? (
                  <CheckCircle size={14} className="text-green-600" />
                ) : (
                  i + 1
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div ref={contentRef} className="max-w-3xl mx-auto px-4 py-6">
          {/* All completed banner */}
          {allCompleted && !answerResult && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <CheckCircle size={48} className="text-green-500" />
              <p className="text-lg font-semibold text-green-700">
                {t("allCompleted")}
              </p>
              {onComplete && (
                <button
                  type="button"
                  onClick={onComplete}
                  className="mt-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
                >
                  {t("viewResults")}
                </button>
              )}
            </div>
          )}

          {/* Loading */}
          {loadingResource && (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Resource content */}
          {!loadingResource && currentProgress && resource && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              {/* Resource header */}
              <div className="flex items-center gap-2 mb-5">
                <span className="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-1">
                  {t("questionN", { n: currentIndex + 1 })}
                </span>
                {resource.type === "question" && resource.question && (
                  <span className="text-xs font-semibold text-violet-600 bg-violet-50 border border-violet-200 rounded-full px-2.5 py-1">
                    {resource.question.points} {t("pointsUnit")}
                  </span>
                )}
                <span className="flex-1" />
                {resource.title && (
                  <span className="text-sm font-medium text-gray-500 truncate max-w-[200px]">
                    {resource.title}
                  </span>
                )}
              </div>

              {/* Text resource */}
              {resource.type === "text" && resource.text_content && (
                <>
                  <div
                    className="tiptap-preview prose prose-sm max-w-none text-gray-700 [&_code]:before:content-none [&_code]:after:content-none [&_pre_code]:text-black"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized tiptap content
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHtml(
                        renderTiptap(
                          resource.text_content.body as Record<string, unknown>,
                        ),
                      ),
                    }}
                  />
                  {!isAnswered && (
                    <button
                      type="button"
                      onClick={handleMarkViewed}
                      disabled={isSubmitting}
                      className="mt-5 w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
                    >
                      <CheckCircle size={16} />
                      {t("markRead")}
                    </button>
                  )}
                  {isAnswered && (
                    <div className="mt-4 flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-4 py-2.5 text-sm font-medium">
                      <CheckCircle size={16} />
                      {t("viewed")}
                    </div>
                  )}
                </>
              )}

              {/* Question with feedback */}
              {resource.type === "question" &&
                resource.question &&
                answerResult != null && (
                  <div className="space-y-4">
                    <div
                      className="tiptap-preview prose prose-sm max-w-none text-gray-800 [&_img]:rounded-md [&_code]:before:content-none [&_code]:after:content-none [&_pre_code]:text-black"
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized question content
                      dangerouslySetInnerHTML={{
                        __html: sanitizeHtml(resource.question.body),
                      }}
                    />
                    {answerResult.requires_review ? (
                      <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg px-4 py-3 text-sm">
                        <Clock size={16} />
                        {t("pendingAnswer")}
                      </div>
                    ) : answerResult.correct ? (
                      <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 text-sm font-medium">
                        <CheckCircle size={16} />
                        {t("correct")}
                        <span className="ml-auto text-xs font-semibold">
                          +
                          {answerResult.score !== null
                            ? +(
                                answerResult.score * resource.question.points
                              ).toFixed(1)
                            : resource.question.points}{" "}
                          / {resource.question.points} {t("pointsUnit")}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm font-medium">
                        <XCircle size={16} />
                        {t("incorrect")}
                        <span className="ml-auto text-xs font-semibold">
                          0 / {resource.question.points} {t("pointsUnit")}
                        </span>
                      </div>
                    )}
                    {resource.question.explanation && (
                      <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-600">
                        <span className="font-medium">
                          {t("explanation")}:{" "}
                        </span>
                        {resource.question.explanation}
                      </div>
                    )}
                  </div>
                )}

              {/* Question already answered (no feedback) */}
              {resource.type === "question" &&
                resource.question &&
                answerResult == null &&
                isAnswered && (
                  <div className="space-y-3">
                    <div
                      className="tiptap-preview prose prose-sm max-w-none text-gray-800 [&_img]:rounded-md [&_code]:before:content-none [&_code]:after:content-none [&_pre_code]:text-black"
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized question content
                      dangerouslySetInnerHTML={{
                        __html: sanitizeHtml(resource.question.body),
                      }}
                    />
                    <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-3 py-2 text-sm font-medium">
                      <CheckCircle size={14} />
                      {t("alreadyAnswered")}
                    </div>
                  </div>
                )}

              {/* Question form (unanswered) */}
              {resource.type === "question" &&
                resource.question &&
                answerResult == null &&
                !isAnswered && (
                  <QuestionForm
                    question={resource.question}
                    onSubmit={handleSubmitAnswer}
                    isSubmitting={isSubmitting}
                  />
                )}
            </div>
          )}

          {/* No resource loaded */}
          {!loadingResource && !resource && currentProgress && (
            <p className="text-center text-gray-400 py-8 text-sm">
              {t("loadError")}
            </p>
          )}

          {/* No questions yet (waiting for teacher) */}
          {totalQuestions === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Clock size={40} className="text-gray-300" />
              <p className="text-sm text-gray-500">{t("questionLocked")}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
