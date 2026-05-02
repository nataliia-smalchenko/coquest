export type ResourceSetStatus = "draft" | "published" | "archived";

export interface ResourceSetSettings {
  time_limit_minutes: number | null;
  random_order: boolean;
  max_grade: number | null;
}

export interface ResourceSetTranslation {
  language: string;
  title: string;
  description: string | null;
}

export interface ResourceSetResource {
  id: string;
  resource_id: string;
  order_index: number;
}

export interface ResourceSetResponse {
  id: string;
  slug: string;
  status: ResourceSetStatus;
  translations: ResourceSetTranslation[];
  settings: ResourceSetSettings | null;
  resources: ResourceSetResource[];
  created_at: string;
  updated_at: string;
}

export interface ResourceSetListItem {
  id: string;
  slug: string;
  status: ResourceSetStatus;
  title: string;
  created_at: string;
  resources_count: number;
}

// Request types

export interface ResourceSetSettingsCreate {
  time_limit_minutes?: number | null;
  random_order?: boolean;
  max_grade?: number | null;
}

export interface ResourceSetResourceItem {
  resource_id: string;
  order_index?: number;
}

export interface ResourceSetCreate {
  title: string;
  description?: string | null;
  language?: string;
  settings?: ResourceSetSettingsCreate;
  resources?: ResourceSetResourceItem[];
}

export interface ResourceSetUpdate {
  title?: string;
  description?: string | null;
  language?: string;
  settings?: ResourceSetSettingsCreate;
  resources?: ResourceSetResourceItem[];
}
