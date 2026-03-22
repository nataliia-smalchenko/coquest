"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Loader2, Plus, Save, X } from "lucide-react";
import { upsertQuestion } from "@/lib/api/resources";
import { SelectDropdown } from "@/components/ui/SelectDropdown";
import type { QuestionResponse, QuestionType } from "@/types/resource";

const optionSchema = z.object({
  id: z.string(),
  text: z.string(),
  is_correct: z.boolean(),
});

const shortAnswerSchema = z.object({ text: z.string() });

const schema = z.object({
  question_type: z.enum(["single", "multiple", "short", "open"]),
  body: z.string().min(1),
  explanation: z.string().optional(),
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

const inputStyle: React.CSSProperties = {
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
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: 600,
  color: "#374151",
  marginBottom: "6px",
};

export function QuestionEditor({ resourceId, initial, onSaved }: QuestionEditorProps) {
  const t = useTranslations("resources.question");
  const tEditor = useTranslations("resources.editor");
  const tCommon = useTranslations("common");
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [focusedField, setFocusedField] = useState<string | null>(null);

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
      options: initial?.options?.length
        ? initial.options.map((o) => ({ ...o, is_correct: Boolean(o.is_correct) }))
        : [
            { id: crypto.randomUUID(), text: "", is_correct: false },
            { id: crypto.randomUUID(), text: "", is_correct: false },
          ],
      short_answers: initial?.question_type === "short" && initial.correct_answers?.length
        ? initial.correct_answers.map((a) => ({ text: a }))
        : [{ text: "" }],
      requires_review: initial?.requires_review ?? false,
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "options" });
  const { fields: shortFields, append: appendShort, remove: removeShort } = useFieldArray({ control, name: "short_answers" });
  const questionType = watch("question_type");

  useEffect(() => {
    if (questionType === "single") {
      const opts = watch("options");
      let found = false;
      opts.forEach((opt, idx) => {
        if (opt.is_correct && found) setValue(`options.${idx}.is_correct`, false);
        else if (opt.is_correct) found = true;
      });
    }
  }, [questionType, setValue, watch]);

  const handleSelectSingle = (selectedIdx: number) => {
    fields.forEach((_, idx) => {
      setValue(`options.${idx}.is_correct`, idx === selectedIdx);
    });
  };

  const onSubmit = async (values: FormValues) => {
    setSaveStatus("idle");
    try {
      let correctAnswers: string[] = [];
      let opts = values.options;

      if (questionType === "single" || questionType === "multiple") {
        correctAnswers = values.options.filter((o) => o.is_correct).map((o) => o.id);
      } else if (questionType === "short") {
        correctAnswers = values.short_answers.map((a) => a.text).filter(Boolean);
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
      style={{ display: "flex", flexDirection: "column", gap: "20px", padding: "24px" }}
    >
      {/* Question type */}
      <SelectDropdown
        label={t("type")}
        value={questionType}
        onSelect={(v) => setValue("question_type", v as QuestionType, { shouldValidate: true })}
        options={QUESTION_TYPES.map((qt) => ({ value: qt, label: t(`types.${qt}`) }))}
      />

      {/* Body */}
      <div>
        <label style={labelStyle}>
          {t("body")} <span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span>
        </label>
        <textarea
          {...register("body")}
          placeholder={t("bodyPlaceholder")}
          rows={3}
          style={{
            ...inputStyle,
            minHeight: "100px",
            resize: "vertical",
            borderColor: errors.body ? "#ef4444" : focusedField === "body" ? "#2563eb" : "#e5e7eb",
          }}
          onFocus={(e) => {
            setFocusedField("body");
            e.currentTarget.style.borderColor = "#2563eb";
          }}
          onBlur={(e) => {
            setFocusedField(null);
            e.currentTarget.style.borderColor = errors.body ? "#ef4444" : "#e5e7eb";
          }}
        />
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
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {fields.map((field, idx) => (
              <div key={field.id} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {questionType === "single" ? (
                  <input
                    key={`radio-${field.id}`}
                    type="radio"
                    checked={!!watch(`options.${idx}.is_correct`)}
                    onChange={() => handleSelectSingle(idx)}
                    style={{ width: "16px", height: "16px", flexShrink: 0, cursor: "pointer", accentColor: "#2563eb" }}
                  />
                ) : (
                  <input
                    key={`checkbox-${field.id}`}
                    type="checkbox"
                    {...register(`options.${idx}.is_correct`)}
                    style={{ width: "16px", height: "16px", flexShrink: 0, cursor: "pointer", accentColor: "#2563eb" }}
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
                  onFocus={(e) => { e.currentTarget.style.borderColor = "#2563eb"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; }}
                />
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
                    transition: "color 0.12s, background 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    if (fields.length > 1) {
                      (e.currentTarget as HTMLButtonElement).style.color = "#ef4444";
                      (e.currentTarget as HTMLButtonElement).style.background = "#fef2f2";
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = "#9ca3af";
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => append({ id: crypto.randomUUID(), text: "", is_correct: false })}
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
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#6d28d9"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#2563eb"; }}
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
              <div key={field.id} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
                  onFocus={(e) => { e.currentTarget.style.borderColor = "#2563eb"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; }}
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
                    transition: "color 0.12s, background 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    if (shortFields.length > 1) {
                      (e.currentTarget as HTMLButtonElement).style.color = "#ef4444";
                      (e.currentTarget as HTMLButtonElement).style.background = "#fef2f2";
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = "#9ca3af";
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
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
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#1d4ed8"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#2563eb"; }}
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
            style={{ width: "16px", height: "16px", accentColor: "#2563eb", cursor: "pointer" }}
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
            ...inputStyle,
            minHeight: "80px",
            resize: "vertical",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "#2563eb"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; }}
        />
      </div>

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
            if (!isSubmitting) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1d4ed8";
          }}
          onMouseLeave={(e) => {
            if (!isSubmitting) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2563eb";
          }}
        >
          {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
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
