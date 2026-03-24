export interface MapObjectHint {
  id: string;
  language: string;
  hint_text: string;
}

export interface MapObject {
  id: string;
  slug: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  is_interactive: boolean;
  order_index: number;
  hints: MapObjectHint[];
}

export interface MapTranslation {
  language: string;
  name: string;
  description: string | null;
}

export interface MapResponse {
  id: string;
  slug: string;
  original_width: number;
  original_height: number;
  landscape_only_mobile: boolean;
  translations: MapTranslation[];
  objects: MapObject[];
}

export interface MapListItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}
