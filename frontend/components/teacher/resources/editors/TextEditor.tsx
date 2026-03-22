"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Save,
  Underline as UnderlineIcon,
} from "lucide-react";
import { getUploadSignature, upsertTextContent } from "@/lib/api/resources";
import type { CloudinaryImage, TextContentResponse } from "@/types/resource";

interface TextEditorProps {
  resourceId: string;
  initial?: TextContentResponse | null;
  onSaved?: (content: TextContentResponse) => void;
}

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      style={{
        width: "32px",
        height: "32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "7px",
        border: "none",
        cursor: "pointer",
        flexShrink: 0,
        transition: "background 0.12s, color 0.12s",
        backgroundColor: active ? "#dbeafe" : "transparent",
        color: active ? "#1d4ed8" : "#6b7280",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#f3f4f6";
          (e.currentTarget as HTMLButtonElement).style.color = "#111827";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
          (e.currentTarget as HTMLButtonElement).style.color = "#6b7280";
        }
      }}
    >
      {children}
    </button>
  );
}

function Separator() {
  return (
    <span
      style={{
        width: "1px",
        height: "20px",
        backgroundColor: "#e5e7eb",
        margin: "0 4px",
        flexShrink: 0,
        display: "inline-block",
      }}
    />
  );
}

export function TextEditor({ resourceId, initial, onSaved }: TextEditorProps) {
  const t = useTranslations("resources.text");
  const tEditor = useTranslations("resources.editor");
  const tCommon = useTranslations("common");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<CloudinaryImage[]>(
    () => initial?.images ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: t("bodyPlaceholder") }),
    ],
    content: initial?.body && Object.keys(initial.body).length > 0
      ? (initial.body as object)
      : { type: "doc", content: [{ type: "paragraph" }] },
  });

  const handleImageUpload = async (file: File) => {
    if (!editor) return;
    setUploading(true);
    try {
      const sig = await getUploadSignature(resourceId);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("signature", sig.signature);
      formData.append("timestamp", String(sig.timestamp));
      formData.append("api_key", sig.api_key);
      formData.append("folder", sig.folder);
      formData.append("upload_preset", sig.upload_preset);

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`,
        { method: "POST", body: formData },
      );
      const data = await res.json();

      editor.chain().focus().setImage({ src: data.secure_url, alt: file.name }).run();
      setImages((prev) => [
        ...prev,
        {
          url: data.secure_url,
          public_id: data.public_id,
          width: data.width,
          height: data.height,
          size_bytes: data.bytes,
        },
      ]);
    } catch {
      console.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!editor) return;
    setSaving(true);
    setStatus("idle");
    try {
      const result = await upsertTextContent(resourceId, {
        body: editor.getJSON() as Record<string, unknown>,
        images,
      });
      setStatus("success");
      onSaved?.(result);
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  };

  if (!editor) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>

      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "2px",
          padding: "10px 14px",
          borderBottom: "1px solid #f0f0f0",
          backgroundColor: "#fafafa",
        }}
      >
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold"
        >
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic"
        >
          <Italic size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="Underline"
        >
          <UnderlineIcon size={15} />
        </ToolbarButton>

        <Separator />

        {([1, 2, 3] as const).map((level) => (
          <ToolbarButton
            key={level}
            onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
            active={editor.isActive("heading", { level })}
            title={`Heading ${level}`}
          >
            <span style={{ fontSize: "12px", fontWeight: 700, lineHeight: 1 }}>H{level}</span>
          </ToolbarButton>
        ))}

        <Separator />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet list"
        >
          <List size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Ordered list"
        >
          <ListOrdered size={15} />
        </ToolbarButton>

        <Separator />

        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          active={editor.isActive({ textAlign: "left" })}
          title="Align left"
        >
          <AlignLeft size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          active={editor.isActive({ textAlign: "center" })}
          title="Align center"
        >
          <AlignCenter size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          active={editor.isActive({ textAlign: "right" })}
          title="Align right"
        >
          <AlignRight size={15} />
        </ToolbarButton>

        <Separator />

        {/* Image upload — onClick, not onMouseDown, so input.click() works */}
        <button
          type="button"
          title={t("addImage")}
          onClick={() => fileInputRef.current?.click()}
          style={{
            width: "32px",
            height: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "7px",
            border: "none",
            cursor: "pointer",
            backgroundColor: "transparent",
            color: "#6b7280",
            flexShrink: 0,
            transition: "background 0.12s, color 0.12s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#f3f4f6";
            (e.currentTarget as HTMLButtonElement).style.color = "#111827";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
            (e.currentTarget as HTMLButtonElement).style.color = "#6b7280";
          }}
        >
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={15} />}
        </button>
      </div>

      {/* Editor area */}
      <div
        style={{ minHeight: "380px", padding: "20px 24px", cursor: "text" }}
        onClick={() => editor.commands.focus()}
      >
        <EditorContent editor={editor} />
      </div>

      {/* Hidden file input */}
      <input
        type="file"
        accept="image/*"
        hidden
        ref={fileInputRef}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImageUpload(file);
          e.target.value = "";
        }}
      />

      {/* Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "12px 16px",
          borderTop: "1px solid #f0f0f0",
          backgroundColor: "#fafafa",
        }}
      >
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            padding: "9px 18px",
            backgroundColor: saving ? "#93c5fd" : "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "10px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
            transition: "background-color 0.15s",
          }}
          onMouseEnter={(e) => {
            if (!saving) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1d4ed8";
          }}
          onMouseLeave={(e) => {
            if (!saving) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2563eb";
          }}
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saving ? tCommon("loading") : tCommon("save")}
        </button>

        {status === "success" && (
          <span
            style={{
              fontSize: "13px",
              color: "#16a34a",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <Check size={14} />
            {tEditor("saveSuccess")}
          </span>
        )}
        {status === "error" && (
          <span style={{ fontSize: "13px", color: "#ef4444" }}>
            {tEditor("saveError")}
          </span>
        )}
      </div>
    </div>
  );
}
