"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { generateHTML } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { ResizableImage } from "@/components/editor/ResizableImage";
import { sanitizeHtml } from "@/lib/sanitize";
import type { ResourceDetailResponse } from "@/types/resource";

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

function TextPreview({ body }: { body: Record<string, unknown> }) {
  const tp = useTranslations("quests.preview");
  const ref = useRef<HTMLDivElement>(null);
  const html = renderTiptap(body);

  useEffect(() => {
    const el = ref.current;
    if (!el || !el.querySelector("pre code")) return;
    import("@/lib/highlightCode").then(({ applyHighlighting }) => {
      if (ref.current) applyHighlighting(ref.current);
    });
  }, [html]);

  if (!html) {
    return (
      <p style={{ margin: 0, color: "#9ca3af", fontSize: "14px" }}>
        {tp("noContent")}
      </p>
    );
  }

  return (
    <div
      ref={ref}
      className="tiptap-preview"
      style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6 }}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  );
}

function QuestionPreview({
  question,
}: {
  question: NonNullable<ResourceDetailResponse["question"]>;
}) {
  const tp = useTranslations("quests.preview");
  const { question_type, body, options, correct_answers, explanation } =
    question;
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !el.querySelector("pre code")) return;
    import("@/lib/highlightCode").then(({ applyHighlighting }) => {
      if (bodyRef.current) applyHighlighting(bodyRef.current);
    });
  }, [body]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* Question body */}
      <div
        ref={bodyRef}
        style={{
          margin: 0,
          fontSize: "14px",
          fontWeight: 500,
          color: "#111827",
          lineHeight: 1.5,
        }}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(body) }}
      />

      {/* Single / Multiple options */}
      {(question_type === "single" || question_type === "multiple") &&
        options.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {options.map((opt) => {
              const isCorrect = opt.is_correct;
              return (
                <div
                  key={opt.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 12px",
                    borderRadius: "10px",
                    border: "1.5px solid",
                    borderColor: isCorrect ? "#bbf7d0" : "#e5e7eb",
                    backgroundColor: isCorrect ? "#f0fdf4" : "#fafafa",
                  }}
                >
                  <div
                    style={{
                      width: "18px",
                      height: "18px",
                      borderRadius: question_type === "single" ? "50%" : "5px",
                      border: "2px solid",
                      borderColor: isCorrect ? "#16a34a" : "#d1d5db",
                      backgroundColor: isCorrect ? "#16a34a" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {isCorrect && <Check size={10} color="white" />}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    {opt.image_url && (
                      <img
                        src={opt.image_url}
                        alt=""
                        style={{
                          maxHeight: "100px",
                          borderRadius: "6px",
                          objectFit: "contain",
                          alignSelf: "flex-start",
                        }}
                      />
                    )}
                    {opt.text && (
                      <span
                        style={{
                          fontSize: "13px",
                          color: isCorrect ? "#15803d" : "#374151",
                          fontWeight: isCorrect ? 500 : 400,
                        }}
                      >
                        {opt.text}
                      </span>
                    )}
                  </div>
                  {isCorrect && (
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#16a34a",
                        flexShrink: 0,
                      }}
                    >
                      {tp("correct")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

      {/* Short answer */}
      {question_type === "short" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "#6b7280",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {tp("shortAnswer")}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {correct_answers.map((ans, i) => (
              <span
                key={i}
                style={{
                  padding: "4px 10px",
                  borderRadius: "8px",
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  fontSize: "13px",
                  color: "#15803d",
                  fontWeight: 500,
                }}
              >
                {ans}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Open answer */}
      {question_type === "open" && (
        <span
          style={{ fontSize: "13px", color: "#9ca3af", fontStyle: "italic" }}
        >
          {tp("openAnswer")}
        </span>
      )}

      {/* Explanation */}
      {explanation && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "10px",
            background: "#fffbeb",
            border: "1px solid #fde68a",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "#d97706",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              display: "block",
              marginBottom: "4px",
            }}
          >
            {tp("explanation")}
          </span>
          <p style={{ margin: 0, fontSize: "13px", color: "#374151" }}>
            {explanation}
          </p>
        </div>
      )}
    </div>
  );
}

export function ResourceContentPreview({
  detail,
}: {
  detail: ResourceDetailResponse;
}) {
  if (detail.text_content) {
    return (
      <TextPreview body={detail.text_content.body as Record<string, unknown>} />
    );
  }
  if (detail.question) {
    return <QuestionPreview question={detail.question} />;
  }
  return null;
}
