"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  ArrowLeft,
  Check,
  Clock,
  FileText,
  HelpCircle,
  Pencil,
  Play,
  Shuffle,
  Users,
  X,
} from "lucide-react";
import { generateHTML } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { ResizableImage } from "@/components/editor/ResizableImage";
import { sanitizeHtml } from "@/lib/sanitize";
import { getQuest } from "@/lib/api/quests";
import { getMaps, getMap } from "@/lib/api/maps";
import { getResource } from "@/lib/api/resources";
import MapPreview from "./MapPreview";
import type { QuestResponse, QuestSettings, QuestStatus } from "@/types/quest";
import type { MapResponse } from "@/types/map";
import type { ResourceDetailResponse } from "@/types/resource";

const STATUS_STYLE: Record<QuestStatus, { bg: string; color: string }> = {
  draft: { bg: "#f3f4f6", color: "#4b5563" },
  published: { bg: "#f0fdf4", color: "#15803d" },
  archived: { bg: "#fff7ed", color: "#c2410c" },
};

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

interface Props {
  questId: string;
}

export default function QuestPreview({ questId }: Props) {
  const t = useTranslations("quests");
  const tp = useTranslations("quests.preview");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();

  const [quest, setQuest] = useState<QuestResponse | null>(null);
  const [map, setMap] = useState<MapResponse | null>(null);
  const [resources, setResources] = useState<ResourceDetailResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getQuest(questId)
      .then(async (q) => {
        setQuest(q);

        // Load map
        if (q.map_id) {
          const maps = await getMaps(locale);
          const found = maps.find((m) => m.id === q.map_id);
          if (found) {
            const fullMap = await getMap(found.slug);
            setMap(fullMap);
          }
        }

        // Load all resources in parallel
        if (q.resources.length > 0) {
          const sorted = [...q.resources].sort(
            (a, b) => a.order_index - b.order_index,
          );
          const details = await Promise.all(
            sorted.map((r) => getResource(r.resource_id)),
          );
          setResources(details);
        }
      })
      .catch(() => router.push("/teacher/quests"))
      .finally(() => setLoading(false));
  }, [questId, locale, router]);

  if (loading || !quest) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#f9fafb",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            border: "3px solid #e5e7eb",
            borderTopColor: "#2563eb",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const translation = quest.translations[0];
  const settings = quest.settings as QuestSettings | null;
  const badge = STATUS_STYLE[quest.status];

  // Build active settings chips
  const chips: { icon: React.ReactNode; label: string; color: string }[] = [];
  if (quest.max_players > 1) {
    chips.push({
      icon: <Users size={13} />,
      label: tp("settingTeam", { n: quest.max_players }),
      color: "#7c3aed",
    });
  } else {
    chips.push({
      icon: <Users size={13} />,
      label: tp("settingSolo"),
      color: "#6b7280",
    });
  }
  if (settings?.time_limit_minutes) {
    chips.push({
      icon: <Clock size={13} />,
      label: tp("settingTime", { n: settings.time_limit_minutes }),
      color: "#d97706",
    });
  }
  if (settings?.random_order) {
    chips.push({
      icon: <Shuffle size={13} />,
      label: tp("settingRandom"),
      color: "#2563eb",
    });
  }
  if (settings?.show_all_texts) {
    chips.push({
      icon: <FileText size={13} />,
      label: tp("settingShowAll"),
      color: "#2563eb",
    });
  }
  if (settings?.distribute_texts_in_team) {
    chips.push({
      icon: <FileText size={13} />,
      label: tp("settingDistribute"),
      color: "#7c3aed",
    });
  }
  if (settings?.show_score_after) {
    chips.push({
      icon: <Check size={13} />,
      label: tp("settingScore"),
      color: "#16a34a",
    });
  }
  if (settings?.show_correct_answers) {
    chips.push({
      icon: <Check size={13} />,
      label: tp("settingCorrect"),
      color: "#16a34a",
    });
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb" }}>
      {/* Header */}
      <div
        style={{
          background: "white",
          borderBottom: "1px solid #e5e7eb",
          position: "sticky",
          top: 64,
          zIndex: 20,
        }}
      >
        <div
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
            padding: "0 20px",
            height: "64px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flex: 1,
              minWidth: 0,
            }}
          >
            <button
              onClick={() => router.push("/teacher/quests")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "14px",
                color: "#6b7280",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#111827";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#6b7280";
              }}
            >
              <ArrowLeft size={16} />
              <span className="hide-mobile">{tCommon("back")}</span>
            </button>
            <span
              style={{
                width: "1px",
                height: "20px",
                background: "#e5e7eb",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: "15px",
                fontWeight: 600,
                color: "#111827",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {translation?.title ?? "—"}
            </span>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                borderRadius: "20px",
                padding: "3px 10px",
                backgroundColor: badge.bg,
                color: badge.color,
                flexShrink: 0,
              }}
            >
              {t(`status.${quest.status}`)}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexShrink: 0,
            }}
          >
            {quest.status === "published" && (
              <button
                onClick={() =>
                  router.push(`/teacher/sessions/new?quest_id=${quest.id}`)
                }
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 14px",
                  backgroundColor: "#16a34a",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    "#15803d";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    "#16a34a";
                }}
              >
                <Play size={13} />
                <span className="hide-mobile">{t("preview.startSession")}</span>
              </button>
            )}
            <button
              onClick={() => router.push(`/teacher/quests/${quest.id}/edit`)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 16px",
                backgroundColor: "#2563eb",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  "#1d4ed8";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  "#2563eb";
              }}
            >
              <Pencil size={13} /> {tCommon("edit")}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          maxWidth: "800px",
          margin: "0 auto",
          padding: "32px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        {/* Description */}
        {translation?.description && (
          <p
            style={{
              margin: 0,
              fontSize: "15px",
              color: "#4b5563",
              lineHeight: 1.6,
            }}
          >
            {translation.description}
          </p>
        )}

        {/* Map Preview */}
        <div
          style={{
            background: "white",
            borderRadius: "16px",
            border: "1px solid #e5e7eb",
            overflow: "hidden",
          }}
        >
          {map ? (
            <MapPreview map={map} />
          ) : (
            <div
              style={{
                padding: "32px",
                textAlign: "center",
                color: "#9ca3af",
                fontSize: "14px",
              }}
            >
              {tp("noMap")}
            </div>
          )}
        </div>

        {/* Settings chips */}
        {chips.length > 0 && (
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              border: "1px solid #e5e7eb",
              padding: "16px 20px",
            }}
          >
            <p
              style={{
                margin: "0 0 12px",
                fontSize: "13px",
                fontWeight: 700,
                color: "#374151",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {tp("settings")}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {chips.map((chip, i) => (
                <span
                  key={i}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "5px 12px",
                    borderRadius: "20px",
                    background: "#f9fafb",
                    border: "1px solid #e5e7eb",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: chip.color,
                  }}
                >
                  {chip.icon} {chip.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Materials */}
        <div>
          <p
            style={{
              margin: "0 0 12px",
              fontSize: "13px",
              fontWeight: 700,
              color: "#374151",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {tp("materials")}
          </p>
          {resources.length === 0 ? (
            <div
              style={{
                background: "white",
                borderRadius: "16px",
                border: "1px solid #e5e7eb",
                padding: "32px",
                textAlign: "center",
                color: "#9ca3af",
                fontSize: "14px",
              }}
            >
              {tp("noMaterials")}
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "16px" }}
            >
              {resources.map((res, idx) => (
                <ResourceCard
                  key={res.id}
                  resource={res}
                  index={idx + 1}
                  tp={tp}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .hide-mobile { }
        @media (max-width: 640px) { .hide-mobile { display: none; } }
        .tiptap-preview h1 { font-size: 1.5rem; font-weight: 700; margin: 0.75em 0 0.25em; }
        .tiptap-preview h2 { font-size: 1.25rem; font-weight: 700; margin: 0.75em 0 0.25em; }
        .tiptap-preview h3 { font-size: 1.1rem; font-weight: 600; margin: 0.5em 0 0.25em; }
        .tiptap-preview p { margin: 0 0 0.5em; line-height: 1.6; }
        .tiptap-preview ul, .tiptap-preview ol { padding-left: 1.5em; margin: 0 0 0.5em; }
        .tiptap-preview li { margin-bottom: 0.25em; }
        .tiptap-preview img { max-width: 100%; border-radius: 8px; }
        .tiptap-preview strong { font-weight: 600; }
        .tiptap-preview em { font-style: italic; }
        .tiptap-preview u { text-decoration: underline; }
        .tiptap-preview [style*="text-align: center"] { text-align: center; }
        .tiptap-preview [style*="text-align: right"] { text-align: right; }
      `}</style>
    </div>
  );
}

function ResourceCard({
  resource,
  index,
  tp,
}: {
  resource: ResourceDetailResponse;
  index: number;
  tp: ReturnType<typeof useTranslations<"quests.preview">>;
}) {
  const isText = resource.type === "text";

  return (
    <div
      style={{
        background: "white",
        borderRadius: "16px",
        border: "1px solid #e5e7eb",
        overflow: "hidden",
      }}
    >
      {/* Card header */}
      <div
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid #f3f4f6",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          background: isText ? "#eff6ff" : "#f5f3ff",
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "8px",
            backgroundColor: isText ? "#dbeafe" : "#ede9fe",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {isText ? (
            <FileText size={14} color="#2563eb" />
          ) : (
            <HelpCircle size={14} color="#7c3aed" />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: isText ? "#2563eb" : "#7c3aed",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {index}. {isText ? tp("textMaterial") : tp("questionLabel")}
          </span>
          <p
            style={{
              margin: "1px 0 0",
              fontSize: "14px",
              fontWeight: 600,
              color: "#111827",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {resource.title}
          </p>
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding: "20px" }}>
        {isText ? (
          <TextMaterialView content={resource.text_content?.body} tp={tp} />
        ) : resource.question ? (
          <QuestionView question={resource.question} tp={tp} />
        ) : (
          <p style={{ margin: 0, color: "#9ca3af", fontSize: "14px" }}>
            {tp("noContent")}
          </p>
        )}
      </div>
    </div>
  );
}

function TextMaterialView({
  content,
  tp,
}: {
  content: Record<string, unknown> | undefined;
  tp: ReturnType<typeof useTranslations<"quests.preview">>;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const html = content ? renderTiptap(content) : "";

  useEffect(() => {
    const el = ref.current;
    if (!el || !el.querySelector("pre code")) return;
    import("@/lib/highlightCode").then(({ applyHighlighting }) => {
      if (ref.current) applyHighlighting(ref.current);
    });
  }, [html]);

  if (!html)
    return (
      <p style={{ margin: 0, color: "#9ca3af", fontSize: "14px" }}>
        {tp("noContent")}
      </p>
    );

  return (
    <div
      ref={ref}
      className="tiptap-preview"
      style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6 }}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  );
}

function QuestionView({
  question,
  tp,
}: {
  question: NonNullable<ResourceDetailResponse["question"]>;
  tp: ReturnType<typeof useTranslations<"quests.preview">>;
}) {
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
          fontSize: "15px",
          fontWeight: 500,
          color: "#111827",
          lineHeight: 1.5,
        }}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(body) }}
      />

      {/* Options for single/multiple */}
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
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1.5px solid",
                    borderColor: isCorrect ? "#bbf7d0" : "#e5e7eb",
                    backgroundColor: isCorrect ? "#f0fdf4" : "#fafafa",
                  }}
                >
                  <div
                    style={{
                      width: "20px",
                      height: "20px",
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
                    {isCorrect && <Check size={11} color="white" />}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    {opt.image_url && (
                      <img
                        src={opt.image_url}
                        alt=""
                        style={{
                          maxHeight: "120px",
                          borderRadius: "6px",
                          objectFit: "contain",
                          alignSelf: "flex-start",
                        }}
                      />
                    )}
                    {opt.text && (
                      <span
                        style={{
                          fontSize: "14px",
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
              fontSize: "12px",
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
                  padding: "5px 12px",
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
