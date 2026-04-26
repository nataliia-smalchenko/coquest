"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { type Ref, useEffect, useImperativeHandle } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const schema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  language: z.string(),
});

type BasicData = z.infer<typeof schema>;

export interface BasicInfoRef {
  triggerValidate: () => Promise<boolean>;
}

interface Props {
  initialData: BasicData;
  onChange: (data: BasicData) => void;
  ref?: Ref<BasicInfoRef>;
}

export default function BasicInfoStep({ initialData, onChange, ref }: Props) {
  const t = useTranslations("quests.basic");

  const {
    register,
    watch,
    trigger,
    setValue,
    formState: { errors },
  } = useForm<BasicData>({
    resolver: zodResolver(schema),
    defaultValues: initialData,
  });

  useImperativeHandle(ref, () => ({
    triggerValidate: () => trigger(),
  }));

  // Sync to parent on every change
  useEffect(() => {
    const sub = watch((values) => {
      onChange(values as BasicData);
    });
    return () => sub.unsubscribe();
  }, [watch, onChange]);

  const inputStyle = (hasError: boolean): React.CSSProperties => ({
    width: "100%",
    border: `1.5px solid ${hasError ? "#ef4444" : "#e5e7eb"}`,
    borderRadius: "10px",
    padding: "10px 14px",
    fontSize: "14px",
    color: "#111827",
    outline: "none",
    transition: "border-color 0.15s",
    boxSizing: "border-box",
  });

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "13px",
    fontWeight: 600,
    color: "#374151",
    marginBottom: "6px",
  };

  return (
    <div
      style={{
        background: "white",
        borderRadius: "16px",
        border: "1px solid #e5e7eb",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
      }}
    >
      {/* Title */}
      <div>
        <label htmlFor="quest-title" style={labelStyle}>
          {t("title")} <span style={{ color: "#ef4444" }}>*</span>
        </label>
        <input
          id="quest-title"
          {...register("title")}
          placeholder={t("titlePlaceholder")}
          style={inputStyle(!!errors.title)}
          onFocus={(e) => {
            if (!errors.title) e.currentTarget.style.borderColor = "#2563eb";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = errors.title
              ? "#ef4444"
              : "#e5e7eb";
          }}
        />
        {errors.title && (
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#ef4444" }}>
            {errors.title.message}
          </p>
        )}
      </div>

      {/* Description */}
      <div>
        <label htmlFor="quest-description" style={labelStyle}>
          {t("description")}
        </label>
        <textarea
          id="quest-description"
          {...register("description")}
          placeholder={t("descriptionPlaceholder")}
          rows={3}
          style={{
            ...inputStyle(false),
            resize: "vertical",
            fontFamily: "inherit",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "#2563eb";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "#e5e7eb";
          }}
        />
      </div>

      {/* Language */}
      <div>
        <p style={labelStyle}>{t("language")}</p>
        <div style={{ display: "flex", gap: "8px" }}>
          {["uk", "en"].map((lang) => {
            const active = watch("language") === lang;
            return (
              <button
                key={lang}
                type="button"
                onClick={() => setValue("language", lang)}
                style={{
                  padding: "8px 20px",
                  borderRadius: "8px",
                  border: "1.5px solid",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 500,
                  transition: "all 0.15s",
                  borderColor: active ? "#2563eb" : "#e5e7eb",
                  backgroundColor: active ? "#eff6ff" : "white",
                  color: active ? "#2563eb" : "#6b7280",
                }}
              >
                {lang === "uk" ? "🇺🇦 Українська" : "🇬🇧 English"}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
