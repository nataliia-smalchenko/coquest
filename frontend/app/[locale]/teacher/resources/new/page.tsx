"use client";

import { ArrowLeft, FileText, Folder, HelpCircle, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { SelectDropdown } from "@/components/ui/SelectDropdown";
import { useResourceStore } from "@/hooks/useResourceStore";
import { useRouter } from "@/i18n/navigation";
import { createResource } from "@/lib/api/resources";
import type { ResourceType } from "@/types/resource";

export default function NewResourcePage() {
  const t = useTranslations("resources");
  const tEditor = useTranslations("resources.editor");
  const tCommon = useTranslations("common");
  const searchParams = useSearchParams();
  const router = useRouter();

  const type = (searchParams.get("type") ?? "text") as ResourceType;
  const isText = type === "text";
  const accentColor = "#2563eb";
  const accentBg = "#eff6ff";

  const {
    folders,
    tags,
    fetchFolders,
    fetchTags,
    fetchResources,
    selectedFolderId,
    selectedTagIds: preselectedTagIds,
  } = useResourceStore();

  const [title, setTitle] = useState("");
  const [folderId, setFolderId] = useState<string>(selectedFolderId ?? "");
  const [selectedTagIds, setSelectedTagIds] =
    useState<string[]>(preselectedTagIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFolders();
    fetchTags();
  }, [fetchFolders, fetchTags]);

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  };

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const resource = await createResource({
        type,
        title: title.trim(),
        folder_id: folderId || null,
        tag_ids: selectedTagIds,
      });
      await fetchResources();
      router.push(`/teacher/resources/${resource.id}/edit`);
    } catch {
      setError(tEditor("saveError"));
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb" }}>
      {/* Sticky top bar */}
      <div
        style={{
          background: "white",
          borderBottom: "1px solid #e5e7eb",
          position: "sticky",
          top: 64,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
            padding: "0 20px",
            height: "56px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <button
            type="button"
            onClick={() => router.push("/teacher/resources")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "14px",
              color: "#6b7280",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#111827";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#6b7280";
            }}
          >
            <ArrowLeft size={16} />
            {tCommon("back")}
          </button>

          <span
            style={{
              width: "1px",
              height: "20px",
              background: "#e5e7eb",
              flexShrink: 0,
            }}
          />

          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              fontSize: "12px",
              fontWeight: 600,
              color: accentColor,
              backgroundColor: accentBg,
              borderRadius: "20px",
              padding: "3px 10px",
              flexShrink: 0,
            }}
          >
            {isText ? <FileText size={12} /> : <HelpCircle size={12} />}
            {isText ? t("newText") : t("newQuestion")}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "40px 16px",
        }}
      >
        <div style={{ width: "100%", maxWidth: "560px" }}>
          {/* Card */}
          <div
            style={{
              background: "white",
              borderRadius: "20px",
              border: "1px solid #e5e7eb",
              boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
              overflow: "hidden",
            }}
          >
            {/* Card header */}
            <div
              style={{
                padding: "24px 28px 20px",
                borderBottom: "1px solid #f3f4f6",
                display: "flex",
                alignItems: "center",
                gap: "14px",
              }}
            >
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  backgroundColor: accentBg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {isText ? (
                  <FileText size={22} color={accentColor} />
                ) : (
                  <HelpCircle size={22} color={accentColor} />
                )}
              </div>
              <div>
                <h1
                  style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    color: "#111827",
                    margin: 0,
                    lineHeight: 1.3,
                  }}
                >
                  {isText ? t("newText") : t("newQuestion")}
                </h1>
                <p
                  style={{
                    fontSize: "13px",
                    color: "#9ca3af",
                    margin: "2px 0 0",
                  }}
                >
                  {t("editor.titleLabel")}
                </p>
              </div>
            </div>

            {/* Form */}
            <div
              style={{
                padding: "24px 28px",
                display: "flex",
                flexDirection: "column",
                gap: "20px",
              }}
            >
              {/* Title */}
              <div>
                <label
                  htmlFor="new-resource-title"
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#374151",
                    marginBottom: "6px",
                  }}
                >
                  {tEditor("titleLabel")}
                  <span style={{ color: "#ef4444", marginLeft: "3px" }}>*</span>
                </label>
                <input
                  id="new-resource-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder={tEditor("titlePlaceholder")}
                  style={{
                    width: "100%",
                    border: "1.5px solid #e5e7eb",
                    borderRadius: "10px",
                    padding: "10px 14px",
                    fontSize: "14px",
                    color: "#111827",
                    outline: "none",
                    transition: "border-color 0.15s",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = accentColor;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e5e7eb";
                  }}
                />
              </div>

              {/* Folder */}
              {folders.length > 0 && (
                <SelectDropdown
                  label={tEditor("folder")}
                  value={folderId}
                  onSelect={setFolderId}
                  options={[
                    {
                      value: "",
                      label: tEditor("noFolder"),
                      icon: <Folder size={13} />,
                    },
                    ...folders.map((f) => ({
                      value: f.id,
                      label: f.name,
                      icon: <Folder size={13} />,
                    })),
                  ]}
                  placeholder={tEditor("noFolder")}
                  triggerIcon={<Folder size={14} color="#9ca3af" />}
                />
              )}

              {/* Tags */}
              {tags.length > 0 && (
                <div>
                  <p
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#374151",
                      marginBottom: "8px",
                    }}
                  >
                    {tEditor("tags")}
                  </p>
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}
                  >
                    {tags.map((tag) => {
                      const active = selectedTagIds.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTag(tag.id)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "4px 10px",
                            borderRadius: "20px",
                            fontSize: "12px",
                            fontWeight: 500,
                            border: "1.5px solid",
                            cursor: "pointer",
                            transition: "all 0.15s",
                            borderColor: active ? tag.color : "#e5e7eb",
                            backgroundColor: active ? tag.color : "white",
                            color: active ? "white" : "#374151",
                          }}
                        >
                          <span
                            style={{
                              width: "7px",
                              height: "7px",
                              borderRadius: "50%",
                              backgroundColor: active
                                ? "rgba(255,255,255,0.6)"
                                : tag.color,
                              flexShrink: 0,
                            }}
                          />
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {error && (
                <p style={{ fontSize: "13px", color: "#ef4444", margin: 0 }}>
                  {error}
                </p>
              )}

              {/* Submit */}
              <button
                type="button"
                onClick={handleCreate}
                disabled={saving || !title.trim()}
                style={{
                  width: "100%",
                  backgroundColor:
                    saving || !title.trim() ? "#93c5fd" : accentColor,
                  color: "white",
                  border: "none",
                  borderRadius: "10px",
                  padding: "12px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: saving || !title.trim() ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  transition: "background-color 0.15s",
                }}
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                {saving ? tCommon("loading") : tCommon("next")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
