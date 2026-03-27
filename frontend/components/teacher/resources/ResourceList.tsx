"use client";

import { useTranslations } from "next-intl";
import { BookOpen, Loader2 } from "lucide-react";
import { useResourceStore } from "@/hooks/useResourceStore";
import { ResourceCard, ResourceCardSkeleton } from "./ResourceCard";

export function ResourceList() {
  const t = useTranslations("resources");
  const tCommon = useTranslations("common");
  const {
    resources,
    isLoading,
    hasMore,
    isLoadingMore,
    loadMoreResources,
    selectedFolderId,
  } = useResourceStore();

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: "16px",
    width: "100%",
  };

  if (isLoading) {
    return (
      <div style={gridStyle}>
        {Array.from({ length: 6 }).map((_, i) => (
          <ResourceCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (resources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <BookOpen size={48} className="text-gray-300 mb-4" strokeWidth={1.5} />
        <p className="text-sm text-gray-500">
          {selectedFolderId ? t("emptyFolder") : t("empty")}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={gridStyle}>
        {resources.map((resource) => (
          <ResourceCard key={resource.id} resource={resource} />
        ))}
      </div>

      {hasMore && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            onClick={loadMoreResources}
            disabled={isLoadingMore}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "9px 24px",
              border: "1.5px solid #e5e7eb",
              borderRadius: "10px",
              background: "white",
              fontSize: "13px",
              fontWeight: 500,
              color: "#374151",
              cursor: isLoadingMore ? "not-allowed" : "pointer",
              opacity: isLoadingMore ? 0.7 : 1,
              transition: "background 0.12s",
            }}
            onMouseEnter={(e) => {
              if (!isLoadingMore)
                (e.currentTarget as HTMLButtonElement).style.background =
                  "#f9fafb";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "white";
            }}
          >
            {isLoadingMore && <Loader2 size={14} className="animate-spin" />}
            {isLoadingMore ? tCommon("loading") : tCommon("loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}
