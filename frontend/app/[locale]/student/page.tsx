"use client";

import { BookOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

export default function StudentPage() {
  const t = useTranslations("student");
  const { user, isLoading, fetchUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    if (!isLoading && user && user.role === "teacher") {
      router.replace("/teacher/resources");
    }
  }, [user, isLoading, router]);

  return (
    <div className="max-w-lg mx-auto px-4 py-20 flex flex-col items-center text-center gap-5">
      <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center">
        <BookOpen size={32} className="text-blue-500" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
      <p className="text-gray-500 text-sm leading-relaxed">{t("comingSoon")}</p>
    </div>
  );
}
