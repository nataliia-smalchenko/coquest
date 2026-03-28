"use client";

import { useEffect, useRef, useState } from "react";
import { X, CheckCircle, XCircle, Clock } from "lucide-react";
import { generateHTML } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
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

  // Syntax-highlight code blocks lazily
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !el.querySelector("pre code")) return;
    import("@/lib/highlightCode").then(({ applyHighlighting }) => {
      if (contentRef.current) applyHighlighting(contentRef.current);
    });
  }, [resource]);

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
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-semibold text-gray-800 text-base truncate pr-2">
            {resource?.title ?? "Ресурс"}
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
                className="prose prose-sm max-w-none text-gray-700"
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
                  Ознайомився ✓
                </button>
              )}
              {isAnswered && (
                <div className="mt-4 flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-4 py-2.5 text-sm font-medium">
                  <CheckCircle size={16} />
                  Переглянуто
                </div>
              )}
            </>
          )}

          {!loading && resource?.type === "question" && resource.question && (
            <>
              {answerResult != null ? (
                <div className="space-y-4">
                  <div
                    className="prose prose-sm max-w-none text-gray-800 [&_img]:rounded-md [&_img]:max-w-full"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHtml(resource.question.body),
                    }}
                  />
                  {answerResult.requires_review ? (
                    <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg px-4 py-3 text-sm">
                      <Clock size={16} />
                      Відповідь надіслана — очікує перевірки
                    </div>
                  ) : answerResult.correct ? (
                    <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 text-sm font-medium">
                      <CheckCircle size={16} />
                      Правильно!
                      {answerResult.score !== null &&
                        answerResult.score < 1 && (
                          <span className="ml-auto text-xs">
                            {Math.round((answerResult.score ?? 0) * 100)}%
                          </span>
                        )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm font-medium">
                      <XCircle size={16} />
                      Неправильно
                    </div>
                  )}
                  {resource.question.explanation && (
                    <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-600">
                      <span className="font-medium">Пояснення: </span>
                      {resource.question.explanation}
                    </div>
                  )}
                </div>
              ) : isAnswered ? (
                <div className="flex items-center gap-2 text-gray-600 text-sm">
                  <CheckCircle size={16} className="text-green-500" />
                  Відповідь вже надана
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
              Не вдалося завантажити ресурс
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
