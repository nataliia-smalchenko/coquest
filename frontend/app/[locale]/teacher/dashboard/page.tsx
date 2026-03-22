import { getTranslations } from "next-intl/server";
import { LayoutDashboard } from "lucide-react";

export default async function TeacherDashboardPage() {
  const t = await getTranslations("dashboard.teacher");

  return (
    <div
      style={{
        maxWidth: "900px",
        margin: "0 auto",
        padding: "48px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "16px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: "64px",
          height: "64px",
          borderRadius: "16px",
          backgroundColor: "#eff6ff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <LayoutDashboard size={32} color="#2563eb" />
      </div>
      <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#111827", margin: 0 }}>
        {t("title")}
      </h1>
      <p style={{ fontSize: "15px", color: "#6b7280", margin: 0 }}>
        {t("comingSoon")}
      </p>
    </div>
  );
}
