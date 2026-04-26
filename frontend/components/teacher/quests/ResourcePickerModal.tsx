"use client";

import {
  ChevronDown,
  FileText,
  HelpCircle,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { getFolders, getResources, getTags } from "@/lib/api/resources";
import type { QuestResourceItem } from "@/types/quest";
import type {
  FolderResponse,
  ResourceResponse,
  TagResponse,
} from "@/types/resource";

const LIMIT = 20;

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string }> = {
  advanced: { bg: "#fee2e2", text: "#dc2626" },
  sufficient: { bg: "#fef9c3", text: "#ca8a04" },
  intermediate: { bg: "#dbeafe", text: "#2563eb" },
  beginner: { bg: "#dcfce7", text: "#16a34a" },
};

const DIFFICULTIES = [
  "beginner",
  "intermediate",
  "sufficient",
  "advanced",
] as const;

interface ResourcePickerModalProps {
  open: boolean;
  onClose: () => void;
  existingResourceIds: string[];
  onAdd: (items: QuestResourceItem[]) => void;
}

export function ResourcePickerModal({
  open,
  onClose,
  existingResourceIds,
  onAdd,
}: ResourcePickerModalProps) {
  const t = useTranslations("quests.map");
  const tRes = useTranslations("resources");
  const tCommon = useTranslations("common");

  const [resources, setResources] = useState<ResourceResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "text" | "question">("");
  const [folderFilter, setFolderFilter] = useState<string>("");
  const [tagFilters, setTagFilters] = useState<Set<string>>(new Set());
  const [difficultyFilter, setDifficultyFilter] = useState<string>("");

  const [folders, setFolders] = useState<FolderResponse[]>([]);
  const [allTags, setAllTags] = useState<TagResponse[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Refs for use inside fetchPage (avoids stale closures)
  const searchRef = useRef(search);
  const typeRef = useRef(typeFilter);
  const folderRef = useRef(folderFilter);
  const tagFiltersRef = useRef(tagFilters);
  const difficultyRef = useRef(difficultyFilter);
  searchRef.current = search;
  typeRef.current = typeFilter;
  folderRef.current = folderFilter;
  tagFiltersRef.current = tagFilters;
  difficultyRef.current = difficultyFilter;

  const buildParams = (currentOffset: number) => ({
    search: searchRef.current || undefined,
    type: (typeRef.current as "text" | "question") || undefined,
    folder_id: folderRef.current || undefined,
    tag_ids:
      tagFiltersRef.current.size > 0
        ? Array.from(tagFiltersRef.current)
        : undefined,
    difficulty: difficultyRef.current || undefined,
    limit: LIMIT,
    offset: currentOffset,
  });

  const fetchPage = useCallback(
    async (reset: boolean) => {
      const currentOffset = reset ? 0 : offset;
      if (reset) setLoading(true);
      else setLoadingMore(true);

      try {
        const page = await getResources(buildParams(currentOffset));
        if (reset) {
          setResources(page);
          setOffset(LIMIT);
        } else {
          setResources((prev) => [...prev, ...page]);
          setOffset((prev) => prev + LIMIT);
        }
        setHasMore(page.length === LIMIT);
      } finally {
        if (reset) setLoading(false);
        else setLoadingMore(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // biome-ignore lint/correctness/useExhaustiveDependencies: buildParams is a stable helper, intentionally omitted
    [offset, buildParams],
  );

  // Reset & load when modal opens
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setTypeFilter("");
    setFolderFilter("");
    setTagFilters(new Set());
    setDifficultyFilter("");
    setSelected(new Set());
    setOffset(0);
    setResources([]);
    setHasMore(false);
    setLoading(true);

    Promise.all([
      getResources({ limit: LIMIT, offset: 0 }),
      getFolders(),
      getTags(),
    ]).then(([page, foldersData, tagsData]) => {
      setResources(page);
      setOffset(LIMIT);
      setHasMore(page.length === LIMIT);
      setFolders(foldersData);
      setAllTags(tagsData);
      setLoading(false);
    });
  }, [open]);

  // Debounced refetch when filters change (skip initial mount)
  const didMount = useRef(false);
  useEffect(() => {
    if (!open) return;
    if (!didMount.current) {
      didMount.current = true;
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setOffset(0);
      try {
        const page = await getResources({
          search: search || undefined,
          type: (typeFilter as "text" | "question") || undefined,
          folder_id: folderFilter || undefined,
          tag_ids: tagFilters.size > 0 ? Array.from(tagFilters) : undefined,
          difficulty: difficultyFilter || undefined,
          limit: LIMIT,
          offset: 0,
        });
        setResources(page);
        setOffset(LIMIT);
        setHasMore(page.length === LIMIT);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search, typeFilter, folderFilter, tagFilters, difficultyFilter, open]);

  // Reset mount flag when modal closes
  useEffect(() => {
    if (!open) didMount.current = false;
  }, [open]);

  if (!open) return null;

  const toggle = (id: string) => {
    if (existingResourceIds.includes(id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTag = (id: string) => {
    setTagFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = () => {
    const items: QuestResourceItem[] = Array.from(selected).map((id, i) => ({
      resource_id: id,
      order_index: existingResourceIds.length + i,
    }));
    onAdd(items);
    onClose();
  };

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop overlay dismisses modal on click */}
      <div
        role="presentation"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
          zIndex: 40,
        }}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(480px, 100vw)",
          background: "white",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-4px 0 32px rgba(0,0,0,0.12)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 20px 16px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: "16px",
              fontWeight: 700,
              color: "#111827",
            }}
          >
            {t("addResources")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "none",
              cursor: "pointer",
              color: "#9ca3af",
              padding: "4px",
              display: "flex",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Filters */}
        <div
          style={{
            padding: "12px 20px",
            borderBottom: "1px solid #f3f4f6",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {/* Search */}
          <div style={{ position: "relative" }}>
            <Search
              size={14}
              style={{
                position: "absolute",
                left: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "#9ca3af",
                pointerEvents: "none",
              }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search")}
              style={{
                width: "100%",
                border: "1.5px solid #e5e7eb",
                borderRadius: "8px",
                padding: "8px 12px 8px 32px",
                fontSize: "13px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Type chips */}
          <div style={{ display: "flex", gap: "6px" }}>
            {(["", "text", "question"] as const).map((type) => (
              <button
                type="button"
                key={type}
                onClick={() => setTypeFilter(type)}
                style={{
                  padding: "4px 12px",
                  borderRadius: "20px",
                  border: "1.5px solid",
                  fontSize: "12px",
                  fontWeight: 500,
                  cursor: "pointer",
                  borderColor: typeFilter === type ? "#2563eb" : "#e5e7eb",
                  backgroundColor: typeFilter === type ? "#eff6ff" : "white",
                  color: typeFilter === type ? "#2563eb" : "#6b7280",
                }}
              >
                {type === "" ? tRes("filters") : tRes(`type.${type}`)}
              </button>
            ))}
          </div>

          {/* Folder select */}
          {folders.length > 0 && (
            <div style={{ position: "relative" }}>
              <select
                value={folderFilter}
                onChange={(e) => setFolderFilter(e.target.value)}
                style={{
                  width: "100%",
                  border: "1.5px solid",
                  borderColor: folderFilter ? "#2563eb" : "#e5e7eb",
                  borderRadius: "8px",
                  padding: "7px 32px 7px 12px",
                  fontSize: "13px",
                  outline: "none",
                  background: folderFilter ? "#eff6ff" : "white",
                  color: folderFilter ? "#2563eb" : "#6b7280",
                  cursor: "pointer",
                  boxSizing: "border-box",
                  appearance: "none",
                  fontWeight: 500,
                }}
              >
                <option value="">{t("allFolders")}</option>
                {folders.map((f) => (
                  <option
                    key={f.id}
                    value={f.id}
                    style={{
                      color: "#111827",
                      background: "white",
                      fontWeight: 400,
                    }}
                  >
                    {f.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: folderFilter ? "#2563eb" : "#9ca3af",
                  pointerEvents: "none",
                }}
              />
            </div>
          )}

          {/* Tag chips */}
          {allTags.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: "6px",
                overflowX: "auto",
                paddingBottom: "6px",
                marginBottom: "-2px",
                scrollbarWidth: "thin",
                scrollbarColor: "#d1d5db transparent",
              }}
            >
              {allTags.map((tag) => {
                const active = tagFilters.has(tag.id);
                return (
                  <button
                    type="button"
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    style={{
                      padding: "3px 10px",
                      borderRadius: "20px",
                      border: "1.5px solid",
                      fontSize: "12px",
                      fontWeight: 500,
                      cursor: "pointer",
                      flexShrink: 0,
                      borderColor: active ? tag.color : "#e5e7eb",
                      backgroundColor: active ? `${tag.color}22` : "white",
                      color: active ? tag.color : "#6b7280",
                    }}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Difficulty chips (only for questions or all) */}
          {typeFilter !== "text" && (
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {DIFFICULTIES.map((d) => {
                const active = difficultyFilter === d;
                const colors = DIFFICULTY_COLORS[d];
                return (
                  <button
                    type="button"
                    key={d}
                    onClick={() => setDifficultyFilter(active ? "" : d)}
                    style={{
                      padding: "3px 10px",
                      borderRadius: "20px",
                      border: "1.5px solid",
                      fontSize: "12px",
                      fontWeight: 500,
                      cursor: "pointer",
                      borderColor: active ? colors.text : "#e5e7eb",
                      backgroundColor: active ? colors.bg : "white",
                      color: active ? colors.text : "#6b7280",
                    }}
                  >
                    {tRes(`question.difficulties.${d}`)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
          {loading ? (
            Array.from({ length: 5 }, (_, i) => i).map((i) => (
              <div
                key={i}
                style={{
                  height: "52px",
                  borderRadius: "8px",
                  background: "#f3f4f6",
                  marginBottom: "6px",
                }}
              />
            ))
          ) : resources.length === 0 ? (
            <div
              style={{
                padding: "48px 16px",
                textAlign: "center",
                color: "#9ca3af",
                fontSize: "14px",
              }}
            >
              {tRes("empty")}
            </div>
          ) : (
            <>
              {resources.map((r) => {
                const isAdded = existingResourceIds.includes(r.id);
                const isSel = selected.has(r.id);
                const isText = r.type === "text";
                const folderName = r.folder_id
                  ? folders.find((f) => f.id === r.folder_id)?.name
                  : null;
                const hasMeta = folderName || r.tags.length > 0 || r.difficulty;
                return (
                  // biome-ignore lint/a11y/useSemanticElements: resource row needs div for complex layout with children
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={isAdded ? -1 : 0}
                    onClick={() => toggle(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") toggle(r.id);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "8px 8px",
                      borderRadius: "8px",
                      cursor: isAdded ? "default" : "pointer",
                      opacity: isAdded ? 0.5 : 1,
                      backgroundColor: isSel ? "#eff6ff" : "transparent",
                      transition: "background-color 0.1s",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isAdded || isSel}
                      disabled={isAdded}
                      onChange={() => toggle(r.id)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: "15px",
                        height: "15px",
                        flexShrink: 0,
                        accentColor: "#2563eb",
                      }}
                    />
                    <div
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "7px",
                        backgroundColor: isText ? "#eff6ff" : "#f5f3ff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {isText ? (
                        <FileText size={13} color="#2563eb" />
                      ) : (
                        <HelpCircle size={13} color="#7c3aed" />
                      )}
                    </div>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "13px",
                          fontWeight: 500,
                          color: "#111827",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.title}
                      </p>
                      {hasMeta && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                            marginTop: "2px",
                            flexWrap: "wrap",
                          }}
                        >
                          {folderName && (
                            <span
                              style={{
                                fontSize: "11px",
                                color: "#9ca3af",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: "120px",
                              }}
                            >
                              {folderName}
                            </span>
                          )}
                          {r.tags.map((tag) => (
                            <span
                              key={tag.id}
                              title={tag.name}
                              style={{
                                display: "inline-block",
                                width: "8px",
                                height: "8px",
                                borderRadius: "50%",
                                backgroundColor: tag.color,
                                flexShrink: 0,
                              }}
                            />
                          ))}
                          {r.difficulty && (
                            <span
                              style={{
                                fontSize: "10px",
                                fontWeight: 600,
                                padding: "1px 5px",
                                borderRadius: "4px",
                                backgroundColor:
                                  DIFFICULTY_COLORS[r.difficulty]?.bg ??
                                  "#f3f4f6",
                                color:
                                  DIFFICULTY_COLORS[r.difficulty]?.text ??
                                  "#6b7280",
                              }}
                            >
                              {tRes(`question.difficulties.${r.difficulty}`)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Load more */}
              {hasMore && (
                <div style={{ padding: "10px 8px" }}>
                  <button
                    type="button"
                    onClick={() => fetchPage(false)}
                    disabled={loadingMore}
                    style={{
                      width: "100%",
                      padding: "8px",
                      border: "1.5px solid #e5e7eb",
                      borderRadius: "8px",
                      background: "white",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "#6b7280",
                      cursor: loadingMore ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                  >
                    {loadingMore && (
                      <Loader2 size={12} className="animate-spin" />
                    )}
                    {loadingMore ? tCommon("loading") : tCommon("loadMore")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 20px", borderTop: "1px solid #e5e7eb" }}>
          <button
            type="button"
            onClick={handleAdd}
            disabled={selected.size === 0}
            style={{
              width: "100%",
              padding: "11px",
              backgroundColor: selected.size === 0 ? "#93c5fd" : "#2563eb",
              color: "white",
              border: "none",
              borderRadius: "10px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: selected.size === 0 ? "not-allowed" : "pointer",
            }}
          >
            {t("done")} ({selected.size})
          </button>
        </div>
      </div>
    </>
  );
}
