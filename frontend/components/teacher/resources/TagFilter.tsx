"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X, Check } from "lucide-react";
import { useResourceStore } from "@/hooks/useResourceStore";

const PRESET_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#10b981",
  "#ef4444",
  "#f59e0b",
  "#f97316",
  "#ec4899",
  "#6b7280",
];

export function TagFilter() {
  const t = useTranslations("resources");

  const { tags, selectedTagIds, toggleSelectedTag, createTag, deleteTag } =
    useResourceStore();

  const [isAdding, setIsAdding] = useState(false);
  const [tagName, setTagName] = useState("");
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const handleCreateTag = async () => {
    const name = tagName.trim();
    if (!name) {
      setIsAdding(false);
      return;
    }

    setSaving(true);
    try {
      await createTag({ name, color: selectedColor });
      setTagName("");
    } catch {
      console.error("Failed to create tag");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTag = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteTag(id);
    } catch {
      console.error("Failed to delete tag");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCreateTag();
    if (e.key === "Escape") {
      setIsAdding(false);
      setTagName("");
    }
  };

  return (
    <div className="w-full">
      <div className="flex justify-between items-center">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          {t("tags.title")}
        </span>
        <button
          onClick={() => setIsAdding((v) => !v)}
          className="p-1 rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors focus:outline-none"
          title={t("tags.new")}
        >
          <Plus size={16} />
        </button>
      </div>

      {isAdding && (
        <div className="mt-4 p-3 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col gap-3">
          <input
            autoFocus
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("tags.name")}
            disabled={saving}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-400 outline-none transition-all"
          />

          <div className="flex gap-1.5 flex-wrap">
            {PRESET_COLORS.map((color) => {
              const isSelected = selectedColor === color;
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={`relative flex items-center justify-center rounded-full shrink-0 cursor-pointer transition-transform focus:outline-none ${
                    isSelected
                      ? "scale-110 ring-2 ring-offset-1 ring-gray-400"
                      : "hover:scale-110"
                  }`}
                  style={{
                    backgroundColor: color,
                    width: "22px",
                    height: "22px",
                    minWidth: "22px",
                  }}
                >
                  {isSelected && (
                    <Check
                      size={12}
                      strokeWidth={3}
                      className="text-white drop-shadow"
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex gap-2 items-center justify-between">
            <button
              onClick={handleCreateTag}
              disabled={saving || !tagName.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-1.5 text-xs font-semibold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "..." : t("tags.new")}
            </button>
            <button
              onClick={() => {
                setIsAdding(false);
                setTagName("");
              }}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div
        className="w-full min-w-0 mt-4"
        style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}
      >
        {tags.length === 0 && !isAdding && (
          <span className="text-sm text-gray-400 italic">
            {t("tags.empty")}
          </span>
        )}

        {tags.map((tag) => {
          const active = selectedTagIds.includes(tag.id);
          return (
            <div
              key={tag.id}
              className="group flex flex-row items-center rounded-full text-xs font-medium border transition-all duration-150 whitespace-nowrap shrink-0"
              style={{
                paddingLeft: "10px",
                paddingRight: "6px",
                paddingTop: "4px",
                paddingBottom: "4px",
                gap: "6px",
                ...(active
                  ? {
                      backgroundColor: tag.color,
                      borderColor: tag.color,
                      color: "white",
                    }
                  : {
                      backgroundColor: "white",
                      borderColor: "#d1d5db",
                      color: "#374151",
                    }),
              }}
            >
              <button
                type="button"
                onClick={() => toggleSelectedTag(tag.id)}
                className="flex flex-row items-center outline-none cursor-pointer"
                style={{ gap: "6px" }}
              >
                <span
                  className="rounded-full shrink-0 block"
                  style={{
                    backgroundColor: active
                      ? "rgba(255,255,255,0.5)"
                      : tag.color,
                    width: "10px",
                    height: "10px",
                    minWidth: "10px",
                  }}
                />
                {tag.name}
              </button>

              <button
                type="button"
                onClick={(e) => handleDeleteTag(e, tag.id)}
                title={t("tags.delete")}
                className="p-0.5 rounded-full outline-none cursor-pointer shrink-0 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                style={
                  active
                    ? { color: "rgba(255,255,255,0.8)" }
                    : { color: "#9ca3af" }
                }
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
