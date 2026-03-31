"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

export default function TeacherDashboardPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/teacher/resources");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
