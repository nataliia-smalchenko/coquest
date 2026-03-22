export type ResourceType = "text" | "question";
export type QuestionType = "single" | "multiple" | "short" | "open";

export interface FolderResponse {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  children_count: number;
}

export interface TagResponse {
  id: string;
  name: string;
  color: string;
}

export interface ResourceResponse {
  id: string;
  type: ResourceType;
  title: string;
  folder_id: string | null;
  tags: TagResponse[];
  created_at: string;
  updated_at: string;
}

export interface QuestionOption {
  id: string;
  text: string;
  is_correct: boolean;
}

export interface CloudinaryImage {
  url: string;
  public_id: string;
  width?: number;
  height?: number;
  size_bytes?: number;
}

export interface TextContentResponse {
  id: string;
  resource_id: string;
  body: Record<string, any>;
  images: CloudinaryImage[];
}

export interface QuestionResponse {
  id: string;
  resource_id: string;
  question_type: QuestionType;
  body: string;
  explanation: string | null;
  options: QuestionOption[];
  correct_answers: string[];
  requires_review: boolean;
}

export interface ResourceDetailResponse extends ResourceResponse {
  text_content: TextContentResponse | null;
  question: QuestionResponse | null;
}

export interface CloudinarySignatureResponse {
  signature: string;
  timestamp: number;
  api_key: string;
  cloud_name: string;
  folder: string;
  upload_preset: string;
}

// Request types
export interface FolderCreate {
  name: string;
  parent_id?: string | null;
}

export interface TagCreate {
  name: string;
  color?: string;
}

export interface ResourceCreate {
  type: ResourceType;
  title: string;
  folder_id?: string | null;
  tag_ids?: string[];
}

export interface ResourceUpdate {
  title?: string;
  folder_id?: string | null;
  tag_ids?: string[];
}

export interface TextContentCreate {
  body: Record<string, unknown>;
  images?: CloudinaryImage[];
}

export interface QuestionCreate {
  question_type: QuestionType;
  body: string;
  explanation?: string | null;
  options: QuestionOption[];
  correct_answers: string[];
  requires_review?: boolean;
}
