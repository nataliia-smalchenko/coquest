"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  Calendar,
  FileText,
  Folder,
  HelpCircle,
  Pencil,
  Trash2,
} from "lucide-react";
import { useResourceStore } from "@/hooks/useResourceStore";
import type { DifficultyLevel, ResourceResponse } from "@/types/resource";

const DIFFICULTY_STYLE: Record<DifficultyLevel, { bg: string; color: string }> =
  {
    beginner: { bg: "#fef2f2", color: "#dc2626" },
    intermediate: { bg: "#fefce8", color: "#ca8a04" },
    sufficient: { bg: "#eff6ff", color: "#2563eb" },
    advanced: { bg: "#f0fdf4", color: "#16a34a" },
  };

interface ResourceCardProps {
  resource: ResourceResponse;
}

export function ResourceCard({ resource }: ResourceCardProps) {
  const t = useTranslations("resources");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const { deleteResource, folders } = useResourceStore();
  const folderName = resource.folder_id
    ? (folders.find((f) => f.id === resource.folder_id)?.name ?? null)
    : null;
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(tCommon("delete") + "?")) return;
    setDeleting(true);
    try {
      await deleteResource(resource.id);
    } catch {
      console.error("Delete failed");
      setDeleting(false);
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/teacher/resources/${resource.id}/edit`);
  };

  const formattedDate = new Date(resource.updated_at).toLocaleDateString(
    locale,
    { day: "numeric", month: "short" },
  );

  const isText = resource.type === "text";
  const accentColor = isText ? "#2563eb" : "#7c3aed";
  const accentBg = isText ? "#eff6ff" : "#f5f3ff";

  return (
    <div
      onClick={handleEdit}
      style={{
        background: "white",
        borderRadius: "16px",
        border: "1px solid #e5e7eb",
        padding: "16px",
        cursor: "pointer",
        opacity: deleting ? 0.5 : 1,
        pointerEvents: deleting ? "none" : "auto",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        transition: "box-shadow 0.15s, border-color 0.15s",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 4px 16px rgba(0,0,0,0.08)";
        (e.currentTarget as HTMLDivElement).style.borderColor = "#d1d5db";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
        (e.currentTarget as HTMLDivElement).style.borderColor = "#e5e7eb";
        const actions = e.currentTarget.querySelector(
          "[data-actions]",
        ) as HTMLElement | null;
        if (actions) actions.style.opacity = "0";
      }}
      onMouseOver={(e) => {
        const actions = e.currentTarget.querySelector(
          "[data-actions]",
        ) as HTMLElement | null;
        if (actions) actions.style.opacity = "1";
      }}
    >
      {/* Top row: icon + badge */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "10px",
            backgroundColor: accentBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {isText ? (
            <FileText size={20} color={accentColor} />
          ) : (
            <HelpCircle size={20} color={accentColor} />
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            alignItems: "flex-end",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: accentColor,
              backgroundColor: accentBg,
              borderRadius: "20px",
              padding: "3px 10px",
              letterSpacing: "0.02em",
            }}
          >
            {t(`type.${resource.type}`)}
          </span>

          {resource.difficulty && DIFFICULTY_STYLE[resource.difficulty] && (
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: DIFFICULTY_STYLE[resource.difficulty].color,
                backgroundColor: DIFFICULTY_STYLE[resource.difficulty].bg,
                borderRadius: "20px",
                padding: "3px 10px",
                letterSpacing: "0.02em",
              }}
            >
              {t(`question.difficulties.${resource.difficulty}`)}
            </span>
          )}
          {!resource.has_content && (
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "#9ca3af",
                backgroundColor: "#f3f4f6",
                borderRadius: "20px",
                padding: "3px 10px",
                letterSpacing: "0.02em",
              }}
            >
              {t("emptyContent")}
            </span>
          )}
        </div>
      </div>

      {/* Title */}
      <div>
        <p
          style={{
            fontSize: "15px",
            fontWeight: 700,
            color: "#111827",
            lineHeight: 1.4,
            margin: 0,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {resource.title}
        </p>
      </div>

      {/* Tags */}
      {resource.tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
          {resource.tags.slice(0, 4).map((tag) => (
            <span
              key={tag.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "2px 8px",
                borderRadius: "20px",
                fontSize: "11px",
                fontWeight: 500,
                color: "white",
                backgroundColor: tag.color,
              }}
            >
              {tag.name}
            </span>
          ))}
          {resource.tags.length > 4 && (
            <span
              style={{
                fontSize: "11px",
                color: "#9ca3af",
                alignSelf: "center",
              }}
            >
              +{resource.tags.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: "12px",
          borderTop: "1px solid #f3f4f6",
          marginTop: "auto",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          <span
            style={{
              fontSize: "12px",
              color: "#9ca3af",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <Calendar size={12} />
            {formattedDate}
          </span>
          {folderName && (
            <span
              style={{
                fontSize: "12px",
                color: "#9ca3af",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              <Folder size={12} />
              {folderName}
            </span>
          )}
        </div>

        <div
          data-actions
          style={{
            display: "flex",
            gap: "2px",
            opacity: 0,
            transition: "opacity 0.15s",
          }}
        >
          <button
            onClick={handleEdit}
            title={tCommon("edit")}
            style={{
              padding: "6px",
              borderRadius: "8px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "#9ca3af",
              display: "flex",
              alignItems: "center",
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "#eff6ff";
              (e.currentTarget as HTMLButtonElement).style.color = "#2563eb";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "transparent";
              (e.currentTarget as HTMLButtonElement).style.color = "#9ca3af";
            }}
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={handleDelete}
            title={tCommon("delete")}
            style={{
              padding: "6px",
              borderRadius: "8px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "#9ca3af",
              display: "flex",
              alignItems: "center",
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "#fef2f2";
              (e.currentTarget as HTMLButtonElement).style.color = "#ef4444";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "transparent";
              (e.currentTarget as HTMLButtonElement).style.color = "#9ca3af";
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ResourceCardSkeleton() {
  return (
    <div
      style={{
        borderRadius: "16px",
        background:
          "linear-gradient(90deg, #f3f4f6 25%, #e9eaec 50%, #f3f4f6 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.4s infinite",
        height: "160px",
      }}
    />
  );
}
