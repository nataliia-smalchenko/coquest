"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "@/i18n/navigation";
import api from "@/lib/api";
import { Check, GraduationCap, School } from "lucide-react";

export default function ProfilePage() {
  const t = useTranslations("profile");
  const tCommon = useTranslations("common");
  const { user, isLoading, fetchUser } = useAuth();
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    if (user) setFullName(user.full_name);
  }, [user]);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [user, isLoading, router]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { data } = await api.patch("/api/user/profile", {
        full_name: fullName,
      });
      useAuth.setState({ user: data });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError(t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (role: "teacher" | "student") => {
    if (!user || user.role === role) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { data } = await api.patch("/api/user/profile", { role });
      useAuth.setState({ user: data });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      setError(
        detail === "cannot_change_role"
          ? t("cannotChangeRole")
          : t("saveError"),
      );
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const cardStyle = "bg-white rounded-2xl border border-gray-200 p-5 space-y-3";
  const sectionLabel =
    "text-xs font-semibold text-gray-400 uppercase tracking-wide";

  return (
    <div className="max-w-lg mx-auto px-6 py-10 space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>

      {/* Full name */}
      <div className={cardStyle}>
        <p className={sectionLabel}>{t("fullName")}</p>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Role */}
      <div className={cardStyle}>
        <p className={sectionLabel}>{t("role")}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => handleRoleChange("student")}
            disabled={user.role === "student" || saving}
            className="flex-1 p-3 rounded-xl border-2 text-left transition-all disabled:cursor-default"
            style={{
              borderColor: user.role === "student" ? "#2563eb" : "#e5e7eb",
              backgroundColor: user.role === "student" ? "#eff6ff" : "white",
              color: user.role === "student" ? "#2563eb" : "#374151",
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <GraduationCap size={15} />
              <span className="text-sm font-semibold">{t("roleStudent")}</span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => handleRoleChange("teacher")}
            disabled={user.role === "teacher" || saving}
            className="flex-1 p-3 rounded-xl border-2 text-left transition-all disabled:cursor-default"
            style={{
              borderColor: user.role === "teacher" ? "#2563eb" : "#e5e7eb",
              backgroundColor: user.role === "teacher" ? "#eff6ff" : "white",
              color: user.role === "teacher" ? "#2563eb" : "#374151",
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <School size={15} />
              <span className="text-sm font-semibold">{t("roleTeacher")}</span>
            </div>
          </button>
        </div>
        {user.role === "teacher" && (
          <p className="text-xs text-gray-400">{t("cannotChangeRoleHint")}</p>
        )}
      </div>

      {/* Email (read-only) */}
      <div className={cardStyle}>
        <p className={sectionLabel}>{t("email")}</p>
        <p className="text-sm text-gray-700">{user.email}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving || fullName.trim().length < 2}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
      >
        {saved ? <Check size={16} /> : null}
        {saving ? "..." : saved ? t("saved") : tCommon("save")}
      </button>
    </div>
  );
}
