"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import CharacterCount from "@tiptap/extension-character-count";
import { ResizableImage } from "@/components/editor/ResizableImage";
import { CodeBlockWithSelector } from "@/components/editor/CodeBlockWithSelector";
import {
  Bold,
  Check,
  Code,
  Code2,
  ImageIcon,
  Italic,
  Loader2,
  Plus,
  Save,
  Underline as UnderlineIcon,
  X,
} from "lucide-react";
import { getUploadSignature, upsertQuestion } from "@/lib/api/resources";
import type { QuestionResponse, QuestionType } from "@/types/resource";
import { SelectDropdown } from "@/components/ui/SelectDropdown";

const DIFFICULTY_LEVELS = [
  "beginner",
  "intermediate",
  "sufficient",
  "advanced",
] as const;
type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

const DIFFICULTY_STYLE: Record<
  DifficultyLevel,
  { bg: string; color: string; border: string }
> = {
  beginner: { bg: "#fef2f2", color: "#dc2626", border: "#fecaca" },
  intermediate: { bg: "#fefce8", color: "#ca8a04", border: "#fef08a" },
  sufficient: { bg: "#eff6ff", color: "#2563eb", border: "#bfdbfe" },
  advanced: { bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" },
};

const optionSchema = z.object({
  id: z.string(),
  text: z.string(),
  image_url: z.string().nullable().optional(),
  is_correct: z.boolean(),
});

const shortAnswerSchema = z.object({ text: z.string() });

const schema = z.object({
  question_type: z.enum(["single", "multiple", "short", "open"]),
  body: z.string().min(1),
  explanation: z.string().optional(),
  difficulty: z.enum(DIFFICULTY_LEVELS).nullable().optional(),
  options: z.array(optionSchema),
  short_answers: z.array(shortAnswerSchema),
  requires_review: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const QUESTION_TYPES: QuestionType[] = ["single", "multiple", "short", "open"];

interface QuestionEditorProps {
  resourceId: string;
  initial?: QuestionResponse | null;
  onSaved?: (question: QuestionResponse) => void;
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: 600,
  color: "#374151",
  marginBottom: "6px",
};

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
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "28px",
        height: "28px",
        borderRadius: "6px",
        border: "none",
        background: active ? "#eff6ff" : "transparent",
        color: active ? "#2563eb" : "#374151",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

export function QuestionEditor({
  resourceId,
  initial,
  onSaved,
}: QuestionEditorProps) {
  const t = useTranslations("resources.question");
  const tEditor = useTranslations("resources.editor");
  const tCommon = useTranslations("common");

  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const [uploadingBody, setUploadingBody] = useState(false);
  const [uploadingOptionIdx, setUploadingOptionIdx] = useState<number | null>(
    null,
  );

  const bodyImageInputRef = useRef<HTMLInputElement>(null);
  const optionImageInputRef = useRef<HTMLInputElement>(null);
  const pendingOptionIdx = useRef<number | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      question_type: initial?.question_type ?? "single",
      body: initial?.body ?? "",
      explanation: initial?.explanation ?? "",
      difficulty:
        (initial?.difficulty as DifficultyLevel | null | undefined) ?? null,
      options: initial?.options?.length
        ? initial.options.map((o) => ({
            ...o,
            is_correct: Boolean(o.is_correct),
          }))
        : [
            {
              id: crypto.randomUUID(),
              text: "",
              image_url: null,
              is_correct: false,
            },
            {
              id: crypto.randomUUID(),
              text: "",
              image_url: null,
              is_correct: false,
            },
          ],
      short_answers:
        initial?.question_type === "short" && initial.correct_answers?.length
          ? initial.correct_answers.map((a) => ({ text: a }))
          : [{ text: "" }],
      requires_review: initial?.requires_review ?? false,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "options",
  });
  const {
    fields: shortFields,
    append: appendShort,
    remove: removeShort,
  } = useFieldArray({ control, name: "short_answers" });

  const questionType = watch("question_type");
  const difficulty = watch("difficulty");

  // Body Tiptap editor
  const bodyEditor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ underline: false, codeBlock: false }),
      Underline,
      CodeBlockWithSelector,
      ResizableImage.configure({ inline: false }),
      CharacterCount,
    ],
    content: initial?.body ?? "",
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setValue("body", html === "<p></p>" ? "" : html, {
        shouldValidate: true,
      });
    },
  });

  const handleBodyImageUpload = async (file: File) => {
    if (!bodyEditor) return;
    setUploadingBody(true);
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
      bodyEditor
        .chain()
        .focus()
        .setImage({ src: data.secure_url, alt: file.name })
        .run();
    } catch {
      // ignore
    } finally {
      setUploadingBody(false);
    }
  };

  useEffect(() => {
    if (questionType === "single") {
      const opts = watch("options");
      let found = false;
      opts.forEach((opt, idx) => {
        if (opt.is_correct && found)
          setValue(`options.${idx}.is_correct`, false);
        else if (opt.is_correct) found = true;
      });
    }
  }, [questionType, setValue, watch]);

  const handleSelectSingle = (selectedIdx: number) => {
    fields.forEach((_, idx) => {
      setValue(`options.${idx}.is_correct`, idx === selectedIdx);
    });
  };

  // Option image upload
  const handleOptionImageClick = (idx: number) => {
    pendingOptionIdx.current = idx;
    optionImageInputRef.current?.click();
  };

  const handleOptionImageChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    const idx = pendingOptionIdx.current;
    if (!file || idx === null) return;
    e.target.value = "";
    setUploadingOptionIdx(idx);
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
      setValue(`options.${idx}.image_url`, data.secure_url);
    } catch {
      // ignore
    } finally {
      setUploadingOptionIdx(null);
      pendingOptionIdx.current = null;
    }
  };

  const onSubmit = async (values: FormValues) => {
    setSaveStatus("idle");
    try {
      let correctAnswers: string[] = [];
      let opts = values.options;

      if (questionType === "single" || questionType === "multiple") {
        correctAnswers = values.options
          .filter((o) => o.is_correct)
          .map((o) => o.id);
      } else if (questionType === "short") {
        correctAnswers = values.short_answers
          .map((a) => a.text)
          .filter(Boolean);
        opts = [];
      } else {
        opts = [];
        correctAnswers = [];
      }

      const result = await upsertQuestion(resourceId, {
        question_type: values.question_type,
        body: values.body,
        explanation: values.explanation || null,
        options: opts,
        correct_answers: correctAnswers,
        requires_review: values.requires_review,
        difficulty: values.difficulty ?? null,
      });
      setSaveStatus("success");
      onSaved?.(result);
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    }
  };

  const showOptions = questionType === "single" || questionType === "multiple";

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        padding: "24px",
      }}
    >
      {/* Question type */}
      <SelectDropdown
        label={t("type")}
        value={questionType}
        onSelect={(v) =>
          setValue("question_type", v as QuestionType, { shouldValidate: true })
        }
        options={QUESTION_TYPES.map((qt) => ({
          value: qt,
          label: t(`types.${qt}`),
        }))}
      />

      {/* Difficulty — chip selector */}
      <div>
        <label style={labelStyle}>{t("difficulty")}</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {DIFFICULTY_LEVELS.map((level) => {
            const selected = difficulty === level;
            const style = DIFFICULTY_STYLE[level];
            return (
              <button
                key={level}
                type="button"
                onClick={() =>
                  setValue("difficulty", selected ? null : level, {
                    shouldValidate: true,
                  })
                }
                style={{
                  padding: "5px 14px",
                  borderRadius: "20px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: `1.5px solid ${selected ? style.color : style.border}`,
                  background: selected ? style.bg : "white",
                  color: selected ? style.color : "#9ca3af",
                  transition: "all 0.15s",
                }}
              >
                {t(`difficulties.${level}`)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body — Tiptap */}
      <div>
        <label style={labelStyle}>
          {t("body")}{" "}
          <span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span>
        </label>
        <div
          style={{
            border: `1.5px solid ${errors.body ? "#ef4444" : "#e5e7eb"}`,
            borderRadius: "10px",
            overflow: "hidden",
            background: "white",
          }}
        >
          {/* Toolbar */}
          <div
            style={{
              display: "flex",
              gap: "2px",
              padding: "6px 8px",
              borderBottom: "1px solid #f3f4f6",
              background: "#fafafa",
            }}
          >
            <ToolbarButton
              onClick={() => bodyEditor?.chain().focus().toggleBold().run()}
              active={bodyEditor?.isActive("bold")}
              title="Bold"
            >
              <Bold size={13} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => bodyEditor?.chain().focus().toggleItalic().run()}
              active={bodyEditor?.isActive("italic")}
              title="Italic"
            >
              <Italic size={13} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() =>
                bodyEditor?.chain().focus().toggleUnderline().run()
              }
              active={bodyEditor?.isActive("underline")}
              title="Underline"
            >
              <UnderlineIcon size={13} />
            </ToolbarButton>
            <div
              style={{ width: "1px", background: "#e5e7eb", margin: "4px 4px" }}
            />
            <ToolbarButton
              onClick={() => bodyEditor?.chain().focus().toggleCode().run()}
              active={bodyEditor?.isActive("code")}
              title="Inline code"
            >
              <Code size={13} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() =>
                bodyEditor?.chain().focus().toggleCodeBlock().run()
              }
              active={bodyEditor?.isActive("codeBlock")}
              title="Code block"
            >
              <Code2 size={13} />
            </ToolbarButton>
            <div
              style={{ width: "1px", background: "#e5e7eb", margin: "4px 4px" }}
            />
            <ToolbarButton
              onClick={() => bodyImageInputRef.current?.click()}
              title={t("addImage")}
            >
              {uploadingBody ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <ImageIcon size={13} />
              )}
            </ToolbarButton>
          </div>
          <EditorContent
            editor={bodyEditor}
            style={{
              padding: "10px 14px",
              fontSize: "14px",
              minHeight: "80px",
              color: "#111827",
            }}
          />
          <div
            style={{
              padding: "4px 14px",
              borderTop: "1px solid #f3f4f6",
              fontSize: "11px",
              color: "#9ca3af",
              textAlign: "right",
            }}
          >
            {tEditor("wordCount", {
              count: bodyEditor?.storage.characterCount?.words() ?? 0,
            })}
          </div>
        </div>
        {errors.body && (
          <p style={{ fontSize: "12px", color: "#ef4444", marginTop: "4px" }}>
            {errors.body.message}
          </p>
        )}
      </div>

      {/* Options (single / multiple) */}
      {showOptions && (
        <div>
          <label style={labelStyle}>{t("options")}</label>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            {fields.map((field, idx) => {
              const imageUrl = watch(`options.${idx}.image_url`);
              return (
                <div
                  key={field.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    {questionType === "single" ? (
                      <input
                        type="radio"
                        checked={!!watch(`options.${idx}.is_correct`)}
                        onChange={() => handleSelectSingle(idx)}
                        style={{
                          width: "16px",
                          height: "16px",
                          flexShrink: 0,
                          cursor: "pointer",
                          accentColor: "#2563eb",
                        }}
                      />
                    ) : (
                      <input
                        type="checkbox"
                        checked={!!watch(`options.${idx}.is_correct`)}
                        onChange={(e) =>
                          setValue(
                            `options.${idx}.is_correct`,
                            e.target.checked,
                          )
                        }
                        style={{
                          width: "16px",
                          height: "16px",
                          flexShrink: 0,
                          cursor: "pointer",
                          accentColor: "#2563eb",
                        }}
                      />
                    )}
                    <input
                      {...register(`options.${idx}.text`)}
                      placeholder={`${t("options")} ${idx + 1}`}
                      style={{
                        flex: 1,
                        border: "1.5px solid #e5e7eb",
                        borderRadius: "8px",
                        padding: "8px 12px",
                        fontSize: "14px",
                        color: "#111827",
                        outline: "none",
                        background: "white",
                        fontFamily: "inherit",
                        transition: "border-color 0.15s",
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "#2563eb";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "#e5e7eb";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleOptionImageClick(idx)}
                      disabled={uploadingOptionIdx === idx}
                      title={t("addImage")}
                      style={{
                        width: "32px",
                        height: "32px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "8px",
                        border: "1.5px solid #e5e7eb",
                        background: imageUrl ? "#eff6ff" : "white",
                        color: imageUrl ? "#2563eb" : "#9ca3af",
                        cursor: "pointer",
                        flexShrink: 0,
                        transition: "border-color 0.15s, color 0.15s",
                      }}
                    >
                      {uploadingOptionIdx === idx ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <ImageIcon size={14} />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(idx)}
                      disabled={fields.length <= 1}
                      style={{
                        width: "28px",
                        height: "28px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "6px",
                        border: "none",
                        background: "transparent",
                        color: "#9ca3af",
                        cursor: fields.length <= 1 ? "not-allowed" : "pointer",
                        opacity: fields.length <= 1 ? 0.3 : 1,
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => {
                        if (fields.length > 1) {
                          (e.currentTarget as HTMLButtonElement).style.color =
                            "#ef4444";
                          (
                            e.currentTarget as HTMLButtonElement
                          ).style.background = "#fef2f2";
                        }
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.color =
                          "#9ca3af";
                        (
                          e.currentTarget as HTMLButtonElement
                        ).style.background = "transparent";
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {imageUrl && (
                    <div
                      style={{
                        paddingLeft: "26px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <img
                        src={imageUrl}
                        alt=""
                        style={{
                          height: "64px",
                          borderRadius: "8px",
                          objectFit: "cover",
                          border: "1px solid #e5e7eb",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setValue(`options.${idx}.image_url`, null)
                        }
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "24px",
                          height: "24px",
                          borderRadius: "6px",
                          border: "none",
                          background: "#fef2f2",
                          color: "#ef4444",
                          cursor: "pointer",
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() =>
              append({
                id: crypto.randomUUID(),
                text: "",
                image_url: null,
                is_correct: false,
              })
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              marginTop: "10px",
              fontSize: "13px",
              fontWeight: 600,
              color: "#2563eb",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#6d28d9";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#2563eb";
            }}
          >
            <Plus size={14} />
            {t("addOption")}
          </button>
        </div>
      )}

      {/* Short answer */}
      {questionType === "short" && (
        <div>
          <label style={labelStyle}>{t("correctAnswers")}</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {shortFields.map((field, idx) => (
              <div
                key={field.id}
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <input
                  {...register(`short_answers.${idx}.text`)}
                  placeholder={`${t("correctAnswers")} ${idx + 1}`}
                  style={{
                    flex: 1,
                    border: "1.5px solid #e5e7eb",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    fontSize: "14px",
                    color: "#111827",
                    outline: "none",
                    background: "white",
                    fontFamily: "inherit",
                    transition: "border-color 0.15s",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#2563eb";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e5e7eb";
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeShort(idx)}
                  disabled={shortFields.length <= 1}
                  style={{
                    width: "28px",
                    height: "28px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "6px",
                    border: "none",
                    background: "transparent",
                    color: "#9ca3af",
                    cursor: shortFields.length <= 1 ? "not-allowed" : "pointer",
                    opacity: shortFields.length <= 1 ? 0.3 : 1,
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    if (shortFields.length > 1) {
                      (e.currentTarget as HTMLButtonElement).style.color =
                        "#ef4444";
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "#fef2f2";
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color =
                      "#9ca3af";
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "transparent";
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => appendShort({ text: "" })}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              marginTop: "10px",
              fontSize: "13px",
              fontWeight: 600,
              color: "#2563eb",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#1d4ed8";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#2563eb";
            }}
          >
            <Plus size={14} />
            {t("addAnswer")}
          </button>
        </div>
      )}

      {/* Open answer */}
      {questionType === "open" && (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            cursor: "pointer",
            fontSize: "14px",
            color: "#374151",
          }}
        >
          <input
            type="checkbox"
            {...register("requires_review")}
            style={{
              width: "16px",
              height: "16px",
              accentColor: "#2563eb",
              cursor: "pointer",
            }}
          />
          {t("requiresReview")}
        </label>
      )}

      {/* Explanation */}
      <div>
        <label style={labelStyle}>{t("explanation")}</label>
        <textarea
          {...register("explanation")}
          placeholder={t("explanationPlaceholder")}
          rows={2}
          style={{
            width: "100%",
            border: "1.5px solid #e5e7eb",
            borderRadius: "10px",
            padding: "10px 14px",
            fontSize: "14px",
            color: "#111827",
            outline: "none",
            background: "white",
            boxSizing: "border-box",
            transition: "border-color 0.15s",
            fontFamily: "inherit",
            minHeight: "80px",
            resize: "vertical",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "#2563eb";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "#e5e7eb";
          }}
        />
      </div>

      {/* Hidden file inputs */}
      <input
        ref={bodyImageInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleBodyImageUpload(file);
          e.target.value = "";
        }}
      />
      <input
        ref={optionImageInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleOptionImageChange}
      />

      {/* Submit */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            padding: "9px 18px",
            backgroundColor: isSubmitting ? "#93c5fd" : "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "10px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: isSubmitting ? "not-allowed" : "pointer",
            transition: "background-color 0.15s",
          }}
          onMouseEnter={(e) => {
            if (!isSubmitting)
              (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                "#1d4ed8";
          }}
          onMouseLeave={(e) => {
            if (!isSubmitting)
              (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                "#2563eb";
          }}
        >
          {isSubmitting ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Save size={15} />
          )}
          {isSubmitting ? tCommon("loading") : tCommon("save")}
        </button>

        {saveStatus === "success" && (
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
        {saveStatus === "error" && (
          <span style={{ fontSize: "13px", color: "#ef4444" }}>
            {tEditor("saveError")}
          </span>
        )}
      </div>
    </form>
  );
}
