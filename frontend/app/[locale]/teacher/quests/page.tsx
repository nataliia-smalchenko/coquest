import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { QuestList } from "@/components/teacher/quests/QuestList";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("quests");
  return { title: t("title") };
}

export default function TeacherQuestsPage() {
  return <QuestList />;
}
