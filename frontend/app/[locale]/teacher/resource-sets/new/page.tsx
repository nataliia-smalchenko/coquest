import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import ResourceSetBuilder from "@/components/teacher/resource-sets/ResourceSetBuilder";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("resourceSets.builder");
  return { title: t("title") };
}

export default function NewResourceSetPage() {
  return <ResourceSetBuilder mode="create" />;
}
