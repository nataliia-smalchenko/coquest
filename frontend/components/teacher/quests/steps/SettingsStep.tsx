"use client";

import { useTranslations } from "next-intl";
import type { QuestSettingsCreate } from "@/types/quest";

interface Props {
  settings: QuestSettingsCreate;
  onChange: (settings: QuestSettingsCreate) => void;
}

export default function SettingsStep({ settings, onChange }: Props) {
  const t = useTranslations("quests.settings");

  const update = (key: keyof QuestSettingsCreate, value: unknown) => {
    onChange({ ...settings, [key]: value });
  };

  const cardStyle: React.CSSProperties = {
    background: "white",
    borderRadius: "16px",
    border: "1px solid #e5e7eb",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  };

  const sectionTitle: React.CSSProperties = {
    margin: "0 0 4px",
    fontSize: "14px",
    fontWeight: 700,
    color: "#374151",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Time */}
      <div style={cardStyle}>
        <p style={sectionTitle}>{t("time")}</p>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={settings.time_limit_minutes != null}
            onChange={(e) =>
              update("time_limit_minutes", e.target.checked ? 30 : null)
            }
            style={{ width: "16px", height: "16px", accentColor: "#2563eb" }}
          />
          <span style={{ fontSize: "14px", color: "#374151", fontWeight: 500 }}>
            {t("timeLimit")}
          </span>
        </label>
        {settings.time_limit_minutes != null && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              paddingLeft: "26px",
            }}
          >
            <label style={{ fontSize: "13px", color: "#6b7280" }}>
              {t("minutes")}
            </label>
            <input
              type="number"
              min={1}
              max={180}
              value={settings.time_limit_minutes}
              onChange={(e) =>
                update("time_limit_minutes", Number(e.target.value))
              }
              style={{
                width: "72px",
                border: "1.5px solid #e5e7eb",
                borderRadius: "8px",
                padding: "6px 10px",
                fontSize: "14px",
                outline: "none",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#2563eb";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#e5e7eb";
              }}
            />
          </div>
        )}
      </div>

      {/* Grade */}
      <div style={cardStyle}>
        <p style={sectionTitle}>{t("grade")}</p>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={settings.max_grade != null}
            onChange={(e) => update("max_grade", e.target.checked ? 12 : null)}
            style={{ width: "16px", height: "16px", accentColor: "#2563eb" }}
          />
          <span style={{ fontSize: "14px", color: "#374151", fontWeight: 500 }}>
            {t("maxGrade")}
          </span>
        </label>
        {settings.max_grade != null && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              paddingLeft: "26px",
            }}
          >
            <label style={{ fontSize: "13px", color: "#6b7280" }}>
              {t("maxGradeValue")}
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={settings.max_grade}
              onChange={(e) => update("max_grade", Number(e.target.value))}
              style={{
                width: "72px",
                border: "1.5px solid #e5e7eb",
                borderRadius: "8px",
                padding: "6px 10px",
                fontSize: "14px",
                outline: "none",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#2563eb";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#e5e7eb";
              }}
            />
          </div>
        )}
      </div>

      {/* Order */}
      <div style={cardStyle}>
        <p style={sectionTitle}>{t("order")}</p>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={!!settings.random_order}
            onChange={(e) => update("random_order", e.target.checked)}
            style={{
              width: "16px",
              height: "16px",
              accentColor: "#2563eb",
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: "14px", color: "#374151", fontWeight: 500 }}>
            {t("randomOrder")}
          </span>
        </label>
      </div>
    </div>
  );
}
