import api from "@/lib/api";
import type {
  CloudinarySignatureResponse,
  FolderCreate,
  FolderResponse,
  QuestionCreate,
  QuestionResponse,
  ResourceCreate,
  ResourceDetailResponse,
  ResourceResponse,
  ResourceType,
  ResourceUpdate,
  TagCreate,
  TagResponse,
  TextContentCreate,
  TextContentResponse,
} from "@/types/resource";

// Folders
export const getFolders = async (): Promise<FolderResponse[]> => {
  const { data } = await api.get("/api/resources/folders");
  return data;
};

export const createFolder = async (
  payload: FolderCreate,
): Promise<FolderResponse> => {
  const { data } = await api.post("/api/resources/folders", payload);
  return data;
};

export const deleteFolder = async (id: string): Promise<void> => {
  await api.delete(`/api/resources/folders/${id}`);
};

// Tags
export const getTags = async (): Promise<TagResponse[]> => {
  const { data } = await api.get("/api/resources/tags");
  return data;
};

export const createTag = async (payload: TagCreate): Promise<TagResponse> => {
  const { data } = await api.post("/api/resources/tags", payload);
  return data;
};

export const deleteTag = async (id: string): Promise<void> => {
  await api.delete(`/api/resources/tags/${id}`);
};

// Resources
export interface ListResourcesParams {
  folder_id?: string | null;
  type?: ResourceType | null;
  tag_ids?: string[];
  search?: string;
  difficulty?: string | null;
  limit?: number;
  offset?: number;
}

export const getResources = async (
  params: ListResourcesParams = {},
): Promise<ResourceResponse[]> => {
  const { tag_ids, ...rest } = params;
  const query = Object.fromEntries(
    Object.entries(rest).filter(([_, v]) => v != null),
  );

  const { data } = await api.get("/api/resources/", {
    params: tag_ids?.length ? { ...query, tag_ids } : query,
    paramsSerializer: (p) =>
      Object.entries(p)
        .flatMap(([k, v]) =>
          Array.isArray(v)
            ? v.map((i) => `${k}=${encodeURIComponent(i)}`)
            : [`${k}=${encodeURIComponent(String(v))}`],
        )
        .join("&"),
  });
  return data;
};

export const createResource = async (
  payload: ResourceCreate,
): Promise<ResourceResponse> => {
  const { data } = await api.post("/api/resources/", payload);
  return data;
};

export const getResource = async (
  id: string,
): Promise<ResourceDetailResponse> => {
  const { data } = await api.get(`/api/resources/${id}`);
  return data;
};

export const updateResource = async (
  id: string,
  payload: ResourceUpdate,
): Promise<ResourceResponse> => {
  const { data } = await api.put(`/api/resources/${id}`, payload);
  return data;
};

export const deleteResource = async (id: string): Promise<void> => {
  await api.delete(`/api/resources/${id}`);
};

// ─── Content ──────────────────────────────────────────────────────────────────

export const upsertTextContent = async (
  id: string,
  payload: TextContentCreate,
): Promise<TextContentResponse> => {
  const { data } = await api.post(`/api/resources/${id}/text-content`, payload);
  return data;
};

export const upsertQuestion = async (
  id: string,
  payload: QuestionCreate,
): Promise<QuestionResponse> => {
  const { data } = await api.post(`/api/resources/${id}/question`, payload);
  return data;
};

// ─── Cloudinary ───────────────────────────────────────────────────────────────

export const getUploadSignature = async (
  folder: string,
): Promise<CloudinarySignatureResponse> => {
  const { data } = await api.post("/api/resources/upload-image-signature", {
    folder,
  });
  return data;
};
