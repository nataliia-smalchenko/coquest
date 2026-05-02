"use client";

import { closestCenter, DndContext, type DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronUp,
  ExternalLink,
  FileText,
  GripVertical,
  HelpCircle,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ResourceContentPreview } from "@/components/teacher/resource-sets/ResourceContentPreview";
import { ResourcePickerModal } from "@/components/teacher/resource-sets/ResourcePickerModal";
import { getFolders, getResource, getResources } from "@/lib/api/resources";
import type {
  FolderResponse,
  ResourceDetailResponse,
  ResourceResponse,
} from "@/types/resource";
import type { ResourceSetResourceItem } from "@/types/resource-set";

interface Props {
  resources: ResourceSetResourceItem[];
  onResourcesChange: (resources: ResourceSetResourceItem[]) => void;
  locale: string;
}

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string }> = {
  beginner: { bg: "#dcfce7", text: "#16a34a" },
  intermediate: { bg: "#dbeafe", text: "#2563eb" },
  sufficient: { bg: "#fef9c3", text: "#ca8a04" },
  advanced: { bg: "#fee2e2", text: "#dc2626" },
};

function SortableResourceRow({
  item,
  resource,
  folders,
  locale,
  expanded,
  detail,
  loadingDetail,
  onToggle,
  onRemove,
}: {
  item: ResourceSetResourceItem;
  resource?: ResourceResponse;
  folders: FolderResponse[];
  locale: string;
  expanded: boolean;
  detail: ResourceDetailResponse | null;
  loadingDetail: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.resource_id });
  const tRes = useTranslations("resources");
  const tCommon = useTranslations("common");

  const wrapperStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.9 : 1,
    boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.12)" : "none",
    zIndex: isDragging ? 10 : "auto",
    position: "relative",
    background: "white",
    border: `1px solid ${expanded ? "#d1d5db" : "#e5e7eb"}`,
    borderRadius: "10px",
    overflow: "hidden",
  };

  const isText = resource?.type === "text";
  const folderName = resource?.folder_id
    ? folders.find((f) => f.id === resource.folder_id)?.name
    : null;
  const hasMeta =
    folderName ||
    (resource?.tags.length ?? 0) > 0 ||
    resource?.difficulty ||
    resource?.type === "question";

  return (
    <div ref={setNodeRef} style={wrapperStyle}>
      {/* Main row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "10px 12px",
        }}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          style={{
            cursor: "grab",
            padding: "2px",
            border: "none",
            background: "none",
            color: "#9ca3af",
            display: "flex",
            touchAction: "none",
            flexShrink: 0,
          }}
        >
          <GripVertical size={16} />
        </button>

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

        {/* Title + badges */}
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
            {resource?.title ?? `${item.resource_id.slice(0, 8)}...`}
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
              {resource?.tags.map((tag) => (
                <span
                  key={tag.id}
                  title={tag.name}
                  style={{
                    display: "inline-block",
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    backgroundColor: tag.color,
                    flexShrink: 0,
                  }}
                />
              ))}
              {resource?.difficulty && (
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    padding: "1px 5px",
                    borderRadius: "4px",
                    backgroundColor:
                      DIFFICULTY_COLORS[resource.difficulty]?.bg ?? "#f3f4f6",
                    color:
                      DIFFICULTY_COLORS[resource.difficulty]?.text ?? "#6b7280",
                  }}
                >
                  {tRes(`question.difficulties.${resource.difficulty}`)}
                </span>
              )}
              {resource?.type === "question" &&
                detail?.question?.points != null && (
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      padding: "1px 6px",
                      borderRadius: "4px",
                      backgroundColor: "#f5f3ff",
                      color: "#7c3aed",
                    }}
                  >
                    {detail.question.points} {tRes("question.pointsUnit")}
                  </span>
                )}
            </div>
          )}
        </div>

        {/* Edit (open in new tab) */}
        <a
          href={`/${locale}/teacher/resources/${item.resource_id}/edit`}
          target="_blank"
          rel="noopener noreferrer"
          title={tCommon("edit")}
          style={{
            border: "none",
            background: "none",
            cursor: "pointer",
            color: "#9ca3af",
            display: "flex",
            padding: "4px",
            textDecoration: "none",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = "#2563eb";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = "#9ca3af";
          }}
        >
          <ExternalLink size={13} />
        </a>

        {/* Expand toggle */}
        <button
          type="button"
          onClick={onToggle}
          style={{
            border: "none",
            background: "none",
            cursor: "pointer",
            color: "#9ca3af",
            display: "flex",
            padding: "4px",
            flexShrink: 0,
          }}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={onRemove}
          style={{
            border: "none",
            background: "none",
            cursor: "pointer",
            color: "#9ca3af",
            display: "flex",
            padding: "4px",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#ef4444";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#9ca3af";
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Expanded preview */}
      {expanded && (
        <div
          style={{
            borderTop: "1px solid #f3f4f6",
            padding: "12px 16px 16px 16px",
          }}
        >
          {loadingDetail ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                color: "#9ca3af",
                fontSize: "12px",
              }}
            >
              <Loader2 size={12} className="animate-spin" />
              {tCommon("loading")}
            </div>
          ) : detail ? (
            <ResourceContentPreview detail={detail} />
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function ResourcesStep({
  resources,
  onResourcesChange,
  locale,
}: Props) {
  const t = useTranslations("resourceSets.resources");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [resourceCache, setResourceCache] = useState<
    Record<string, ResourceResponse>
  >({});
  const [folders, setFolders] = useState<FolderResponse[]>([]);

  // Lifted expand state
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [detailCache, setDetailCache] = useState<
    Record<string, ResourceDetailResponse>
  >({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  const allExpanded =
    resources.length > 0 &&
    resources.every((r) => expandedIds.has(r.resource_id));

  useEffect(() => {
    Promise.all([getResources(), getFolders()]).then(
      ([resList, folderList]) => {
        const cache: Record<string, ResourceResponse> = {};
        resList.forEach((r) => {
          cache[r.id] = r;
        });
        setResourceCache(cache);
        setFolders(folderList);
      },
    );
  }, []);

  const fetchDetail = async (id: string) => {
    if (detailCache[id] || loadingIds.has(id)) return;
    setLoadingIds((prev) => new Set(prev).add(id));
    try {
      const d = await getResource(id);
      setDetailCache((prev) => ({ ...prev, [id]: d }));
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // Pre-fetch details for question-type resources so points are visible without expanding
  // biome-ignore lint/correctness/useExhaustiveDependencies: fetchDetail changes on every render, intentionally omitted
  useEffect(() => {
    for (const item of resources) {
      const res = resourceCache[item.resource_id];
      if (res?.type === "question") {
        fetchDetail(item.resource_id);
      }
    }
  }, [resources, resourceCache]);

  const handleToggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        fetchDetail(id);
      }
      return next;
    });
  };

  const handleToggleAll = () => {
    if (allExpanded) {
      setExpandedIds(new Set());
    } else {
      const ids = resources.map((r) => r.resource_id);
      setExpandedIds(new Set(ids));
      ids.forEach(fetchDetail);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = resources.findIndex((r) => r.resource_id === active.id);
    const newIndex = resources.findIndex((r) => r.resource_id === over.id);
    const reordered = arrayMove(resources, oldIndex, newIndex).map((r, i) => ({
      ...r,
      order_index: i,
    }));
    onResourcesChange(reordered);
  };

  const handleAddResources = (items: ResourceSetResourceItem[]) => {
    const newResources = [
      ...resources,
      ...items.filter(
        (item) => !resources.find((r) => r.resource_id === item.resource_id),
      ),
    ].map((r, i) => ({ ...r, order_index: i }));
    onResourcesChange(newResources);
    Promise.all([getResources(), getFolders()]).then(
      ([resList, folderList]) => {
        const cache: Record<string, ResourceResponse> = {};
        resList.forEach((r) => {
          cache[r.id] = r;
        });
        setResourceCache(cache);
        setFolders(folderList);
      },
    );
  };

  const removeResource = (resourceId: string) => {
    onResourcesChange(
      resources
        .filter((r) => r.resource_id !== resourceId)
        .map((r, i) => ({ ...r, order_index: i })),
    );
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(resourceId);
      return next;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Resources */}
      <div
        style={{
          background: "white",
          borderRadius: "16px",
          border: "1px solid #e5e7eb",
          padding: "20px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px",
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: "15px",
                fontWeight: 700,
                color: "#111827",
              }}
            >
              {t("title")}
            </h3>
            {resources.length > 0 && (
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: "12px",
                  color: "#9ca3af",
                }}
              >
                {t("resourceCount", { count: resources.length })}
              </p>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {resources.length > 0 && (
              <button
                type="button"
                onClick={handleToggleAll}
                title={allExpanded ? t("collapseAll") : t("expandAll")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "7px 12px",
                  backgroundColor: "white",
                  color: "#6b7280",
                  border: "1.5px solid #e5e7eb",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.borderColor = "#d1d5db";
                  b.style.color = "#374151";
                }}
                onMouseLeave={(e) => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.borderColor = "#e5e7eb";
                  b.style.color = "#6b7280";
                }}
              >
                {allExpanded ? (
                  <ChevronsDownUp size={14} />
                ) : (
                  <ChevronsUpDown size={14} />
                )}
                {allExpanded ? t("collapseAll") : t("expandAll")}
              </button>
            )}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 14px",
                backgroundColor: "white",
                color: "#2563eb",
                border: "1.5px solid #2563eb",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  "#eff6ff";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  "white";
              }}
            >
              <Plus size={14} /> {t("addResources")}
            </button>
          </div>
        </div>

        {resources.length === 0 ? (
          <div
            style={{
              padding: "32px 16px",
              textAlign: "center",
              color: "#9ca3af",
              fontSize: "14px",
              border: "1.5px dashed #e5e7eb",
              borderRadius: "10px",
            }}
          >
            {t("noResources")}
          </div>
        ) : (
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={resources.map((r) => r.resource_id)}
              strategy={verticalListSortingStrategy}
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                {resources.map((item) => (
                  <SortableResourceRow
                    key={item.resource_id}
                    item={item}
                    resource={resourceCache[item.resource_id]}
                    folders={folders}
                    locale={locale}
                    expanded={expandedIds.has(item.resource_id)}
                    detail={detailCache[item.resource_id] ?? null}
                    loadingDetail={loadingIds.has(item.resource_id)}
                    onToggle={() => handleToggleExpand(item.resource_id)}
                    onRemove={() => removeResource(item.resource_id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <ResourcePickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        existingResourceIds={resources.map((r) => r.resource_id)}
        onAdd={handleAddResources}
      />
    </div>
  );
}
