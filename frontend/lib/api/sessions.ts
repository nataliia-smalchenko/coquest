import api from "@/lib/api";
import type {
  GameInfoResponse,
  GameSession,
  SessionCreate,
  SessionListItem,
  SessionPlayer,
  SessionProgress,
  Team,
  TeacherMonitorResponse,
} from "@/types/session";
import type { ResourceDetailPublicResponse } from "@/types/resource";

export async function listSessions(): Promise<SessionListItem[]> {
  const { data } = await api.get("/api/sessions/");
  return data;
}

export async function createSession(data: SessionCreate): Promise<GameSession> {
  const { data: res } = await api.post("/api/sessions/", data);
  return res;
}

export async function getSessionByCode(code: string): Promise<GameSession> {
  const { data } = await api.get(`/api/sessions/code/${code}`);
  return data;
}

export async function joinSession(data: {
  session_code: string;
  guest_name?: string;
}): Promise<SessionPlayer> {
  const { data: res } = await api.post("/api/sessions/join", data);
  return res;
}

export async function startSession(id: string): Promise<GameSession> {
  const { data } = await api.post(`/api/sessions/${id}/start`);
  return data;
}

export async function playerStartSession(
  id: string,
  guestToken: string,
): Promise<GameSession> {
  const { data } = await api.post(
    `/api/sessions/${id}/player-start`,
    {},
    { headers: { "X-Guest-Token": guestToken } },
  );
  return data;
}

export async function getTeam(
  sessionId: string,
  teamId: string,
  guestToken: string,
): Promise<Team> {
  const { data } = await api.get(`/api/sessions/${sessionId}/teams/${teamId}`, {
    headers: { "X-Guest-Token": guestToken },
  });
  return data;
}

export async function startTeam(
  sessionId: string,
  teamId: string,
  guestToken: string,
): Promise<Team> {
  const { data } = await api.post(
    `/api/sessions/${sessionId}/teams/${teamId}/start`,
    {},
    { headers: { "X-Guest-Token": guestToken } },
  );
  return data;
}

export async function playerTimeout(
  id: string,
  guestToken: string,
): Promise<void> {
  await api.post(
    `/api/sessions/${id}/player-timeout`,
    {},
    { headers: { "X-Guest-Token": guestToken } },
  );
}

export async function stopSession(id: string): Promise<GameSession> {
  const { data } = await api.post(`/api/sessions/${id}/stop`);
  return data;
}

export async function deleteSession(id: string): Promise<void> {
  await api.delete(`/api/sessions/${id}`);
}

export async function getMonitor(id: string): Promise<TeacherMonitorResponse> {
  const { data } = await api.get(`/api/sessions/${id}/monitor`);
  return data;
}

export async function getGameInfo(
  session_id: string,
  guest_token: string,
  lang = "uk",
): Promise<GameInfoResponse> {
  const { data } = await api.get(`/api/sessions/${session_id}/game-info`, {
    params: { lang },
    headers: { "X-Guest-Token": guest_token },
  });
  return data;
}

export async function getMyProgress(
  session_id: string,
  guest_token: string,
): Promise<SessionProgress[]> {
  const { data } = await api.get(`/api/sessions/${session_id}/my-progress`, {
    headers: { "X-Guest-Token": guest_token },
  });
  return data;
}

export async function getProgressResource(
  progress_id: string,
  guest_token: string,
): Promise<ResourceDetailPublicResponse> {
  const { data } = await api.get(
    `/api/sessions/progress/${progress_id}/resource`,
    {
      headers: { "X-Guest-Token": guest_token },
    },
  );
  return data;
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
  );
  return data;
}

export async function markViewed(
  progress_id: string,
  guest_token: string,
): Promise<SessionProgress> {
  const { data } = await api.post(
    `/api/sessions/progress/${progress_id}/viewed`,
    {},
    { headers: { "X-Guest-Token": guest_token } },
  );
  return data;
}

export async function reviewAnswer(
  progress_id: string,
  score: number,
  feedback?: string,
): Promise<SessionProgress> {
  const { data } = await api.post(
    `/api/sessions/progress/${progress_id}/review`,
    {
      score,
      feedback,
    },
  );
  return data;
}

export async function getPlayerProgressDetail(
  session_id: string,
  player_id: string,
): Promise<import("@/types/session").SessionProgressResult[]> {
  const { data } = await api.get(
    `/api/sessions/${session_id}/players/${player_id}/progress`,
  );
  return data;
}

export async function getResults(
  session_id: string,
  guest_token: string,
): Promise<import("@/types/session").GameSessionResultResponse> {
  const { data } = await api.get(`/api/sessions/${session_id}/results`, {
    params: { guest_token },
  });
  return data;
}

export async function updateGuestName(
  session_id: string,
  player_id: string,
  guest_name: string | null,
): Promise<SessionPlayer> {
  const { data } = await api.patch(
    `/api/sessions/${session_id}/players/${player_id}/guest-name`,
    { guest_name },
  );
  return data;
}

export async function deletePlayer(
  session_id: string,
  player_id: string,
): Promise<void> {
  await api.delete(`/api/sessions/${session_id}/players/${player_id}`);
}
