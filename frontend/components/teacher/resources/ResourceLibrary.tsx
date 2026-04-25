"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  FileText,
  Filter,
  FilterX,
  HelpCircle,
  Loader2,
  Search,
  X,
} from "lucide-react";
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
    clearFilters,
    searchQuery,
    resources,
    selectedFolderId,
    selectedTagIds,
  } = useResourceStore();

  const [creating, setCreating] = useState<"text" | "question" | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

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
      const title =
        type === "text"
          ? `${t("newText")} ${count}`
          : `${t("newQuestion")} ${count}`;
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

  const sidebarContent = (
    <>
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
    </>
  );

  return (
    <div
      className="resource-library"
      style={{
        height: "calc(100vh - 4rem)",
        width: "100%",
        display: "flex",
        background: "#f9fafb",
      }}
    >
      {/* Desktop sidebar */}
      <aside
        className="sidebar-desktop"
        style={{
          width: "256px",
          minWidth: "256px",
          maxWidth: "256px",
          background: "white",
          borderRight: "1px solid #e5e7eb",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {sidebarContent}
      </aside>

      {/* Mobile filter drawer overlay */}
      {filterOpen && (
        <>
          <div
            onClick={() => setFilterOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.35)",
              zIndex: 99,
              animation: "fadeIn 0.2s ease",
            }}
          />
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              bottom: 0,
              width: "280px",
              backgroundColor: "white",
              zIndex: 100,
              display: "flex",
              flexDirection: "column",
              boxShadow: "4px 0 24px rgba(0,0,0,0.12)",
              animation: "slideInLeft 0.25s ease",
            }}
          >
            <div
              style={{
                height: "56px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 16px",
                borderBottom: "1px solid #f3f4f6",
                flexShrink: 0,
              }}
            >
              <span
                style={{ fontSize: "15px", fontWeight: 700, color: "#111827" }}
              >
                {t("filters")}
              </span>
              <button
                onClick={() => setFilterOpen(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "36px",
                  height: "36px",
                  borderRadius: "8px",
                  border: "1.5px solid #e5e7eb",
                  background: "white",
                  cursor: "pointer",
                  color: "#374151",
                }}
              >
                <X size={18} />
              </button>
            </div>
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              {sidebarContent}
            </div>
          </div>
        </>
      )}

      {/* Main */}
      <div
        style={{
          flex: "1 1 0",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          className="library-header"
          style={{
            background: "white",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
            padding: "16px 20px",
            gap: "12px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              minWidth: 0,
            }}
          >
            {/* Mobile filter button */}
            <button
              className="filter-btn-mobile"
              onClick={() => setFilterOpen(true)}
              style={{
                display: "none",
                alignItems: "center",
                justifyContent: "center",
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                border: "1.5px solid #e5e7eb",
                background: "white",
                cursor: "pointer",
                color: "#374151",
                flexShrink: 0,
                position: "relative",
              }}
            >
              <Filter size={16} />
              {(selectedFolderId !== null || selectedTagIds.length > 0) && (
                <span
                  style={{
                    position: "absolute",
                    top: "4px",
                    right: "4px",
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    backgroundColor: "#2563eb",
                  }}
                />
              )}
            </button>

            <h1
              className="library-title"
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "#111827",
                margin: 0,
                whiteSpace: "nowrap",
              }}
            >
              {t("title")}
            </h1>

            {(selectedFolderId !== null || selectedTagIds.length > 0) && (
              <button
                onClick={clearFilters}
                title={t("clearFilters")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "4px 10px",
                  backgroundColor: "#fef2f2",
                  color: "#ef4444",
                  border: "1.5px solid #fca5a5",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "background-color 0.15s",
                }}
                onMouseEnter={(e) =>
                  ((
                    e.currentTarget as HTMLButtonElement
                  ).style.backgroundColor = "#fee2e2")
                }
                onMouseLeave={(e) =>
                  ((
                    e.currentTarget as HTMLButtonElement
                  ).style.backgroundColor = "#fef2f2")
                }
              >
                <FilterX size={13} />
                <span className="btn-label">{t("clearFilters")}</span>
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            <button
              onClick={() => handleNewResource("text")}
              disabled={!!creating}
              className="new-resource-btn"
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
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                if (!creating)
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    "#eff6ff";
              }}
              onMouseLeave={(e) => {
                if (!creating)
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    "white";
              }}
            >
              {creating === "text" ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <FileText size={15} />
              )}
              <span className="btn-label">{t("newText")}</span>
            </button>
            <button
              onClick={() => handleNewResource("question")}
              disabled={!!creating}
              className="new-resource-btn"
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
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                if (!creating)
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    "#1d4ed8";
              }}
              onMouseLeave={(e) => {
                if (!creating)
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    "#2563eb";
              }}
            >
              {creating === "question" ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <HelpCircle size={15} />
              )}
              <span className="btn-label">{t("newQuestion")}</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div
          style={{
            flex: "1 1 0",
            minHeight: 0,
            overflowY: "auto",
            width: "100%",
            padding: "20px",
          }}
        >
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
              style={{
                width: "100%",
                paddingLeft: "36px",
                paddingRight: "16px",
                paddingTop: "8px",
                paddingBottom: "8px",
                background: "white",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#d1d5db")}
            />
          </div>

          <ResourceList />
        </div>
      </div>

      {/* Full-screen loading overlay while creating a resource */}
      {creating && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(255,255,255,0.7)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
              background: "white",
              borderRadius: "16px",
              padding: "32px 40px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            }}
          >
            <Loader2 size={32} color="#2563eb" className="animate-spin" />
            <span
              style={{ fontSize: "14px", fontWeight: 500, color: "#374151" }}
            >
              {creating === "text" ? t("newText") : t("newQuestion")}…
            </span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideInLeft {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        @media (max-width: 768px) {
          .sidebar-desktop { display: none !important; }
          .filter-btn-mobile { display: flex !important; }
          .btn-label { display: none; }
          .new-resource-btn { padding: 8px !important; }
          .library-header { padding: 12px 16px !important; }
        }
      `}</style>
    </div>
  );
}
