"use client";

import { useEffect, useRef } from "react";
import { X, CheckCircle, XCircle, Clock } from "lucide-react";
import { generateHTML } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { useTranslations } from "next-intl";
import { ResizableImage } from "@/components/editor/ResizableImage";
import { sanitizeHtml } from "@/lib/sanitize";
import type { ResourceDetailPublicResponse } from "@/types/resource";
import type { SessionProgress } from "@/types/session";
import QuestionForm from "./QuestionForm";

interface AnswerResult {
  correct: boolean | null;
  score: number | null;
  requires_review: boolean;
}

interface ResourceModalProps {
  progress: SessionProgress;
  resource: ResourceDetailPublicResponse | null;
  loading?: boolean;
  answerResult?: AnswerResult | null;
  onClose: () => void;
  onMarkViewed: () => void;
  onSubmitAnswer: (answer: Record<string, unknown>) => void;
  isSubmitting?: boolean;
}

function getSelectedIds(answer: unknown, questionType: string): string[] {
  if (!answer || typeof answer !== "object") return [];
  const a = answer as Record<string, unknown>;
  if (questionType === "single")
    return a.option_id ? [String(a.option_id)] : [];
  if (questionType === "multiple")
    return Array.isArray(a.option_ids)
      ? (a.option_ids as unknown[]).map(String)
      : [];
  return [];
}

function getAnswerText(answer: unknown): string {
  if (!answer || typeof answer !== "object") return "";
  const a = answer as Record<string, unknown>;
  return typeof a.text === "string" ? a.text : "";
}

function renderTiptap(body: Record<string, unknown>): string {
  try {
    return generateHTML(body as Parameters<typeof generateHTML>[0], [
      StarterKit,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      ResizableImage,
    ]);
  } catch {
    return "";
  }
}

export default function ResourceModal({
  progress,
  resource,
  loading,
  answerResult,
  onClose,
  onMarkViewed,
  onSubmitAnswer,
  isSubmitting,
}: ResourceModalProps) {
  const t = useTranslations("game.game");
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Close on overlay click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Syntax-highlight code blocks lazily; re-run when answer is submitted (view switches)
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !el.querySelector("pre code")) return;
    import("@/lib/highlightCode").then(({ applyHighlighting }) => {
      if (contentRef.current) applyHighlighting(contentRef.current);
    });
  }, [resource, answerResult]);

  const isAnswered =
    progress.status === "answered" || progress.status === "viewed";

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={handleOverlayClick}
    >
      {/* Modal */}
      <div className="bg-white w-full md:max-w-lg md:rounded-2xl rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          {resource?.type === "question" && resource.question && (
            <span className="text-xs font-semibold text-violet-600 bg-violet-50 border border-violet-200 rounded-full px-2.5 py-0.5 flex-shrink-0">
              {resource.question.points} {t("pointsUnit")}
            </span>
          )}
          <h3 className="font-semibold text-gray-800 text-base truncate flex-1">
            {resource?.title ?? t("resource")}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto px-5 py-4 min-h-0"
        >
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && resource?.type === "text" && resource.text_content && (
            <>
              <div
                className="prose prose-sm max-w-none text-gray-700 [&_code]:before:content-none [&_code]:after:content-none [&_pre_code]:text-black"
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
                  onClick={onMarkViewed}
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

          {!loading && resource?.type === "question" && resource.question && (
            <>
              {answerResult != null ? (
                <div className="space-y-4">
                  <div
                    className="prose prose-sm max-w-none text-gray-800 [&_img]:rounded-md [&_img]:max-w-full [&_code]:before:content-none [&_code]:after:content-none [&_pre_code]:text-black"
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
                        {answerResult.score !== null
                          ? `+${+(answerResult.score * resource.question.points).toFixed(1)} / ${resource.question.points} ${t("pointsUnit")}`
                          : `+${resource.question.points} / ${resource.question.points} ${t("pointsUnit")}`}
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
                      <span className="font-medium">{t("explanation")}: </span>
                      {resource.question.explanation}
                    </div>
                  )}
                </div>
              ) : isAnswered ? (
                <div className="space-y-3">
                  <div
                    className="prose prose-sm max-w-none text-gray-800 [&_img]:rounded-md [&_img]:max-w-full [&_code]:before:content-none [&_code]:after:content-none [&_pre_code]:text-black"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHtml(resource.question.body),
                    }}
                  />
                  {(resource.question.question_type === "single" ||
                    resource.question.question_type === "multiple") && (
                    <ul className="space-y-1.5">
                      {resource.question.options.map((opt) => {
                        const selected = getSelectedIds(
                          progress.answer,
                          resource.question!.question_type,
                        ).includes(opt.id);
                        return (
                          <li
                            key={opt.id}
                            className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm ${
                              selected
                                ? "bg-blue-50 border-blue-300 font-medium"
                                : "bg-gray-50 border-gray-200 text-gray-600"
                            }`}
                          >
                            <span className="flex-1">{opt.text}</span>
                            {selected && (
                              <CheckCircle
                                size={14}
                                className="text-blue-500 flex-shrink-0"
                              />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {resource.question.question_type !== "single" &&
                    resource.question.question_type !== "multiple" && (
                      <div className="border border-blue-200 bg-blue-50 rounded-lg px-3 py-2 text-sm text-gray-800">
                        <span className="block text-xs text-blue-500 font-medium mb-0.5">
                          {t("yourAnswer")}
                        </span>
                        {getAnswerText(progress.answer) || "—"}
                      </div>
                    )}
                  <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-3 py-2 text-sm font-medium">
                    <CheckCircle size={14} />
                    {t("alreadyAnswered")}
                  </div>
                </div>
              ) : (
                <QuestionForm
                  question={resource.question}
                  onSubmit={onSubmitAnswer}
                  isSubmitting={isSubmitting}
                />
              )}
            </>
          )}

          {!loading && !resource && (
            <p className="text-center text-gray-400 py-8 text-sm">
              {t("loadError")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
