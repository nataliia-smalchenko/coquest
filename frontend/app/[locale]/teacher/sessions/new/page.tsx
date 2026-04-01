"use client";

import { ArrowLeft, Calendar, Play, User, Users } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { getQuest } from "@/lib/api/quests";
import { createSession } from "@/lib/api/sessions";
import type { QuestResponse } from "@/types/quest";

export default function NewSessionPage() {
  const t = useTranslations("game.session");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const questId = searchParams.get("quest_id") ?? "";

  const [quest, setQuest] = useState<QuestResponse | null>(null);
  const [loadingQuest, setLoadingQuest] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Session name
  const [sessionName, setSessionName] = useState("");

  // Game mode
  const [maxPlayers, setMaxPlayers] = useState(1);
  const [allowSoloInTeam, setAllowSoloInTeam] = useState(true);
  const [randomTeams, setRandomTeams] = useState(false);

  // Gameplay settings
  const [showFeedbackAfterAnswer, setShowFeedbackAfterAnswer] = useState(false);
  const [showScoreAfter, setShowScoreAfter] = useState(true);
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(true);
  const [keepCompleted, setKeepCompleted] = useState(true);

  // Scheduling
  const [scheduledAt, setScheduledAt] = useState("");
  const [useScheduled, setUseScheduled] = useState(false);
  const [endsAt, setEndsAt] = useState("");
  const [useEndsAt, setUseEndsAt] = useState(false);

  useEffect(() => {
    if (!questId) {
      router.push("/teacher/quests");
      return;
    }
    getQuest(questId)
      .then((q) => {
        setQuest(q);
        const title = q.translations?.[0]?.title;
        if (title) setSessionName(title);
      })
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
        name: sessionName || undefined,
        max_players: maxPlayers,
        allow_solo_in_team: maxPlayers > 1 ? allowSoloInTeam : true,
        random_teams: maxPlayers > 1 ? randomTeams : false,
        show_feedback_after_answer: showFeedbackAfterAnswer,
        show_score_after: showScoreAfter,
        show_correct_answers: showCorrectAnswers,
        keep_completed_in_materials: keepCompleted,
        scheduled_at:
          useScheduled && scheduledAt
            ? new Date(scheduledAt).toISOString()
            : undefined,
        ends_at:
          useEndsAt && endsAt ? new Date(endsAt).toISOString() : undefined,
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
  const isTeam = maxPlayers > 1;

  const cardStyle = "bg-white rounded-2xl border border-gray-200 p-5 space-y-3";
  const sectionLabel =
    "text-xs font-semibold text-gray-400 uppercase tracking-wide";
  const checkRow = (
    label: string,
    hint: string | null,
    checked: boolean,
    onChange: (v: boolean) => void,
    disabled = false,
  ) => (
    <label
      className={`flex items-start gap-3 ${disabled ? "opacity-50" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-blue-600 mt-0.5 flex-shrink-0"
      />
      <div>
        <span className="text-sm font-medium text-gray-700">{label}</span>
        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
      </div>
    </label>
  );

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
            type="button"
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
        <div className={cardStyle}>
          <p className={sectionLabel}>{t("quest")}</p>
          <p className="text-base font-semibold text-gray-900">
            {translation?.title ?? "—"}
          </p>
        </div>

        {/* Session name */}
        <div className={cardStyle}>
          <p className={sectionLabel}>{t("sessionName")}</p>
          <input
            type="text"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            placeholder={translation?.title ?? ""}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Game mode */}
        <div className={cardStyle}>
          <p className={sectionLabel}>{t("mode")}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setMaxPlayers(1)}
              className="flex-1 p-3 rounded-xl border-2 text-left transition-all"
              style={{
                borderColor: !isTeam ? "#2563eb" : "#e5e7eb",
                backgroundColor: !isTeam ? "#eff6ff" : "white",
                color: !isTeam ? "#2563eb" : "#374151",
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <User size={15} />
                <span className="text-sm font-semibold">{t("solo")}</span>
              </div>
              <p
                className="text-xs"
                style={{ color: !isTeam ? "#3b82f6" : "#9ca3af" }}
              >
                {t("soloHint")}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setMaxPlayers(4)}
              className="flex-1 p-3 rounded-xl border-2 text-left transition-all"
              style={{
                borderColor: isTeam ? "#2563eb" : "#e5e7eb",
                backgroundColor: isTeam ? "#eff6ff" : "white",
                color: isTeam ? "#2563eb" : "#374151",
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Users size={15} />
                <span className="text-sm font-semibold">{t("teamMode")}</span>
              </div>
              <p
                className="text-xs"
                style={{ color: isTeam ? "#3b82f6" : "#9ca3af" }}
              >
                {t("teamModeHint")}
              </p>
            </button>
          </div>
          {isTeam && (
            <div>
              <span className="text-xs font-medium text-gray-500 block mb-1">
                {t("teamSize")}
              </span>
              <div className="flex gap-2">
                {[2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMaxPlayers(n)}
                    className="w-10 h-10 rounded-lg border-2 text-sm font-semibold transition-all"
                    style={{
                      borderColor: maxPlayers === n ? "#2563eb" : "#e5e7eb",
                      backgroundColor: maxPlayers === n ? "#eff6ff" : "white",
                      color: maxPlayers === n ? "#2563eb" : "#374151",
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                {checkRow(
                  t("allowSolo"),
                  t("allowSoloHint"),
                  allowSoloInTeam,
                  setAllowSoloInTeam,
                )}
                {checkRow(
                  t("randomTeams"),
                  t("randomTeamsHint"),
                  randomTeams,
                  setRandomTeams,
                )}
              </div>
            </div>
          )}
        </div>

        {/* Gameplay settings */}
        <div className={cardStyle}>
          <p className={sectionLabel}>{t("gameplay")}</p>
          {checkRow(
            t("showFeedback"),
            t("showFeedbackHint"),
            showFeedbackAfterAnswer,
            setShowFeedbackAfterAnswer,
          )}
          {checkRow(
            t("keepCompleted"),
            t("keepCompletedHint"),
            keepCompleted,
            setKeepCompleted,
          )}
        </div>

        {/* Results settings */}
        <div className={cardStyle}>
          <p className={sectionLabel}>{t("results")}</p>
          {checkRow(t("showScore"), null, showScoreAfter, setShowScoreAfter)}
          {checkRow(
            t("showCorrect"),
            null,
            showCorrectAnswers,
            setShowCorrectAnswers,
            !showScoreAfter,
          )}
        </div>

        {/* Scheduled start time (optional) */}
        <div className={cardStyle}>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={useScheduled}
              onChange={(e) => {
                setUseScheduled(e.target.checked);
                if (e.target.checked && !scheduledAt) {
                  const d = new Date(Date.now() + 60 * 60 * 1000);
                  const pad = (n: number) => String(n).padStart(2, "0");
                  setScheduledAt(
                    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
                  );
                }
              }}
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
        <div className={cardStyle}>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={useEndsAt}
              onChange={(e) => {
                setUseEndsAt(e.target.checked);
                if (e.target.checked && !endsAt) {
                  const d = new Date(Date.now() + 60 * 60 * 1000);
                  const pad = (n: number) => String(n).padStart(2, "0");
                  setEndsAt(
                    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
                  );
                }
              }}
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
          type="button"
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
