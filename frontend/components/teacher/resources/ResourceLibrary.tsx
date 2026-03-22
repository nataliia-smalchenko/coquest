"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { FileText, HelpCircle, Loader2, Search } from "lucide-react";
import { useResourceStore } from "@/hooks/useResourceStore";
import { createResource } from "@/lib/api/resources";
import { FolderTree } from "./FolderTree";
import { TagFilter } from "./TagFilter";
import { ResourceList } from "./ResourceList";

export function ResourceLibrary() {
  const t = useTranslations("resources");
  const router = useRouter();
  const {
    fetchFolders,
    fetchTags,
    fetchResources,
    setSearchQuery,
    searchQuery,
    resources,
    selectedFolderId,
    selectedTagIds,
  } = useResourceStore();

  const [creating, setCreating] = useState<"text" | "question" | null>(null);

  useEffect(() => {
    fetchFolders();
    fetchTags();
    fetchResources();
  }, [fetchFolders, fetchTags, fetchResources]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchResources(), 300);
    },
    [setSearchQuery, fetchResources],
  );

  const handleNewResource = async (type: "text" | "question") => {
    if (creating) return;
    setCreating(type);
    try {
      const count = resources.filter((r) => r.type === type).length + 1;
      const title = type === "text" ? `${t("newText")} ${count}` : `${t("newQuestion")} ${count}`;
      const resource = await createResource({
        type,
        title,
        folder_id: selectedFolderId ?? null,
        tag_ids: selectedTagIds,
      });
      await fetchResources();
      router.push(`/teacher/resources/${resource.id}/edit?new=1`);
    } catch {
      setCreating(null);
    }
  };

  return (
    <div
      className="flex bg-gray-50"
      style={{ height: "calc(100vh - 4rem)", width: "100%" }}
    >
      {/* Sidebar */}
      <aside
        className="flex-none bg-white border-r border-gray-200 flex flex-col"
        style={{ width: "256px", minWidth: "256px", maxWidth: "256px" }}
      >
        <div
          style={{
            flex: "1 1 0",
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "16px 12px 12px",
            borderBottom: "1px solid #f3f4f6",
          }}
        >
          <FolderTree />
        </div>
        <div
          style={{
            flex: "1 1 0",
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "16px 12px 12px",
          }}
        >
          <TagFilter />
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div
          className="bg-white border-b border-gray-200 flex justify-between items-center shrink-0"
          style={{ padding: "20px 28px" }}
        >
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => handleNewResource("text")}
              disabled={!!creating}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                backgroundColor: "white",
                color: "#2563eb",
                border: "1.5px solid #2563eb",
                borderRadius: "10px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: creating ? "not-allowed" : "pointer",
                opacity: creating === "question" ? 0.5 : 1,
                transition: "background-color 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!creating) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#eff6ff";
              }}
              onMouseLeave={(e) => {
                if (!creating) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "white";
              }}
            >
              {creating === "text" ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
              {t("newText")}
            </button>
            <button
              onClick={() => handleNewResource("question")}
              disabled={!!creating}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                backgroundColor: "#2563eb",
                color: "white",
                border: "1.5px solid #2563eb",
                borderRadius: "10px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: creating ? "not-allowed" : "pointer",
                opacity: creating === "text" ? 0.5 : 1,
                transition: "background-color 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!creating) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1d4ed8";
              }}
              onMouseLeave={(e) => {
                if (!creating) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2563eb";
              }}
            >
              {creating === "question" ? <Loader2 size={15} className="animate-spin" /> : <HelpCircle size={15} />}
              {t("newQuestion")}
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: "1 1 0", minHeight: 0, overflowY: "auto", width: "100%", padding: "24px 28px" }}>
          {/* Search */}
          <div style={{ position: "relative", marginBottom: "20px" }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "#9ca3af",
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={t("search")}
              className="bg-white border border-gray-300 rounded-lg text-sm focus:border-blue-400 focus:outline-none transition-all"
              style={{ width: "100%", paddingLeft: "36px", paddingRight: "16px", paddingTop: "8px", paddingBottom: "8px" }}
            />
          </div>

          <ResourceList />
        </div>
      </div>
    </div>
  );
}
