import api from "@/lib/api";
import type { MapListItem, MapResponse } from "@/types/map";

export const getMaps = async (locale: string): Promise<MapListItem[]> => {
  const { data } = await api.get("/api/maps/", {
    headers: { "Accept-Language": locale },
  });
  return data;
};

export const getMap = async (slug: string): Promise<MapResponse> => {
  const { data } = await api.get(`/api/maps/${slug}`);
  return data;
};
