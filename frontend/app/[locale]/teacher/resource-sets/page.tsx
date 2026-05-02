import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ResourceSetList } from "@/components/teacher/resource-sets/ResourceSetList";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("resourceSets");
  return { title: t("title") };
}

export default function TeacherResourceSetsPage() {
  return <ResourceSetList />;
}
