"use client";

import { useTranslations } from "next-intl";
import { BookOpen } from "lucide-react";
import { useResourceStore } from "@/hooks/useResourceStore";
import { ResourceCard, ResourceCardSkeleton } from "./ResourceCard";

export function ResourceList() {
  const t = useTranslations("resources");
  const { resources, isLoading, selectedFolderId } = useResourceStore();

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
    <div style={gridStyle}>
      {resources.map((resource) => (
        <ResourceCard key={resource.id} resource={resource} />
      ))}
    </div>
  );
}
