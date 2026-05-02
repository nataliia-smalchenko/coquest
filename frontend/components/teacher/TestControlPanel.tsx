"use client";

import { CheckCircle, ClipboardList, Lock, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import type { GameRun, PlayerProgressSummary } from "@/types/run";

interface TestControlPanelProps {
  run: GameRun;
  players: PlayerProgressSummary[];
  onAdvanceStep: () => void;
}

export default function TestControlPanel({
  run,
  players,
  onAdvanceStep,
}: TestControlPanelProps) {
  const t = useTranslations("game.monitor");
  const isTeacherManaged = run.test_mode === "teacher_managed";
  const currentStep = run.current_step_order ?? 0;

  // Total questions = max total across all players
  const totalQuestions = Math.max(...players.map((p) => p.total), 0);
  const allOpened = currentStep >= totalQuestions - 1;
  const nextStepToOpen = currentStep + 1;

  // How many players answered the current step
  const playersAnsweredCurrent = players.filter(
    (p) => p.completed > currentStep,
  ).length;
  const totalPlayers = players.length;

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList size={15} className="text-gray-400" />
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          {t("testControl")}
        </p>
      </div>

      {/* Per-student progress */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {players.map((pp) => (
          <div
            key={pp.player.id}
            className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2"
          >
            <span className="text-sm font-medium text-gray-700 truncate flex-1">
              {pp.player.display_name}
            </span>
            <span className="text-xs font-semibold text-gray-500 bg-white rounded-full px-2 py-0.5">
              {pp.completed}/{pp.total}
            </span>
          </div>
        ))}
      </div>

      {/* Teacher-managed: clickable question numbers */}
      {isTeacherManaged && (
        <div className="border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">
              {t("currentQuestion")}: {currentStep + 1} / {totalQuestions}
            </p>
            <p className="text-xs text-gray-400">
              <Users size={11} className="inline mr-1" />
              {t("studentsAnswered", {
                count: playersAnsweredCurrent,
                total: totalPlayers,
              })}
            </p>
          </div>

          {/* Numbered question buttons */}
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            {Array.from({ length: totalQuestions }, (_, i) => {
              const isOpened = i <= currentStep;
              const isNext = i === nextStepToOpen && !allOpened;

              return (
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: static ordered question numbers
                  key={`q-${i}`}
                  type="button"
                  disabled={!isNext}
                  onClick={isNext ? onAdvanceStep : undefined}
                  className={`w-9 h-9 rounded-lg text-xs font-bold flex items-center justify-center flex-shrink-0 border transition-all ${
                    isOpened
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : isNext
                        ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700 cursor-pointer animate-pulse"
                        : "bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed"
                  }`}
                  title={
                    isOpened
                      ? `${t("questionOpened", { n: i + 1 })}`
                      : isNext
                        ? t("advanceStep")
                        : `${i + 1}`
                  }
                >
                  {isOpened ? (
                    <CheckCircle size={14} />
                  ) : isNext ? (
                    i + 1
                  ) : (
                    <Lock size={12} />
                  )}
                </button>
              );
            })}
          </div>

          {allOpened && (
            <p className="text-xs text-green-600 font-medium bg-green-50 rounded-full px-3 py-1.5 inline-block">
              {t("allQuestionsOpened")}
            </p>
          )}
        </div>
      )}

      {/* Self-paced: progress bars per student */}
      {!isTeacherManaged && (
        <div className="border-t border-gray-100 pt-3">
          <div className="space-y-2">
            {players.map((pp) => {
              const pct =
                pp.total > 0 ? Math.round((pp.completed / pp.total) * 100) : 0;
              return (
                <div key={pp.player.id} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 truncate w-20">
                    {pp.player.display_name}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-green-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-10 text-right">
                    {pp.completed}/{pp.total}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
