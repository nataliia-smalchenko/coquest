"use client";
import { use } from "react";
import ResourceSetBuilder from "@/components/teacher/resource-sets/ResourceSetBuilder";

interface Props {
  params: Promise<{ id: string }>;
}

export default function EditResourceSetPage({ params }: Props) {
  const { id } = use(params);
  return <ResourceSetBuilder mode="edit" resourceSetId={id} />;
}
