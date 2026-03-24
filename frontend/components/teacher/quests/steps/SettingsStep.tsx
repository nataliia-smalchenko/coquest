"use client";

import { useTranslations } from "next-intl";
import type { QuestSettingsCreate } from "@/types/quest";

interface Props {
  settings: QuestSettingsCreate;
  maxPlayers: number;
  textCount: number;         // number of text-type resources
  interactiveCount: number;  // number of interactive map objects
  onChange: (settings: QuestSettingsCreate) => void;
}

export default function SettingsStep({ settings, maxPlayers, textCount, interactiveCount, onChange }: Props) {
  const t = useTranslations("quests.settings");

  const update = (key: keyof QuestSettingsCreate, value: unknown) => {
    onChange({ ...settings, [key]: value });
  };

  const showAllTextsAllowed = textCount <= Math.floor(interactiveCount / 2);

  const cardStyle: React.CSSProperties = {
    background: "white", borderRadius: "16px", border: "1px solid #e5e7eb", padding: "20px",
    display: "flex", flexDirection: "column", gap: "14px",
  };

  const sectionTitle: React.CSSProperties = {
    margin: "0 0 4px", fontSize: "14px", fontWeight: 700, color: "#374151",
  };

  const checkRow = (label: string, checked: boolean, onChangeFn: (v: boolean) => void, disabled = false, disabledHint = "") => (
    <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1 }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChangeFn(e.target.checked)}
        style={{ width: "16px", height: "16px", accentColor: "#2563eb", flexShrink: 0 }}
      />
      <div>
        <span style={{ fontSize: "14px", color: "#374151", fontWeight: 500 }}>{label}</span>
        {disabled && disabledHint && (
          <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#9ca3af" }}>{disabledHint}</p>
        )}
      </div>
    </label>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Time */}
      <div style={cardStyle}>
        <p style={sectionTitle}>{t("time")}</p>
        <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
          <input type="checkbox" checked={settings.time_limit_minutes != null} onChange={(e) => update("time_limit_minutes", e.target.checked ? 30 : null)}
            style={{ width: "16px", height: "16px", accentColor: "#2563eb" }} />
          <span style={{ fontSize: "14px", color: "#374151", fontWeight: 500 }}>{t("timeLimit")}</span>
        </label>
        {settings.time_limit_minutes != null && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingLeft: "26px" }}>
            <label style={{ fontSize: "13px", color: "#6b7280" }}>{t("minutes")}</label>
            <input
              type="number" min={1} max={180}
              value={settings.time_limit_minutes}
              onChange={(e) => update("time_limit_minutes", Number(e.target.value))}
              style={{ width: "72px", border: "1.5px solid #e5e7eb", borderRadius: "8px", padding: "6px 10px", fontSize: "14px", outline: "none" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#2563eb"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; }}
            />
          </div>
        )}
      </div>

      {/* Order & display */}
      <div style={cardStyle}>
        <p style={sectionTitle}>{t("order")}</p>
        {checkRow(t("randomOrder"), !!settings.random_order, (v) => update("random_order", v))}
        {checkRow(
          t("showAllTexts"),
          !!settings.show_all_texts,
          (v) => update("show_all_texts", v),
          !showAllTextsAllowed,
          !showAllTextsAllowed ? t("showAllTextsDisabled") : "",
        )}
        {checkRow(t("keepCompleted"), settings.keep_completed_in_materials !== false, (v) => update("keep_completed_in_materials", v))}
      </div>

      {/* Team mode — only if max_players > 1 */}
      {maxPlayers > 1 && (
        <div style={cardStyle}>
          <p style={sectionTitle}>{t("team")}</p>
          {checkRow(t("distributeTexts"), !!settings.distribute_texts_in_team, (v) => update("distribute_texts_in_team", v))}
        </div>
      )}

      {/* Results */}
      <div style={cardStyle}>
        <p style={sectionTitle}>{t("results")}</p>
        {checkRow(t("showScore"), settings.show_score_after !== false, (v) => update("show_score_after", v))}
        {checkRow(
          t("showCorrect"),
          !!settings.show_correct_answers,
          (v) => update("show_correct_answers", v),
          !settings.show_score_after,
        )}
      </div>
    </div>
  );
}
