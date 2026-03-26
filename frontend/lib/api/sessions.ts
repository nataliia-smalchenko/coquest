import api from "@/lib/api"
import type {
  GameInfoResponse,
  GameSession,
  SessionListItem,
  SessionPlayer,
  SessionProgress,
  TeacherMonitorResponse,
} from "@/types/session"
import type { ResourceDetailResponse } from "@/types/resource"

export async function listSessions(): Promise<SessionListItem[]> {
  const { data } = await api.get("/api/sessions/")
  return data
}

export async function createSession(data: {
  quest_id: string
  scheduled_at?: string
  ends_at?: string
  max_participants?: number
}): Promise<GameSession> {
  const { data: res } = await api.post("/api/sessions/", data)
  return res
}

export async function getSessionByCode(code: string): Promise<GameSession> {
  const { data } = await api.get(`/api/sessions/code/${code}`)
  return data
}

export async function joinSession(data: {
  session_code: string
  guest_name?: string
}): Promise<SessionPlayer> {
  const { data: res } = await api.post("/api/sessions/join", data)
  return res
}

export async function startSession(id: string): Promise<GameSession> {
  const { data } = await api.post(`/api/sessions/${id}/start`)
  return data
}

export async function stopSession(id: string): Promise<GameSession> {
  const { data } = await api.post(`/api/sessions/${id}/stop`)
  return data
}

export async function deleteSession(id: string): Promise<void> {
  await api.delete(`/api/sessions/${id}`)
}

export async function getMonitor(id: string): Promise<TeacherMonitorResponse> {
  const { data } = await api.get(`/api/sessions/${id}/monitor`)
  return data
}

export async function getGameInfo(
  session_id: string,
  guest_token: string,
  lang = "uk",
): Promise<GameInfoResponse> {
  const { data } = await api.get(`/api/sessions/${session_id}/game-info`, {
    params: { lang },
    headers: { "X-Guest-Token": guest_token },
  })
  return data
}

export async function getMyProgress(
  session_id: string,
  guest_token: string,
): Promise<SessionProgress[]> {
  const { data } = await api.get(`/api/sessions/${session_id}/my-progress`, {
    headers: { "X-Guest-Token": guest_token },
  })
  return data
}

export async function getProgressResource(
  progress_id: string,
  guest_token: string,
): Promise<ResourceDetailResponse> {
  const { data } = await api.get(`/api/sessions/progress/${progress_id}/resource`, {
    headers: { "X-Guest-Token": guest_token },
  })
  return data
}

export async function submitAnswer(
  progress_id: string,
  answer: unknown,
  guest_token: string,
): Promise<SessionProgress> {
  const { data } = await api.post(
    `/api/sessions/progress/${progress_id}/answer`,
    { answer },
    { headers: { "X-Guest-Token": guest_token } },
  )
  return data
}

export async function markViewed(
  progress_id: string,
  guest_token: string,
): Promise<SessionProgress> {
  const { data } = await api.post(
    `/api/sessions/progress/${progress_id}/viewed`,
    {},
    { headers: { "X-Guest-Token": guest_token } },
  )
  return data
}

export async function reviewAnswer(
  progress_id: string,
  score: number,
  feedback?: string,
): Promise<SessionProgress> {
  const { data } = await api.post(`/api/sessions/progress/${progress_id}/review`, {
    score,
    feedback,
  })
  return data
}

export async function getResults(
  session_id: string,
  guest_token: string,
): Promise<unknown> {
  const { data } = await api.get(`/api/sessions/${session_id}/results`, {
    params: { guest_token },
  })
  return data
}

export async function updateGuestName(
  session_id: string,
  player_id: string,
  guest_name: string | null,
): Promise<SessionPlayer> {
  const { data } = await api.patch(
    `/api/sessions/${session_id}/players/${player_id}/guest-name`,
    { guest_name },
  )
  return data
}

export async function deletePlayer(session_id: string, player_id: string): Promise<void> {
  await api.delete(`/api/sessions/${session_id}/players/${player_id}`)
}
