export type SessionStatus =
  | "waiting"
  | "active"
  | "completed"
  | "stopped"
  | "scheduled";
export type PlayerStatus = "waiting" | "playing" | "finished";
export type ProgressStatus = "assigned" | "viewed" | "answered";

export interface SessionPlayer {
  id: string;
  session_id: string;
  user_id: string | null;
  guest_name: string | null;
  display_name: string;
  avatar_color: string;
  status: PlayerStatus;
  joined_at: string;
  started_at: string | null;
  finished_at: string | null;
  guest_token?: string;
  team_id: string | null;
}

export interface TeamPlayer {
  id: string;
  display_name: string;
  avatar_color: string;
  status: PlayerStatus;
}

export interface Team {
  id: string;
  session_id: string;
  status: "waiting" | "active" | "completed";
  players: TeamPlayer[];
  created_at: string;
  started_at: string | null;
  hint_player_id: string | null;
}

export interface SessionProgress {
  id: string;
  session_id: string;
  player_id: string;
  resource_id: string | null;
  map_object_id: string | null;
  status: ProgressStatus;
  step_order: number | null;
  score: number | null;
  answer: unknown | null;
  requires_review: boolean;
  assigned_at: string;
  completed_at: string | null;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  player_id: string;
  display_name: string;
  message: string;
  created_at: string;
}

export interface GameSession {
  id: string;
  quest_id: string;
  session_code: string;
  name: string | null;
  status: SessionStatus;
  started_at: string | null;
  ends_at: string | null;
  scheduled_at: string | null;
  max_players: number;
  allow_solo_in_team: boolean;
  random_teams: boolean;
  show_feedback_after_answer: boolean;
  show_score_after: boolean;
  show_correct_answers: boolean;
  keep_completed_in_materials: boolean;
  created_at: string;
  players: SessionPlayer[];
}

export interface SessionListItem {
  id: string;
  quest_id: string;
  session_code: string;
  name: string | null;
  status: SessionStatus;
  started_at: string | null;
  ends_at: string | null;
  scheduled_at: string | null;
  max_players: number;
  players_count: number;
  created_at: string;
}

export interface PlayerProgressSummary {
  player: SessionPlayer;
  completed: number;
  total: number;
  score: number | null;
  total_score: number | null;
  max_score: number | null;
  grade: number | null;
  max_grade: number | null;
  pending_review: number;
  correct: number;
  incorrect: number;
  viewed: number;
}

export interface TeacherMonitorResponse {
  session: GameSession;
  players_progress: PlayerProgressSummary[];
}

export interface SessionSettingsPublic {
  time_limit_minutes: number | null;
  keep_completed_in_materials: boolean;
  show_feedback_after_answer: boolean;
  show_score_after: boolean;
  show_correct_answers: boolean;
}

export interface GameInfoResponse {
  quest_title: string;
  map_slug: string | null;
  settings: SessionSettingsPublic | null;
}

export interface GameSessionDetailResponse extends GameSession {
  progress: SessionProgress[];
  chat_messages: ChatMessage[];
}

export interface QuestionResultOption {
  id: string;
  text: string;
  image_url?: string | null;
  is_correct: boolean;
}

export interface QuestionResultData {
  body: string;
  question_type: string;
  options: QuestionResultOption[];
  correct_answers: string[];
  points: number;
}

export interface SessionProgressResult extends SessionProgress {
  resource_title: string | null;
  question: QuestionResultData | null;
}

export interface GameSessionResultResponse extends GameSession {
  progress: SessionProgressResult[];
  chat_messages: ChatMessage[];
  max_grade: number | null;
  total_question_points: number | null;
}

export interface SessionStorageData {
  guest_token: string;
  player_id: string;
  session_code?: string;
  display_name?: string;
}

export interface SessionCreate {
  quest_id: string;
  name?: string;
  max_players?: number;
  allow_solo_in_team?: boolean;
  random_teams?: boolean;
  show_feedback_after_answer?: boolean;
  show_score_after?: boolean;
  show_correct_answers?: boolean;
  keep_completed_in_materials?: boolean;
  scheduled_at?: string;
  ends_at?: string;
}

export interface SessionUpdate {
  name?: string | null;
  show_feedback_after_answer?: boolean;
  show_score_after?: boolean;
  show_correct_answers?: boolean;
  keep_completed_in_materials?: boolean;
  ends_at?: string | null;
  scheduled_at?: string | null;
}
