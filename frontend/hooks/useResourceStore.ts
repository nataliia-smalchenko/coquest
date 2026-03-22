"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  deleteResource as apiDeleteResource,
  getFolders,
  getResources,
  getTags,
  createTag as apiCreateTag,
  deleteTag as apiDeleteTag,
} from "@/lib/api/resources";
import type {
  FolderResponse,
  ResourceResponse,
  TagResponse,
  TagCreate,
} from "@/types/resource";

interface ResourceStore {
  folders: FolderResponse[];
  tags: TagResponse[];
  resources: ResourceResponse[];

  selectedFolderId: string | null;
  selectedTagIds: string[];
  searchQuery: string;

  isLoading: boolean;

  offset: number;
  hasMore: boolean;
  isLoadingMore: boolean;

  fetchFolders: () => Promise<void>;
  fetchTags: () => Promise<void>;
  fetchResources: () => Promise<void>;
  loadMoreResources: () => Promise<void>;

  setSelectedFolder: (id: string | null) => void;
  toggleSelectedTag: (id: string) => void;
  clearFilters: () => void;
  setSearchQuery: (query: string) => void;

  deleteResource: (id: string) => Promise<void>;
  createTag: (payload: TagCreate) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;
}

const LIMIT = 50;

export const useResourceStore = create<ResourceStore>()(
  persist(
    (set, get) => ({
  folders: [],
  tags: [],
  resources: [],
  selectedFolderId: null,
  selectedTagIds: [],
  searchQuery: "",
  isLoading: false,
  offset: 0,
  hasMore: true,
  isLoadingMore: false,

  fetchFolders: async () => {
    try {
      const folders = await getFolders();
      set({ folders });
    } catch (err) {
      console.error("fetchFolders failed", err);
    }
  },

  fetchTags: async () => {
    try {
      const tags = await getTags();
      set({ tags });
    } catch (err) {
      console.error("fetchTags failed", err);
    }
  },

  fetchResources: async () => {
    const { selectedFolderId, selectedTagIds, searchQuery } = get();
    set({ isLoading: true, offset: 0, hasMore: true });

    try {
      const resources = await getResources({
        folder_id: selectedFolderId,
        tag_ids: selectedTagIds.length ? selectedTagIds : undefined,
        search: searchQuery || undefined,
        limit: LIMIT,
        offset: 0,
      });

      set({
        resources,
        isLoading: false,
        hasMore: resources.length === LIMIT,
        offset: LIMIT,
      });
    } catch (err) {
      console.error("fetchResources failed", err);
      set({ isLoading: false });
    }
  },

  loadMoreResources: async () => {
    const {
      selectedFolderId,
      selectedTagIds,
      searchQuery,
      offset,
      hasMore,
      isLoadingMore,
      resources: currentResources,
    } = get();

    if (!hasMore || isLoadingMore) return;

    set({ isLoadingMore: true });

    try {
      const newResources = await getResources({
        folder_id: selectedFolderId,
        tag_ids: selectedTagIds.length ? selectedTagIds : undefined,
        search: searchQuery || undefined,
        limit: LIMIT,
        offset: offset,
      });

      set({
        resources: [...currentResources, ...newResources],
        isLoadingMore: false,
        hasMore: newResources.length === LIMIT,
        offset: offset + LIMIT,
      });
    } catch (err) {
      console.error("loadMoreResources failed", err);
      set({ isLoadingMore: false });
    }
  },

  setSelectedFolder: (id) => {
    set({ selectedFolderId: id });
    get().fetchResources();
  },

  clearFilters: () => {
    set({ selectedFolderId: null, selectedTagIds: [] });
    get().fetchResources();
  },

  toggleSelectedTag: (id) => {
    const { selectedTagIds } = get();
    const next = selectedTagIds.includes(id)
      ? selectedTagIds.filter((t) => t !== id)
      : [...selectedTagIds, id];
    set({ selectedTagIds: next });
    get().fetchResources();
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  deleteResource: async (id) => {
    try {
      await apiDeleteResource(id);
      set((state) => ({
        resources: state.resources.filter((r) => r.id !== id),
        offset: state.offset > 0 ? state.offset - 1 : 0,
      }));
    } catch (err) {
      console.error("deleteResource failed", err);
      throw err;
    }
  },

  createTag: async (payload) => {
    try {
      const newTag = await apiCreateTag(payload);
      set((state) => ({ tags: [...state.tags, newTag] }));
    } catch (err) {
      console.error("createTag failed", err);
      throw err;
    }
  },

  deleteTag: async (id) => {
    try {
      await apiDeleteTag(id);
      set((state) => ({
        tags: state.tags.filter((t) => t.id !== id),
        selectedTagIds: state.selectedTagIds.filter((tid) => tid !== id),
      }));
      get().fetchResources();
    } catch (err) {
      console.error("deleteTag failed", err);
      throw err;
    }
  },
    }),
    {
      name: "resource-filters",
      partialize: (state) => ({
        selectedFolderId: state.selectedFolderId,
        selectedTagIds: state.selectedTagIds,
      }),
    },
  ),
);
