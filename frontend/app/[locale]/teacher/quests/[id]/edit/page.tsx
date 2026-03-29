"use client";
import { use } from "react";
import QuestBuilder from "@/components/teacher/quests/QuestBuilder";

interface Props { params: Promise<{ id: string }> }

export default function EditQuestPage({ params }: Props) {
  const { id } = use(params);
  return <QuestBuilder mode="edit" questId={id} />;
}
