"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { createQuest, getQuest, updateQuest, publishQuest } from "@/lib/api/quests";
import { getResources } from "@/lib/api/resources";
import BasicInfoStep, { type BasicInfoRef } from "./steps/BasicInfoStep";
import MapAndResourcesStep from "./steps/MapAndResourcesStep";
import SettingsStep from "./steps/SettingsStep";
import type { QuestCreate, QuestResourceItem, QuestSettingsCreate } from "@/types/quest";
import type { ResourceResponse } from "@/types/resource";

interface Props {
  mode: "create" | "edit";
  questId?: string;
}

const DEFAULT_SETTINGS: QuestSettingsCreate = {
  time_limit_minutes: null,
  random_order: false,
  show_all_texts: false,
  keep_completed_in_materials: true,
  show_score_after: true,
  show_correct_answers: true,
  distribute_texts_in_team: false,
};

interface BuilderData {
  title: string;
  description?: string;
  language: string;
  max_players: number;
  map_id?: string;
  resources: QuestResourceItem[];
  settings: QuestSettingsCreate;
}

export default function QuestBuilder({ mode, questId: initialQuestId }: Props) {
  const t = useTranslations("quests");
  const tBuilder = useTranslations("quests.builder");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [questId, setQuestId] = useState<string | null>(initialQuestId ?? null);
  const [dataReady, setDataReady] = useState(mode === "create");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [resourceCache, setResourceCache] = useState<Record<string, ResourceResponse>>({});
  const [data, setData] = useState<BuilderData>({
    title: "",
    language: locale,
    max_players: 1,
    resources: [],
    settings: { ...DEFAULT_SETTINGS },
  });

  const basicInfoRef = useRef<BasicInfoRef>(null);

  // Load existing quest for edit mode
  useEffect(() => {
    if (mode === "edit" && initialQuestId) {
      getQuest(initialQuestId).then((q) => {
        const tr = q.translations[0];
        setData({
          title: tr?.title ?? "",
          description: tr?.description ?? undefined,
          language: tr?.language ?? locale,
          max_players: q.max_players,
          map_id: q.map_id ?? undefined,
          resources: q.resources.map((r) => ({ resource_id: r.resource_id, order_index: r.order_index })),
          settings: q.settings ?? { ...DEFAULT_SETTINGS },
        });
        setDataReady(true);
      }).catch(() => router.push("/teacher/quests"));
    }
  }, [mode, initialQuestId, locale, router]);

  // Load resource cache
  useEffect(() => {
    getResources().then((list) => {
      const cache: Record<string, ResourceResponse> = {};
      list.forEach((r) => { cache[r.id] = r; });
      setResourceCache(cache);
    });
  }, []);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2500);
  };

  const buildPayload = (): Omit<QuestCreate, "map_id"> & { map_id?: string } => ({
    title: data.title,
    description: data.description ?? null,
    language: data.language,
    max_players: data.max_players,
    map_id: data.map_id,
    settings: data.settings,
    resources: data.resources,
  });

  const handleSaveDraft = async () => {
    if (!data.title || !data.map_id) {
      showToast(tBuilder("saveError"), false);
      return;
    }
    setSaving(true);
    try {
      if (questId) {
        await updateQuest(questId, buildPayload());
      } else {
        const result = await createQuest(buildPayload() as QuestCreate);
        setQuestId(result.id);
      }
      showToast(tBuilder("saved"), true);
    } catch {
      showToast(tBuilder("saveError"), false);
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    if (step === 0) {
      const valid = await basicInfoRef.current?.triggerValidate();
      if (!valid) return;
    }
    setStep((s) => Math.min(s + 1, 2));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 0));

  const handlePublish = async () => {
    setSaving(true);
    try {
      let id = questId;
      const payload = buildPayload();
      if (!id) {
        const result = await createQuest(payload as QuestCreate);
        id = result.id;
      } else {
        await updateQuest(id, payload);
      }
      await publishQuest(id);
      router.push("/teacher/quests");
    } catch {
      showToast(tBuilder("saveError"), false);
      setSaving(false);
    }
  };

  const STEPS = [tBuilder("steps.basic"), tBuilder("steps.map"), tBuilder("steps.settings")];

  const [interactiveCount, setInteractiveCount] = useState(0);

  // Compute text count for show_all_texts validation
  const textCount = data.resources.filter((r) => resourceCache[r.resource_id]?.type === "text").length;

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb" }}>
      {/* Header */}
      <div style={{ background: "white", borderBottom: "1px solid #e5e7eb", padding: "0 24px", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", position: "sticky", top: 0, zIndex: 20 }}>
        {/* Left */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
          <button
            onClick={() => router.push("/teacher/quests")}
            style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "14px", color: "#6b7280", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#111827"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#6b7280"; }}
          >
            <ArrowLeft size={16} />
            <span className="hide-mobile">{tCommon("back")}</span>
          </button>
          <span style={{ width: "1px", height: "20px", background: "#e5e7eb" }} />
          <span style={{ fontSize: "15px", fontWeight: 600, color: "#111827" }}>
            {mode === "edit" ? tBuilder("editTitle") : tBuilder("title")}
            {data.title && <span style={{ color: "#9ca3af", fontWeight: 400 }}> — {data.title}</span>}
          </span>
        </div>

        {/* Stepper — center */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px", flex: 1, maxWidth: "480px", justifyContent: "center" }}>
          {STEPS.map((label, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              <div style={{
                width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, flexShrink: 0,
                backgroundColor: i < step ? "#dbeafe" : i === step ? "#2563eb" : "#f3f4f6",
                color: i < step ? "#2563eb" : i === step ? "white" : "#9ca3af",
              }}>
                {i < step ? <Check size={13} /> : i + 1}
              </div>
              <span style={{ fontSize: "11px", fontWeight: 500, color: i === step ? "#2563eb" : "#9ca3af", whiteSpace: "nowrap" }} className="hide-mobile">
                {label}
              </span>
            </button>
          ))}
        </div>

        {/* Right: actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, justifyContent: "flex-end" }}>
          {toast && (
            <span style={{ fontSize: "13px", color: toast.ok ? "#16a34a" : "#ef4444", display: "flex", alignItems: "center", gap: "4px" }}>
              {toast.ok && <Check size={13} />} {toast.msg}
            </span>
          )}
          <button
            onClick={handleSaveDraft}
            disabled={saving || !data.title || !data.map_id}
            style={{
              padding: "7px 16px", backgroundColor: "white", color: "#374151",
              border: "1.5px solid #e5e7eb", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
              cursor: saving || !data.title || !data.map_id ? "not-allowed" : "pointer",
              opacity: !data.title || !data.map_id ? 0.5 : 1,
              display: "flex", alignItems: "center", gap: "6px",
            }}
          >
            {saving && step < 2 && <Loader2 size={13} className="animate-spin" />}
            {tBuilder("saveDraft")}
          </button>

          {step > 0 && (
            <button onClick={handleBack}
              style={{ padding: "7px 16px", backgroundColor: "white", color: "#374151", border: "1.5px solid #e5e7eb", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
              {tBuilder("back")}
            </button>
          )}

          {step < 2 ? (
            <button onClick={handleNext}
              style={{ padding: "7px 16px", backgroundColor: "#2563eb", color: "white", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1d4ed8"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2563eb"; }}
            >
              {tBuilder("next")} →
            </button>
          ) : (
            <button onClick={handlePublish} disabled={saving}
              style={{ padding: "7px 16px", backgroundColor: saving ? "#93c5fd" : "#2563eb", color: "white", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
              {saving && <Loader2 size={13} className="animate-spin" />}
              {tBuilder("publish")}
            </button>
          )}
        </div>
      </div>

      <style>{`.hide-mobile { } @media (max-width: 640px) { .hide-mobile { display: none; } }`}</style>

      {/* Content */}
      <div style={{ maxWidth: "720px", margin: "0 auto", padding: "32px 24px" }}>
        {step === 0 && !dataReady && (
          <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
            <Loader2 size={24} className="animate-spin" style={{ color: "#9ca3af" }} />
          </div>
        )}
        {step === 0 && dataReady && (
          <BasicInfoStep
            ref={basicInfoRef}
            initialData={{ title: data.title, description: data.description, language: data.language, max_players: data.max_players }}
            onChange={(d) => setData((prev) => ({ ...prev, ...d }))}
          />
        )}
        {step === 1 && (
          <MapAndResourcesStep
            mapId={data.map_id}
            resources={data.resources}
            onMapChange={(id) => setData((prev) => ({ ...prev, map_id: id }))}
            onResourcesChange={(res) => setData((prev) => ({ ...prev, resources: res }))}
            onInteractiveCountChange={setInteractiveCount}
            locale={locale}
          />
        )}
        {step === 2 && (
          <SettingsStep
            settings={data.settings}
            maxPlayers={data.max_players}
            textCount={textCount}
            interactiveCount={interactiveCount}
            onChange={(s) => setData((prev) => ({ ...prev, settings: s }))}
          />
        )}
      </div>
    </div>
  );
}
