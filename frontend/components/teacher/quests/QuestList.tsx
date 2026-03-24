"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { BookOpen, Calendar, Compass, Map, Pencil, Trash2, Globe } from "lucide-react";
import { getQuests, deleteQuest, publishQuest, archiveQuest } from "@/lib/api/quests";
import type { QuestListItem, QuestStatus } from "@/types/quest";

// Status badge colors
const STATUS_STYLE: Record<QuestStatus, { bg: string; color: string }> = {
  draft:     { bg: "#f3f4f6", color: "#4b5563" },
  published: { bg: "#f0fdf4", color: "#15803d" },
  archived:  { bg: "#fff7ed", color: "#c2410c" },
};

export function QuestList() {
  const t = useTranslations("quests");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [quests, setQuests] = useState<QuestListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    getQuests().then(setQuests).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm(t("delete"))) return;
    await deleteQuest(id);
    load();
  };

  const handleToggleStatus = async (e: React.MouseEvent, quest: QuestListItem) => {
    e.stopPropagation();
    if (quest.status === "published") {
      await archiveQuest(quest.id);
    } else {
      await publishQuest(quest.id);
    }
    load();
  };

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "16px",
  };

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "32px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: "#111827" }}>{t("title")}</h1>
        <button
          onClick={() => router.push("/teacher/quests/new")}
          style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "9px 18px", backgroundColor: "#2563eb", color: "white",
            border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: 600,
            cursor: "pointer",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1d4ed8")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2563eb")}
        >
          + {t("new")}
        </button>
      </div>

      {loading ? (
        <div style={gridStyle}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ height: "180px", borderRadius: "16px", background: "linear-gradient(90deg,#f3f4f6 25%,#e9eaec 50%,#f3f4f6 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }} />
          ))}
        </div>
      ) : quests.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: "12px" }}>
          <Compass size={48} strokeWidth={1.5} style={{ color: "#d1d5db" }} />
          <p style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "#374151" }}>{t("empty")}</p>
          <p style={{ margin: 0, fontSize: "14px", color: "#9ca3af" }}>{t("emptyHint")}</p>
        </div>
      ) : (
        <div style={gridStyle}>
          {quests.map((q) => {
            const badge = STATUS_STYLE[q.status];
            const formattedDate = new Date(q.created_at).toLocaleDateString(locale, { day: "numeric", month: "short" });
            return (
              <div
                key={q.id}
                onClick={() => router.push(`/teacher/quests/${q.id}`)}
                style={{ background: "white", borderRadius: "16px", border: "1px solid #e5e7eb", padding: "16px", cursor: "pointer", display: "flex", flexDirection: "column", gap: "10px", transition: "box-shadow 0.15s, border-color 0.15s", position: "relative" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)";
                  (e.currentTarget as HTMLDivElement).style.borderColor = "#d1d5db";
                  const a = e.currentTarget.querySelector("[data-actions]") as HTMLElement | null;
                  if (a) a.style.opacity = "1";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                  (e.currentTarget as HTMLDivElement).style.borderColor = "#e5e7eb";
                  const a = e.currentTarget.querySelector("[data-actions]") as HTMLElement | null;
                  if (a) a.style.opacity = "0";
                }}
              >
                {/* Status badge */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <span style={{ fontSize: "11px", fontWeight: 600, borderRadius: "20px", padding: "3px 10px", backgroundColor: badge.bg, color: badge.color }}>
                    {t(`status.${q.status}`)}
                  </span>
                </div>

                {/* Title */}
                <p style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#111827", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {q.title}
                </p>

                {/* Meta */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "#9ca3af" }}>
                    <BookOpen size={13} /> {q.resources_count}
                  </span>
                  {q.map_name && (
                    <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "#9ca3af" }}>
                      <Map size={13} /> {q.map_name}
                    </span>
                  )}
                  <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "#9ca3af" }}>
                    <Calendar size={13} /> {formattedDate}
                  </span>
                </div>

                {/* Actions */}
                <div data-actions style={{ display: "flex", gap: "4px", opacity: 0, transition: "opacity 0.15s", position: "absolute", bottom: "12px", right: "12px" }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); router.push(`/teacher/quests/${q.id}/edit`); }}
                    title={tCommon("edit")}
                    style={{ padding: "6px", borderRadius: "8px", border: "none", background: "transparent", cursor: "pointer", color: "#9ca3af", display: "flex", alignItems: "center" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#eff6ff"; (e.currentTarget as HTMLButtonElement).style.color = "#2563eb"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#9ca3af"; }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={(e) => handleToggleStatus(e, q)}
                    title={q.status === "published" ? "Archive" : "Publish"}
                    style={{ padding: "6px", borderRadius: "8px", border: "none", background: "transparent", cursor: "pointer", color: "#9ca3af", display: "flex", alignItems: "center" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#f0fdf4"; (e.currentTarget as HTMLButtonElement).style.color = "#16a34a"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#9ca3af"; }}
                  >
                    <Globe size={14} />
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, q.id)}
                    title={tCommon("delete")}
                    style={{ padding: "6px", borderRadius: "8px", border: "none", background: "transparent", cursor: "pointer", color: "#9ca3af", display: "flex", alignItems: "center" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#fef2f2"; (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#9ca3af"; }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
