export type QuestStatus = "draft" | "published" | "archived";

export interface QuestSettings {
  time_limit_minutes: number | null;
  random_order: boolean;
  show_all_texts: boolean;
  keep_completed_in_materials: boolean;
  show_score_after: boolean;
  show_correct_answers: boolean;
  distribute_texts_in_team: boolean;
}

export interface QuestTranslation {
  language: string;
  title: string;
  description: string | null;
}

export interface QuestResource {
  id: string;
  resource_id: string;
  order_index: number;
}

export interface QuestResponse {
  id: string;
  slug: string;
  status: QuestStatus;
  map_id: string | null;
  max_players: number;
  translations: QuestTranslation[];
  settings: QuestSettings | null;
  resources: QuestResource[];
  created_at: string;
  updated_at: string;
}

export interface QuestListItem {
  id: string;
  slug: string;
  status: QuestStatus;
  map_id: string | null;
  map_name: string | null;
  title: string;
  created_at: string;
  resources_count: number;
}

// Request types

export interface QuestSettingsCreate {
  time_limit_minutes?: number | null;
  random_order?: boolean;
  show_all_texts?: boolean;
  keep_completed_in_materials?: boolean;
  show_score_after?: boolean;
  show_correct_answers?: boolean;
  distribute_texts_in_team?: boolean;
}

export interface QuestResourceItem {
  resource_id: string;
  order_index?: number;
}

export interface QuestCreate {
  map_id: string;
  title: string;
  description?: string | null;
  language?: string;
  max_players?: number;
  settings?: QuestSettingsCreate;
  resources?: QuestResourceItem[];
}

export interface QuestUpdate {
  map_id?: string | null;
  title?: string;
  description?: string | null;
  language?: string;
  max_players?: number;
  settings?: QuestSettingsCreate;
  resources?: QuestResourceItem[];
}
