import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import QuestBuilder from "@/components/teacher/quests/QuestBuilder";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("quests.builder");
  return { title: t("title") };
}

export default function NewQuestPage() {
  return <QuestBuilder mode="create" />;
}
