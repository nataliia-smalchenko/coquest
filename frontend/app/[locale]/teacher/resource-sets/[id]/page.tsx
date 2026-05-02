"use client";
import { use } from "react";
import ResourceSetPreview from "@/components/teacher/resource-sets/ResourceSetPreview";

interface Props {
  params: Promise<{ id: string }>;
}

export default function ResourceSetPreviewPage({ params }: Props) {
  const { id } = use(params);
  return <ResourceSetPreview resourceSetId={id} />;
}
