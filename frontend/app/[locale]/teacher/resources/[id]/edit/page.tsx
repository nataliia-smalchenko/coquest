"use client";

import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ArrowLeft, Check, FileText, Folder, HelpCircle, Loader2, Plus, Save, X } from "lucide-react";

import { createResource, deleteResource, getResource, updateResource } from "@/lib/api/resources";
import { useResourceStore } from "@/hooks/useResourceStore";
import { TextEditor } from "@/components/teacher/resources/editors/TextEditor";
import { QuestionEditor } from "@/components/teacher/resources/editors/QuestionEditor";
import { SelectDropdown } from "@/components/ui/SelectDropdown";
import type { ResourceDetailResponse } from "@/types/resource";

interface EditPageProps {
  params: Promise<{ id: string }>;
}

export default function EditResourcePage({ params }: EditPageProps) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";
  const t = useTranslations("resources");
  const tEditor = useTranslations("resources.editor");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { folders, tags, fetchFolders, fetchTags, resources, selectedFolderId, selectedTagIds: storeTagIds } = useResourceStore();

  const [resource, setResource] = useState<ResourceDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [folderId, setFolderId] = useState<string>("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaStatus, setMetaStatus] = useState<"idle" | "success" | "error">("idle");
  const [cancelling, setCancelling] = useState(false);
  const [creatingNext, setCreatingNext] = useState<"text" | "question" | null>(null);

  useEffect(() => {
    fetchFolders();
    fetchTags();
    getResource(id)
      .then((r) => {
        setResource(r);
        setTitle(r.title);
        setFolderId(r.folder_id ?? "");
        setSelectedTagIds(r.tags.map((tag) => tag.id));
      })
      .catch(() => router.push("/teacher/resources"))
      .finally(() => setLoading(false));
  }, [id, fetchFolders, fetchTags, router]);

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId],
    );
  };

  const handleCancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      await deleteResource(id);
    } catch {
      // ignore — still navigate away
    }
    router.push("/teacher/resources");
  };

  const isDefaultTitle = (value: string) =>
    new RegExp(`^${t("newText")} \\d+$`).test(value) ||
    new RegExp(`^${t("newQuestion")} \\d+$`).test(value);

  const handleCreateNext = async (type: "text" | "question") => {
    if (creatingNext) return;
    setCreatingNext(type);
    try {
      const count = resources.filter((r) => r.type === type).length + 1;
      const defaultTitle = type === "text" ? `${t("newText")} ${count}` : `${t("newQuestion")} ${count}`;
      const nextTitle = title.trim() && !isDefaultTitle(title.trim()) ? title.trim() : defaultTitle;
      const newResource = await createResource({
        type,
        title: nextTitle,
        folder_id: selectedFolderId ?? null,
        tag_ids: storeTagIds,
      });
      router.push(`/teacher/resources/${newResource.id}/edit?new=1`);
    } catch {
      setCreatingNext(null);
    }
  };

  const saveMeta = async () => {
    if (!resource) return;
    setMetaSaving(true);
    setMetaStatus("idle");
    try {
      const updated = await updateResource(resource.id, {
        title: title.trim() || resource.title,
        folder_id: folderId || null,
        tag_ids: selectedTagIds,
      });
      setResource((prev) => (prev ? { ...prev, ...updated } : prev));
      setMetaStatus("success");
      setTimeout(() => setMetaStatus("idle"), 2000);
    } catch {
      setMetaStatus("error");
    } finally {
      setMetaSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "50vh" }}>
        <Loader2 size={28} color="#9ca3af" className="animate-spin" />
      </div>
    );
  }

  if (!resource) return null;

  const isText = resource.type === "text";
  const accentColor = "#2563eb";
  const accentBg = "#eff6ff";

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb" }}>

      {/* Top bar */}
      <div
        style={{
          background: "white",
          borderBottom: "1px solid #e5e7eb",
          padding: "0 16px",
          height: "56px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <button
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
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#111827")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#6b7280")}
        >
          <ArrowLeft size={16} />
          <span className="topbar-back-label">{tCommon("back")}</span>
        </button>

        <span style={{ width: "1px", height: "20px", background: "#e5e7eb", flexShrink: 0 }} />

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
          <span className="topbar-type-label">{t(`type.${resource.type}`)}</span>
        </span>

        <span
          style={{
            fontSize: "15px",
            fontWeight: 600,
            color: "#111827",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: "1 1 0",
            minWidth: 0,
          }}
        >
          {resource.title}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
            <button
              onClick={() => handleCreateNext("text")}
              disabled={!!creatingNext || cancelling}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "6px 12px",
                backgroundColor: "white",
                color: "#2563eb",
                border: "1.5px solid #2563eb",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: creatingNext || cancelling ? "not-allowed" : "pointer",
                opacity: creatingNext === "question" || cancelling ? 0.5 : 1,
                transition: "background-color 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!creatingNext && !cancelling) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#eff6ff";
              }}
              onMouseLeave={(e) => {
                if (!creatingNext && !cancelling) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "white";
              }}
            >
              {creatingNext === "text" ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              <FileText size={13} />
              <span className="topbar-btn-label">{t("createNextText")}</span>
            </button>
            <button
              onClick={() => handleCreateNext("question")}
              disabled={!!creatingNext || cancelling}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "6px 12px",
                backgroundColor: "#2563eb",
                color: "white",
                border: "1.5px solid #2563eb",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: creatingNext || cancelling ? "not-allowed" : "pointer",
                opacity: creatingNext === "text" || cancelling ? 0.5 : 1,
                transition: "background-color 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!creatingNext && !cancelling) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1d4ed8";
              }}
              onMouseLeave={(e) => {
                if (!creatingNext && !cancelling) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2563eb";
              }}
            >
              {creatingNext === "question" ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              <HelpCircle size={13} />
              <span className="topbar-btn-label">{t("createNextQuestion")}</span>
            </button>
            {isNew && (
              <button
                onClick={handleCancel}
                disabled={cancelling || !!creatingNext}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "6px 12px",
                  backgroundColor: "white",
                  color: "#ef4444",
                  border: "1.5px solid #fca5a5",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: cancelling || creatingNext ? "not-allowed" : "pointer",
                  opacity: cancelling || creatingNext ? 0.5 : 1,
                  transition: "background-color 0.15s, border-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!cancelling && !creatingNext) {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#fef2f2";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "#ef4444";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!cancelling && !creatingNext) {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = "white";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "#fca5a5";
                  }
                }}
              >
                {cancelling ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                <span className="topbar-btn-label">{tCommon("cancel")}</span>
              </button>
            )}
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .topbar-btn-label { display: none; }
          .topbar-back-label { display: none; }
          .topbar-type-label { display: none; }
        }
      `}</style>

      {/* Body */}
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* Metadata card */}
        <div
          style={{
            background: "white",
            borderRadius: "16px",
            border: "1px solid #e5e7eb",
            overflow: "hidden",
          }}
        >
          {/* Card header */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>
              {tEditor("titleLabel")}
            </span>
          </div>

          <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Title input */}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={tEditor("titlePlaceholder")}
              style={{
                width: "100%",
                border: "1.5px solid #e5e7eb",
                borderRadius: "10px",
                padding: "10px 14px",
                fontSize: "15px",
                fontWeight: 500,
                color: "#111827",
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = accentColor)}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#e5e7eb")}
            />

            {/* Folder + Tags row */}
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
              {/* Folder */}
              <div style={{ minWidth: "160px" }}>
                <SelectDropdown
                  label={tEditor("folder")}
                  value={folderId}
                  onSelect={setFolderId}
                  options={[
                    { value: "", label: tEditor("noFolder"), icon: <Folder size={13} /> },
                    ...folders.map((f) => ({ value: f.id, label: f.name, icon: <Folder size={13} /> })),
                  ]}
                  placeholder={tEditor("noFolder")}
                  triggerIcon={<Folder size={14} color="#9ca3af" />}
                />
              </div>

              {/* Tags */}
              {tags.length > 0 && (
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#6b7280", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {tEditor("tags")}
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
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
                              backgroundColor: active ? "rgba(255,255,255,0.5)" : tag.color,
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
            </div>

            {/* Save row */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingTop: "4px" }}>
              <button
                onClick={saveMeta}
                disabled={metaSaving}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  padding: "9px 18px",
                  backgroundColor: accentColor,
                  color: "white",
                  border: "none",
                  borderRadius: "10px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: metaSaving ? "not-allowed" : "pointer",
                  opacity: metaSaving ? 0.7 : 1,
                  transition: "background-color 0.15s, opacity 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!metaSaving) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1d4ed8";
                }}
                onMouseLeave={(e) => {
                  if (!metaSaving) (e.currentTarget as HTMLButtonElement).style.backgroundColor = accentColor;
                }}
              >
                {metaSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {metaSaving ? tCommon("loading") : tCommon("save")}
              </button>
              {metaStatus === "success" && (
                <span style={{ fontSize: "13px", color: "#16a34a", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Check size={14} />
                  {tEditor("saveSuccess")}
                </span>
              )}
              {metaStatus === "error" && (
                <span style={{ fontSize: "13px", color: "#ef4444" }}>
                  {tEditor("saveError")}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Content editor card */}
        <div
          style={{
            background: "white",
            borderRadius: "16px",
            border: "1px solid #e5e7eb",
            overflow: "hidden",
          }}
        >
          {isText ? (
            <TextEditor
              resourceId={resource.id}
              initial={resource.text_content}
              onSaved={(content) =>
                setResource((prev) => (prev ? { ...prev, text_content: content } : prev))
              }
            />
          ) : (
            <QuestionEditor
              resourceId={resource.id}
              initial={resource.question}
              onSaved={(question) =>
                setResource((prev) => (prev ? { ...prev, question } : prev))
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
