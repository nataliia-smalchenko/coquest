export type SessionStatus = 'waiting' | 'active' | 'completed' | 'stopped' | 'scheduled'
export type PlayerStatus = 'waiting' | 'playing' | 'finished'
export type ProgressStatus = 'assigned' | 'viewed' | 'answered'

export interface SessionPlayer {
  id: string
  session_id: string
  user_id: string | null
  guest_name: string | null
  display_name: string
  avatar_color: string
  status: PlayerStatus
  joined_at: string
  finished_at: string | null
  guest_token?: string
}

export interface SessionProgress {
  id: string
  session_id: string
  player_id: string
  resource_id: string | null
  map_object_id: string | null
  status: ProgressStatus
  score: number | null
  answer: unknown | null
  requires_review: boolean
  assigned_at: string
  completed_at: string | null
}

export interface ChatMessage {
  id: string
  session_id: string
  player_id: string
  display_name: string
  message: string
  created_at: string
}

export interface GameSession {
  id: string
  quest_id: string
  session_code: string
  status: SessionStatus
  started_at: string | null
  ends_at: string | null
  scheduled_at: string | null
  max_players: number
  created_at: string
  players: SessionPlayer[]
}

export interface SessionListItem {
  id: string
  quest_id: string
  session_code: string
  status: SessionStatus
  started_at: string | null
  ends_at: string | null
  scheduled_at: string | null
  max_players: number
  players_count: number
  created_at: string
}

export interface PlayerProgressSummary {
  player: SessionPlayer
  completed: number
  total: number
  score: number | null
  pending_review: number
}

export interface TeacherMonitorResponse {
  session: GameSession
  players_progress: PlayerProgressSummary[]
}

export interface QuestSettingsPublic {
  time_limit_minutes: number | null
  keep_completed_in_materials: boolean
  show_score_after: boolean
  show_correct_answers: boolean
}

export interface GameInfoResponse {
  quest_title: string
  map_slug: string | null
  settings: QuestSettingsPublic | null
}

export interface GameSessionDetailResponse extends GameSession {
  progress: SessionProgress[]
  chat_messages: ChatMessage[]
}

export interface SessionStorageData {
  guest_token: string
  player_id: string
}
