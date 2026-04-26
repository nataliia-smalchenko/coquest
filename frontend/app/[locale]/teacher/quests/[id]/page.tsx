"use client";
import { use } from "react";
import QuestPreview from "@/components/teacher/quests/QuestPreview";

interface Props {
  params: Promise<{ id: string }>;
}

export default function QuestPreviewPage({ params }: Props) {
  const { id } = use(params);
  return <QuestPreview questId={id} />;
}
