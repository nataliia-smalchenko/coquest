import api from "@/lib/api";
import type {
  ResourceSetCreate,
  ResourceSetListItem,
  ResourceSetResponse,
  ResourceSetUpdate,
} from "@/types/resource-set";

export const getResourceSets = async (): Promise<ResourceSetListItem[]> => {
  const { data } = await api.get("/api/resource-sets/");
  return data;
};

export const createResourceSet = async (
  payload: ResourceSetCreate,
): Promise<ResourceSetResponse> => {
  const { data } = await api.post("/api/resource-sets/", payload);
  return data;
};

export const getResourceSet = async (
  id: string,
): Promise<ResourceSetResponse> => {
  const { data } = await api.get(`/api/resource-sets/${id}`);
  return data;
};

export const updateResourceSet = async (
  id: string,
  payload: ResourceSetUpdate,
): Promise<ResourceSetResponse> => {
  const { data } = await api.put(`/api/resource-sets/${id}`, payload);
  return data;
};

export const deleteResourceSet = async (id: string): Promise<void> => {
  await api.delete(`/api/resource-sets/${id}`);
};

export const publishResourceSet = async (
  id: string,
): Promise<ResourceSetResponse> => {
  const { data } = await api.post(`/api/resource-sets/${id}/publish`);
  return data;
};

export const archiveResourceSet = async (
  id: string,
): Promise<ResourceSetResponse> => {
  const { data } = await api.post(`/api/resource-sets/${id}/archive`);
  return data;
};
