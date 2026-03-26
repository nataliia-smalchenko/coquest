"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Play, Calendar, Users, ArrowLeft } from "lucide-react";
import { createSession } from "@/lib/api/sessions";
import { getQuest } from "@/lib/api/quests";
import type { QuestResponse } from "@/types/quest";

export default function NewSessionPage() {
  const t = useTranslations("game.session");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const questId = searchParams.get("quest_id") ?? "";

  const [quest, setQuest] = useState<QuestResponse | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");
  const [useScheduled, setUseScheduled] = useState(false);
  const [endsAt, setEndsAt] = useState("");
  const [useEndsAt, setUseEndsAt] = useState(false);
  const [maxParticipants, setMaxParticipants] = useState("");
  const [useMaxParticipants, setUseMaxParticipants] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingQuest, setLoadingQuest] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!questId) {
      router.push("/teacher/quests");
      return;
    }
    getQuest(questId)
      .then(setQuest)
      .catch(() => router.push("/teacher/quests"))
      .finally(() => setLoadingQuest(false));
  }, [questId, router]);

  const handleCreate = async () => {
    if (!questId) return;
    setLoading(true);
    setError(null);
    try {
      const session = await createSession({
        quest_id: questId,
        scheduled_at:
          useScheduled && scheduledAt
            ? new Date(scheduledAt).toISOString()
            : undefined,
        ends_at:
          useEndsAt && endsAt ? new Date(endsAt).toISOString() : undefined,
        max_participants:
          useMaxParticipants && maxParticipants
            ? Number(maxParticipants)
            : undefined,
      });
      router.push(`/teacher/sessions/${session.id}/monitor`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      setError(msg ?? t("createError"));
    } finally {
      setLoading(false);
    }
  };

  const translation = quest?.translations?.[0];

  if (loadingQuest) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-16 z-10">
        <div
          className="h-16 flex items-center gap-4 mx-auto w-full"
          style={{
            maxWidth: "1280px",
            paddingLeft: "20px",
            paddingRight: "20px",
          }}
        >
          <button
            onClick={() => router.push(`/teacher/quests/${questId}`)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors px-2 py-1.5 rounded-lg hover:bg-gray-100"
          >
            <ArrowLeft size={16} />
            {tCommon("back")}
          </button>
          <span className="w-px h-5 bg-gray-200" />
          <span className="text-sm font-semibold text-gray-800 truncate">
            {t("newTitle")}
          </span>
        </div>
      </div>

      {/* Content */}
      <div
        className="max-w-lg mx-auto mb-10 space-y-4"
        style={{ marginTop: "40px", paddingLeft: "24px", paddingRight: "24px" }}
      >
        {/* Quest info */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
            {t("quest")}
          </p>
          <p className="text-base font-semibold text-gray-900">
            {translation?.title ?? "—"}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Індивідуальне проходження
          </p>
        </div>

        {/* Max participants (optional) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={useMaxParticipants}
              onChange={(e) => setUseMaxParticipants(e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
            <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Users size={15} className="text-gray-400" />
              Обмежити кількість учасників
            </span>
          </label>
          {useMaxParticipants && (
            <input
              type="number"
              min={1}
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(e.target.value)}
              placeholder="Максимум учасників"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>

        {/* Scheduled start time (optional) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={useScheduled}
              onChange={(e) => setUseScheduled(e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
            <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Calendar size={15} className="text-gray-400" />
              {t("schedule")}
            </span>
          </label>
          {useScheduled && (
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>

        {/* End time (optional) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={useEndsAt}
              onChange={(e) => setUseEndsAt(e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
            <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Calendar size={15} className="text-gray-400" />
              {t("scheduleEnd")}
            </span>
          </label>
          {useEndsAt && (
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Create button */}
        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
        >
          <Play size={16} />
          {loading ? "..." : t("create")}
        </button>

        <p className="text-xs text-gray-400 text-center">{t("createHint")}</p>
      </div>
    </div>
  );
}
