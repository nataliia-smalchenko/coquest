"use client";

import { useState } from "react";
import { sanitizeHtml } from "@/lib/sanitize";
import type { QuestionPublicResponse } from "@/types/resource";

interface QuestionFormProps {
  question: QuestionPublicResponse;
  onSubmit: (answer: Record<string, unknown>) => void;
  isSubmitting?: boolean;
}

export default function QuestionForm({
  question,
  onSubmit,
  isSubmitting,
}: QuestionFormProps) {
  const [singleId, setSingleId] = useState<string>("");
  const [multiIds, setMultiIds] = useState<string[]>([]);
  const [shortText, setShortText] = useState("");
  const [openText, setOpenText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let answer: Record<string, unknown>;
    switch (question.question_type) {
      case "single":
        answer = { option_id: singleId };
        break;
      case "multiple":
        answer = { option_ids: multiIds };
        break;
      case "short":
        answer = { text: shortText.trim() };
        break;
      case "open":
        answer = { text: openText.trim() };
        break;
      default:
        answer = {};
    }
    onSubmit(answer);
  };

  const isValid = () => {
    switch (question.question_type) {
      case "single":
        return !!singleId;
      case "multiple":
        return multiIds.length > 0;
      case "short":
        return shortText.trim().length > 0;
      case "open":
        return openText.trim().length > 0;
      default:
        return false;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Question body — HTML with possible images */}
      <div
        className="prose prose-sm max-w-none text-gray-800 [&_img]:rounded-md [&_img]:max-w-full"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(question.body) }}
      />

      {question.question_type === "single" && (
        <div className="space-y-2">
          {question.options.map((opt) => (
            <label
              key={opt.id}
              className={`flex flex-col gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                singleId === opt.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="single"
                  value={opt.id}
                  checked={singleId === opt.id}
                  onChange={() => setSingleId(opt.id)}
                  className="text-blue-600 accent-blue-600 flex-shrink-0"
                />
                {opt.text && (
                  <span className="text-sm text-gray-700">{opt.text}</span>
                )}
              </div>
              {opt.image_url && (
                <img
                  src={opt.image_url}
                  alt=""
                  className="rounded-md max-w-full"
                  style={{ maxHeight: "160px", objectFit: "contain" }}
                />
              )}
            </label>
          ))}
        </div>
      )}

      {question.question_type === "multiple" && (
        <div className="space-y-2">
          {question.options.map((opt) => (
            <label
              key={opt.id}
              className={`flex flex-col gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                multiIds.includes(opt.id)
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  value={opt.id}
                  checked={multiIds.includes(opt.id)}
                  onChange={(e) => {
                    setMultiIds(
                      e.target.checked
                        ? [...multiIds, opt.id]
                        : multiIds.filter((id) => id !== opt.id),
                    );
                  }}
                  className="text-blue-600 accent-blue-600 flex-shrink-0"
                />
                {opt.text && (
                  <span className="text-sm text-gray-700">{opt.text}</span>
                )}
              </div>
              {opt.image_url && (
                <img
                  src={opt.image_url}
                  alt=""
                  className="rounded-md max-w-full"
                  style={{ maxHeight: "160px", objectFit: "contain" }}
                />
              )}
            </label>
          ))}
        </div>
      )}

      {question.question_type === "short" && (
        <input
          type="text"
          value={shortText}
          onChange={(e) => setShortText(e.target.value)}
          placeholder="Ваша відповідь..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}

      {question.question_type === "open" && (
        <textarea
          value={openText}
          onChange={(e) => setOpenText(e.target.value)}
          rows={4}
          placeholder="Ваша відповідь..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      )}

      <button
        type="submit"
        disabled={!isValid() || isSubmitting}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
      >
        {isSubmitting ? "Відправка..." : "Відповісти"}
      </button>
    </form>
  );
}
