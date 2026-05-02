"use client";

import {
  ArrowLeft,
  Calendar,
  Check,
  ClipboardList,
  Map as MapIcon,
  Play,
  User,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { getMap, getMaps } from "@/lib/api/maps";
import { getResourceSet } from "@/lib/api/resource-sets";
import { createRun } from "@/lib/api/runs";
import type { MapListItem, MapResponse } from "@/types/map";
import type { ResourceSetResponse } from "@/types/resource-set";
import type { RunType, TestMode } from "@/types/run";

export default function NewRunPage() {
  const t = useTranslations("game.run");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const resourceSetId = searchParams.get("resource_set_id") ?? "";

  const [resourceSet, setResourceSet] = useState<ResourceSetResponse | null>(
    null,
  );
  const [loadingResourceSet, setLoadingResourceSet] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Run type
  const [runType, setRunType] = useState<RunType>("quest");

  // Map (for quest)
  const [maps, setMaps] = useState<MapListItem[]>([]);
  const [mapId, setMapId] = useState<string>("");
  const [mapDetails, setMapDetails] = useState<Record<string, MapResponse>>({});
  const [loadingMaps, setLoadingMaps] = useState(false);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);

  // Test mode (for test)
  const [testMode, setTestMode] = useState<TestMode>("self_paced");

  // Run name
  const [runName, setRunName] = useState("");

  // Game mode (quest only)
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
    if (!resourceSetId) {
      router.push("/teacher/resource-sets");
      return;
    }
    getResourceSet(resourceSetId)
      .then((rs) => {
        setResourceSet(rs);
        const title = rs.translations?.[0]?.title;
        if (title) setRunName(title);
      })
      .catch(() => router.push("/teacher/resource-sets"))
      .finally(() => setLoadingResourceSet(false));
  }, [resourceSetId, router]);

  // Load maps + all map details when quest type is selected
  // biome-ignore lint/correctness/useExhaustiveDependencies: mapId is only read to set default, not to trigger refetch
  useEffect(() => {
    if (runType === "quest") {
      setLoadingMaps(true);
      getMaps(locale)
        .then(async (data) => {
          setMaps(data);
          if (data.length > 0 && !mapId) {
            setMapId(data[0].id);
          }
          // Fetch full details (with objects) for all maps in parallel
          const details: Record<string, MapResponse> = {};
          const results = await Promise.allSettled(
            data.map((m) => getMap(m.slug, locale)),
          );
          for (const r of results) {
            if (r.status === "fulfilled") {
              details[r.value.slug] = r.value;
            }
          }
          setMapDetails(details);
        })
        .catch(() => setMaps([]))
        .finally(() => setLoadingMaps(false));
    }
  }, [runType, locale]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedMap = maps.find((m) => m.id === mapId) ?? null;
  const mapDetail = selectedMap ? (mapDetails[selectedMap.slug] ?? null) : null;

  const handleCreate = async () => {
    if (!resourceSetId) return;
    if (runType === "quest" && !mapId) {
      setError(t("mapRequired"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const run = await createRun({
        resource_set_id: resourceSetId,
        run_type: runType,
        map_id: runType === "quest" ? mapId : undefined,
        test_mode: runType === "test" ? testMode : undefined,
        name: runName || undefined,
        max_players: runType === "quest" ? maxPlayers : 1,
        allow_solo_in_team:
          runType === "quest" && maxPlayers > 1 ? allowSoloInTeam : true,
        random_teams:
          runType === "quest" && maxPlayers > 1 ? randomTeams : false,
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
      router.push(`/teacher/runs/${run.id}/monitor`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      setError(msg ?? t("createError"));
    } finally {
      setLoading(false);
    }
  };

  const translation = resourceSet?.translations?.[0];
  const isTeam = runType === "quest" && maxPlayers > 1;

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

  if (loadingResourceSet) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <style>{`
        .map-preview-interactive { transition: filter 0.2s ease; }
        .map-preview-interactive:hover {
          filter: drop-shadow(0 0 4px #facc15) drop-shadow(0 0 8px #fbbf24);
          cursor: pointer;
        }
      `}</style>

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
            onClick={() =>
              router.push(`/teacher/resource-sets/${resourceSetId}`)
            }
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
        {/* Resource set info */}
        <div className={cardStyle}>
          <p className={sectionLabel}>{t("resourceSet")}</p>
          <p className="text-base font-semibold text-gray-900">
            {translation?.title ?? "—"}
          </p>
        </div>

        {/* Run type selector */}
        <div className={cardStyle}>
          <p className={sectionLabel}>{t("runType")}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setRunType("quest")}
              className="flex-1 p-3 rounded-xl border-2 text-left transition-all"
              style={{
                borderColor: runType === "quest" ? "#2563eb" : "#e5e7eb",
                backgroundColor: runType === "quest" ? "#eff6ff" : "white",
                color: runType === "quest" ? "#2563eb" : "#374151",
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <MapIcon size={15} />
                <span className="text-sm font-semibold">
                  {t("runTypeQuest")}
                </span>
              </div>
              <p
                className="text-xs"
                style={{ color: runType === "quest" ? "#3b82f6" : "#9ca3af" }}
              >
                {t("runTypeQuestHint")}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setRunType("test")}
              className="flex-1 p-3 rounded-xl border-2 text-left transition-all"
              style={{
                borderColor: runType === "test" ? "#2563eb" : "#e5e7eb",
                backgroundColor: runType === "test" ? "#eff6ff" : "white",
                color: runType === "test" ? "#2563eb" : "#374151",
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <ClipboardList size={15} />
                <span className="text-sm font-semibold">
                  {t("runTypeTest")}
                </span>
              </div>
              <p
                className="text-xs"
                style={{ color: runType === "test" ? "#3b82f6" : "#9ca3af" }}
              >
                {t("runTypeTestHint")}
              </p>
            </button>
          </div>
        </div>

        {/* Map selector (quest only) */}
        {runType === "quest" && (
          <div className={cardStyle}>
            <p className={sectionLabel}>{t("selectMap")}</p>
            {loadingMaps ? (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : maps.length === 0 ? (
              <p className="text-sm text-gray-500 py-2">
                {t("noMapsAvailable")}
              </p>
            ) : (
              <>
                {/* Selected map preview */}
                {selectedMap ? (
                  <div>
                    <div
                      className="relative w-full rounded-xl overflow-hidden border border-gray-200 bg-gray-100"
                      style={
                        mapDetail
                          ? {
                              aspectRatio:
                                mapDetail.original_width /
                                mapDetail.original_height,
                            }
                          : undefined
                      }
                    >
                      <Image
                        src={`/maps/${selectedMap.slug}/background.svg`}
                        alt={selectedMap.name}
                        width={640}
                        height={360}
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="eager"
                        unoptimized
                      />
                      {mapDetail?.objects
                        .filter((obj) => obj.slug !== "background")
                        .map((obj) => (
                          <div
                            key={obj.id}
                            className="absolute"
                            style={{
                              left: `${(obj.x / mapDetail.original_width) * 100}%`,
                              top: `${(obj.y / mapDetail.original_height) * 100}%`,
                              width: `${(obj.width / mapDetail.original_width) * 100}%`,
                              height: `${(obj.height / mapDetail.original_height) * 100}%`,
                              zIndex: obj.z_index,
                            }}
                          >
                            {/* biome-ignore lint/performance/noImgElement: SVG map object */}
                            <img
                              src={`/maps/${selectedMap.slug}/objects/${obj.slug}.svg`}
                              alt=""
                              className={`absolute inset-0 w-full h-full${obj.is_interactive ? " map-preview-interactive" : ""}`}
                              draggable={false}
                            />
                          </div>
                        ))}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {selectedMap.name}
                        </p>
                        {selectedMap.description && (
                          <p className="text-xs text-gray-400">
                            {selectedMap.description}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setMapPickerOpen(true)}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                      >
                        {t("changeMap")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMapPickerOpen(true)}
                    className="w-full p-6 rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/50 transition-all flex flex-col items-center gap-2 text-gray-400 hover:text-blue-500"
                  >
                    <MapIcon size={24} />
                    <span className="text-sm font-medium">
                      {t("selectMap")}
                    </span>
                    <span className="text-xs">{t("selectMapHint")}</span>
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Map picker modal */}
        {mapPickerOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          >
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  {t("selectMap")}
                </h3>
                <button
                  type="button"
                  onClick={() => setMapPickerOpen(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {maps.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setMapId(m.id);
                      setMapPickerOpen(false);
                    }}
                    className="rounded-xl border-2 overflow-hidden text-left transition-all hover:shadow-md"
                    style={{
                      borderColor: mapId === m.id ? "#2563eb" : "#e5e7eb",
                    }}
                  >
                    <div
                      className="relative bg-gray-100"
                      style={{
                        aspectRatio: mapDetails[m.slug]
                          ? `${mapDetails[m.slug].original_width}/${mapDetails[m.slug].original_height}`
                          : "16/9",
                      }}
                    >
                      <Image
                        src={`/maps/${m.slug}/background.svg`}
                        alt={m.name}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                      {mapDetails[m.slug]?.objects
                        .filter((obj) => obj.slug !== "background")
                        .map((obj) => (
                          <div
                            key={obj.id}
                            className="absolute pointer-events-none"
                            style={{
                              left: `${(obj.x / mapDetails[m.slug].original_width) * 100}%`,
                              top: `${(obj.y / mapDetails[m.slug].original_height) * 100}%`,
                              width: `${(obj.width / mapDetails[m.slug].original_width) * 100}%`,
                              height: `${(obj.height / mapDetails[m.slug].original_height) * 100}%`,
                              zIndex: obj.z_index,
                            }}
                          >
                            {/* biome-ignore lint/performance/noImgElement: SVG map object thumbnail */}
                            <img
                              src={`/maps/${m.slug}/objects/${obj.slug}.svg`}
                              alt=""
                              className="absolute inset-0 w-full h-full"
                              draggable={false}
                            />
                          </div>
                        ))}
                    </div>
                    <div className="px-3 py-2 flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-medium truncate"
                          style={{
                            color: mapId === m.id ? "#2563eb" : "#374151",
                          }}
                        >
                          {m.name}
                        </p>
                        {m.description && (
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                            {m.description}
                          </p>
                        )}
                      </div>
                      {mapId === m.id && (
                        <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Check size={12} className="text-white" />
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Test mode selector (test only) */}
        {runType === "test" && (
          <div className={cardStyle}>
            <p className={sectionLabel}>{t("testMode")}</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setTestMode("self_paced")}
                className="w-full p-3 rounded-xl border-2 text-left transition-all"
                style={{
                  borderColor:
                    testMode === "self_paced" ? "#2563eb" : "#e5e7eb",
                  backgroundColor:
                    testMode === "self_paced" ? "#eff6ff" : "white",
                  color: testMode === "self_paced" ? "#2563eb" : "#374151",
                }}
              >
                <span className="text-sm font-semibold">
                  {t("testModeSelfPaced")}
                </span>
                <p
                  className="text-xs mt-0.5"
                  style={{
                    color: testMode === "self_paced" ? "#3b82f6" : "#9ca3af",
                  }}
                >
                  {t("testModeSelfPacedHint")}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setTestMode("teacher_managed")}
                className="w-full p-3 rounded-xl border-2 text-left transition-all"
                style={{
                  borderColor:
                    testMode === "teacher_managed" ? "#2563eb" : "#e5e7eb",
                  backgroundColor:
                    testMode === "teacher_managed" ? "#eff6ff" : "white",
                  color: testMode === "teacher_managed" ? "#2563eb" : "#374151",
                }}
              >
                <span className="text-sm font-semibold">
                  {t("testModeTeacherManaged")}
                </span>
                <p
                  className="text-xs mt-0.5"
                  style={{
                    color:
                      testMode === "teacher_managed" ? "#3b82f6" : "#9ca3af",
                  }}
                >
                  {t("testModeTeacherManagedHint")}
                </p>
              </button>
            </div>
          </div>
        )}

        {/* Run name */}
        <div className={cardStyle}>
          <p className={sectionLabel}>{t("runName")}</p>
          <input
            type="text"
            value={runName}
            onChange={(e) => setRunName(e.target.value)}
            placeholder={translation?.title ?? ""}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Game mode (quest only — tests are always individual) */}
        {runType === "quest" && (
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
        )}

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
          disabled={loading || (runType === "quest" && !mapId)}
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
