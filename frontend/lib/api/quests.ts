import api from "@/lib/api";
import type {
  QuestCreate,
  QuestListItem,
  QuestResponse,
  QuestUpdate,
} from "@/types/quest";

export const getQuests = async (): Promise<QuestListItem[]> => {
  const { data } = await api.get("/api/quests/");
  return data;
};

export const createQuest = async (
  payload: QuestCreate,
): Promise<QuestResponse> => {
  const { data } = await api.post("/api/quests/", payload);
  return data;
};

export const getQuest = async (id: string): Promise<QuestResponse> => {
  const { data } = await api.get(`/api/quests/${id}`);
  return data;
};

export const updateQuest = async (
  id: string,
  payload: QuestUpdate,
): Promise<QuestResponse> => {
  const { data } = await api.put(`/api/quests/${id}`, payload);
  return data;
};

export const deleteQuest = async (id: string): Promise<void> => {
  await api.delete(`/api/quests/${id}`);
};

export const publishQuest = async (id: string): Promise<QuestResponse> => {
  const { data } = await api.post(`/api/quests/${id}/publish`);
  return data;
};

export const archiveQuest = async (id: string): Promise<QuestResponse> => {
  const { data } = await api.post(`/api/quests/${id}/archive`);
  return data;
};
