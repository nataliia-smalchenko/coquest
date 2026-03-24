"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FileText, GripVertical, HelpCircle, Plus, Trash2 } from "lucide-react";
import { getMaps, getMap } from "@/lib/api/maps";
import { getResources } from "@/lib/api/resources";
import { ResourcePickerModal } from "@/components/teacher/quests/ResourcePickerModal";
import MapPreview from "@/components/teacher/quests/MapPreview";
import type { MapListItem, MapResponse } from "@/types/map";
import type { QuestResourceItem } from "@/types/quest";
import type { ResourceResponse } from "@/types/resource";

interface Props {
  mapId: string | undefined;
  resources: QuestResourceItem[];
  onMapChange: (mapId: string) => void;
  onResourcesChange: (resources: QuestResourceItem[]) => void;
  onInteractiveCountChange?: (count: number) => void;
  locale: string;
}

// Sortable resource row component
function SortableResourceRow({
  item, resource, onRemove
}: {
  item: QuestResourceItem;
  resource?: ResourceResponse;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.resource_id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.9 : 1,
    boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.12)" : "none",
    zIndex: isDragging ? 10 : "auto",
    position: "relative",
  };

  const isText = resource?.type === "text";

  return (
    <div ref={setNodeRef} style={{ ...style, display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: "white", border: "1px solid #e5e7eb", borderRadius: "10px" }}>
      <button {...attributes} {...listeners} style={{ cursor: "grab", padding: "2px", border: "none", background: "none", color: "#9ca3af", display: "flex", touchAction: "none" }}>
        <GripVertical size={16} />
      </button>
      <div style={{ width: "28px", height: "28px", borderRadius: "7px", backgroundColor: isText ? "#eff6ff" : "#f5f3ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {isText ? <FileText size={13} color="#2563eb" /> : <HelpCircle size={13} color="#7c3aed" />}
      </div>
      <p style={{ margin: 0, fontSize: "13px", fontWeight: 500, color: "#111827", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {resource?.title ?? item.resource_id.slice(0, 8) + "..."}
      </p>
      <button onClick={onRemove} style={{ border: "none", background: "none", cursor: "pointer", color: "#9ca3af", display: "flex", padding: "4px" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#9ca3af"; }}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export default function MapAndResourcesStep({ mapId, resources, onMapChange, onResourcesChange, onInteractiveCountChange, locale }: Props) {
  const t = useTranslations("quests.map");
  const [maps, setMaps] = useState<MapListItem[]>([]);
  const [fullMaps, setFullMaps] = useState<Record<string, MapResponse>>({});
  const [loadingMaps, setLoadingMaps] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [resourceCache, setResourceCache] = useState<Record<string, ResourceResponse>>({});

  useEffect(() => {
    getMaps(locale).then((list) => {
      setMaps(list);
      Promise.all(list.map((m) => getMap(m.slug).then((full) => ({ slug: m.slug, full })))).then((results) => {
        const cache: Record<string, MapResponse> = {};
        results.forEach(({ slug, full }) => { cache[slug] = full; });
        setFullMaps(cache);
      });
    }).finally(() => setLoadingMaps(false));
    getResources().then((list) => {
      const cache: Record<string, ResourceResponse> = {};
      list.forEach((r) => { cache[r.id] = r; });
      setResourceCache(cache);
    });
  }, [locale]);

  useEffect(() => {
    if (!mapId || !onInteractiveCountChange) return;
    const selectedMap = Object.values(fullMaps).find((m) => {
      const listItem = maps.find((lm) => lm.slug === m.slug);
      return listItem?.id === mapId;
    });
    if (selectedMap) {
      onInteractiveCountChange(selectedMap.objects.filter((o) => o.is_interactive).length);
    }
  }, [mapId, fullMaps, maps, onInteractiveCountChange]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = resources.findIndex((r) => r.resource_id === active.id);
    const newIndex = resources.findIndex((r) => r.resource_id === over.id);
    const reordered = arrayMove(resources, oldIndex, newIndex).map((r, i) => ({ ...r, order_index: i }));
    onResourcesChange(reordered);
  };

  const handleAddResources = (items: QuestResourceItem[]) => {
    const newResources = [
      ...resources,
      ...items.filter((item) => !resources.find((r) => r.resource_id === item.resource_id)),
    ].map((r, i) => ({ ...r, order_index: i }));
    onResourcesChange(newResources);
    // cache newly picked resource info
    getResources().then((list) => {
      const cache: Record<string, ResourceResponse> = {};
      list.forEach((r) => { cache[r.id] = r; });
      setResourceCache(cache);
    });
  };

  const removeResource = (resourceId: string) => {
    onResourcesChange(resources.filter((r) => r.resource_id !== resourceId).map((r, i) => ({ ...r, order_index: i })));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Section A: Map */}
      <div style={{ background: "white", borderRadius: "16px", border: "1px solid #e5e7eb", padding: "20px" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: "15px", fontWeight: 700, color: "#111827" }}>{t("selectMap")}</h3>
        {loadingMaps ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {[0, 1].map((i) => <div key={i} style={{ height: "160px", borderRadius: "12px", background: "#f3f4f6" }} />)}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px" }}>
            {maps.map((m) => {
              const active = mapId === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() => onMapChange(m.id)}
                  style={{
                    borderRadius: "12px",
                    border: active ? "2.5px solid #2563eb" : "1.5px solid #e5e7eb",
                    cursor: "pointer",
                    overflow: "hidden",
                    boxShadow: active ? "0 0 0 3px #dbeafe" : "none",
                    transition: "border-color 0.15s, box-shadow 0.15s",
                    background: "white",
                  }}
                >
                  <div style={{ padding: "8px 8px 0" }}>
                    {fullMaps[m.slug] ? (
                      <MapPreview map={fullMaps[m.slug]} />
                    ) : (
                      <div style={{ width: "100%", aspectRatio: "16/9", background: "#f3f4f6", borderRadius: "8px" }} />
                    )}
                  </div>
                  <div style={{ padding: "10px 10px 12px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ width: "16px", height: "16px", borderRadius: "50%", border: `2px solid ${active ? "#2563eb" : "#d1d5db"}`, backgroundColor: active ? "#2563eb" : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {active && <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "white" }} />}
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: active ? "#2563eb" : "#374151" }}>{m.name}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section B: Resources */}
      <div style={{ background: "white", borderRadius: "16px", border: "1px solid #e5e7eb", padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#111827" }}>{t("resources")}</h3>
            {resources.length > 0 && <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#9ca3af" }}>{t("resourceCount", { count: resources.length })}</p>}
          </div>
          <button
            onClick={() => setPickerOpen(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 14px", backgroundColor: "white", color: "#2563eb", border: "1.5px solid #2563eb", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#eff6ff"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "white"; }}
          >
            <Plus size={14} /> {t("addResources")}
          </button>
        </div>

        {resources.length === 0 ? (
          <div style={{ padding: "32px 16px", textAlign: "center", color: "#9ca3af", fontSize: "14px", border: "1.5px dashed #e5e7eb", borderRadius: "10px" }}>
            {t("noResources")}
          </div>
        ) : (
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={resources.map((r) => r.resource_id)} strategy={verticalListSortingStrategy}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {resources.map((item) => (
                  <SortableResourceRow
                    key={item.resource_id}
                    item={item}
                    resource={resourceCache[item.resource_id]}
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
