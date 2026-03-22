import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ResourceLibrary } from "@/components/teacher/resources/ResourceLibrary";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("resources");
  return { title: t("title") };
}

export default function ResourcesPage() {
  return <ResourceLibrary />;
}
