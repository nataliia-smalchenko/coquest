"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { FileText, HelpCircle, Search, X } from "lucide-react";
import { getResources } from "@/lib/api/resources";
import type { ResourceResponse } from "@/types/resource";
import type { QuestResourceItem } from "@/types/quest";

interface ResourcePickerModalProps {
  open: boolean;
  onClose: () => void;
  existingResourceIds: string[];
  onAdd: (items: QuestResourceItem[]) => void;
}

export function ResourcePickerModal({ open, onClose, existingResourceIds, onAdd }: ResourcePickerModalProps) {
  const t = useTranslations("quests.map");
  const tRes = useTranslations("resources");
  const [resources, setResources] = useState<ResourceResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "text" | "question">("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected(new Set());
    setSearch("");
    setTypeFilter("");
    getResources().then(setResources).finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const filtered = resources.filter((r) => {
    if (search && !r.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter && r.type !== typeFilter) return false;
    return true;
  });

  const toggle = (id: string) => {
    if (existingResourceIds.includes(id)) return;
    setSelected((prev) => {
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
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 40 }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(480px, 100vw)", background: "white", zIndex: 50, display: "flex", flexDirection: "column", boxShadow: "-4px 0 32px rgba(0,0,0,0.12)" }}>
        {/* Header */}
        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#111827" }}>{t("addResources")}</h3>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: "#9ca3af", padding: "4px", display: "flex" }}>
            <X size={20} />
          </button>
        </div>
        {/* Filters */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#9ca3af", pointerEvents: "none" }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search")}
              style={{ width: "100%", border: "1.5px solid #e5e7eb", borderRadius: "8px", padding: "8px 12px 8px 32px", fontSize: "13px", outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            {(["", "text", "question"] as const).map((type) => (
              <button key={type} onClick={() => setTypeFilter(type)}
                style={{ padding: "4px 12px", borderRadius: "20px", border: "1.5px solid", fontSize: "12px", fontWeight: 500, cursor: "pointer",
                  borderColor: typeFilter === type ? "#2563eb" : "#e5e7eb",
                  backgroundColor: typeFilter === type ? "#eff6ff" : "white",
                  color: typeFilter === type ? "#2563eb" : "#6b7280" }}>
                {type === "" ? tRes("filters") : tRes(`type.${type}`)}
              </button>
            ))}
          </div>
        </div>
        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => <div key={i} style={{ height: "44px", borderRadius: "8px", background: "#f3f4f6", marginBottom: "6px" }} />)
            : filtered.length === 0
              ? <div style={{ padding: "48px 16px", textAlign: "center", color: "#9ca3af", fontSize: "14px" }}>{tRes("empty")}</div>
              : filtered.map((r) => {
                  const isAdded = existingResourceIds.includes(r.id);
                  const isSel = selected.has(r.id);
                  const isText = r.type === "text";
                  return (
                    <div key={r.id} onClick={() => toggle(r.id)}
                      style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 8px", borderRadius: "8px",
                        cursor: isAdded ? "default" : "pointer", opacity: isAdded ? 0.5 : 1,
                        backgroundColor: isSel ? "#eff6ff" : "transparent", transition: "background-color 0.1s" }}>
                      <input type="checkbox" checked={isAdded || isSel} disabled={isAdded} onChange={() => toggle(r.id)} onClick={(e) => e.stopPropagation()}
                        style={{ width: "15px", height: "15px", flexShrink: 0, accentColor: "#2563eb" }} />
                      <div style={{ width: "28px", height: "28px", borderRadius: "7px", backgroundColor: isText ? "#eff6ff" : "#f5f3ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {isText ? <FileText size={13} color="#2563eb" /> : <HelpCircle size={13} color="#7c3aed" />}
                      </div>
                      <p style={{ margin: 0, fontSize: "13px", fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                        {r.title}
                      </p>
                    </div>
                  );
                })}
        </div>
        {/* Footer */}
        <div style={{ padding: "16px 20px", borderTop: "1px solid #e5e7eb" }}>
          <button onClick={handleAdd} disabled={selected.size === 0}
            style={{ width: "100%", padding: "11px", backgroundColor: selected.size === 0 ? "#93c5fd" : "#2563eb", color: "white", border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: 600, cursor: selected.size === 0 ? "not-allowed" : "pointer" }}>
            {t("done")} ({selected.size})
          </button>
        </div>
      </div>
    </>
  );
}
