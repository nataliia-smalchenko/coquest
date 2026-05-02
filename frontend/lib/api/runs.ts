import api from "@/lib/api";
import type { ResourceDetailPublicResponse } from "@/types/resource";
import type {
  GameInfoResponse,
  GameRun,
  RunCreate,
  RunListItem,
  RunPlayer,
  RunProgress,
  TeacherMonitorResponse,
  Team,
} from "@/types/run";

export async function listRuns(): Promise<RunListItem[]> {
  const { data } = await api.get("/api/runs/");
  return data;
}

export async function createRun(data: RunCreate): Promise<GameRun> {
  const { data: res } = await api.post("/api/runs/", data);
  return res;
}

export async function getRunByCode(code: string): Promise<GameRun> {
  const { data } = await api.get(`/api/runs/code/${code}`);
  return data;
}

export async function joinRun(data: {
  join_code: string;
  guest_name?: string;
}): Promise<RunPlayer> {
  const { data: res } = await api.post("/api/runs/join", data);
  return res;
}

export async function rejoinRun(
  join_code: string,
  guest_token: string,
): Promise<RunPlayer> {
  const { data: res } = await api.post("/api/runs/rejoin", {
    join_code,
    guest_token,
  });
  return res;
}

export async function leaveTeam(
  runId: string,
  guestToken: string,
): Promise<{ player: RunPlayer; team: import("@/types/run").Team }> {
  const { data } = await api.post(
    `/api/runs/${runId}/teams/leave`,
    {},
    { headers: { "X-Guest-Token": guestToken } },
  );
  return data;
}

export async function startRun(id: string): Promise<GameRun> {
  const { data } = await api.post(`/api/runs/${id}/start`);
  return data;
}

export async function playerStartRun(
  id: string,
  guestToken: string,
): Promise<GameRun> {
  const { data } = await api.post(
    `/api/runs/${id}/player-start`,
    {},
    { headers: { "X-Guest-Token": guestToken } },
  );
  return data;
}

export async function getTeam(
  runId: string,
  teamId: string,
  guestToken: string,
): Promise<Team> {
  const { data } = await api.get(`/api/runs/${runId}/teams/${teamId}`, {
    headers: { "X-Guest-Token": guestToken },
  });
  return data;
}

export async function startTeam(
  runId: string,
  teamId: string,
  guestToken: string,
): Promise<Team> {
  const { data } = await api.post(
    `/api/runs/${runId}/teams/${teamId}/start`,
    {},
    { headers: { "X-Guest-Token": guestToken } },
  );
  return data;
}

export async function getTeamStepInfo(
  runId: string,
  teamId: string,
  guestToken: string,
): Promise<{
  resource_type: string;
  active_player_id: string | null;
  hint_player_id: string | null;
  map_object_id: string | null;
  step_order: number | null;
} | null> {
  try {
    const { data } = await api.get(
      `/api/runs/${runId}/teams/${teamId}/step-info`,
      { headers: { "X-Guest-Token": guestToken } },
    );
    return data && Object.keys(data).length > 0 ? data : null;
  } catch {
    return null;
  }
}

export async function playerTimeout(
  id: string,
  guestToken: string,
): Promise<void> {
  await api.post(
    `/api/runs/${id}/player-timeout`,
    {},
    { headers: { "X-Guest-Token": guestToken } },
  );
}

export async function stopRun(id: string): Promise<GameRun> {
  const { data } = await api.post(`/api/runs/${id}/stop`);
  return data;
}

export async function deleteRun(id: string): Promise<void> {
  await api.delete(`/api/runs/${id}`);
}

export async function getMonitor(id: string): Promise<TeacherMonitorResponse> {
  const { data } = await api.get(`/api/runs/${id}/monitor`);
  return data;
}

export async function getGameInfo(
  run_id: string,
  guest_token: string,
  lang = "uk",
): Promise<GameInfoResponse> {
  const { data } = await api.get(`/api/runs/${run_id}/game-info`, {
    params: { lang },
    headers: { "X-Guest-Token": guest_token },
  });
  return data;
}

export async function getMyProgress(
  run_id: string,
  guest_token: string,
): Promise<RunProgress[]> {
  const { data } = await api.get(`/api/runs/${run_id}/my-progress`, {
    headers: { "X-Guest-Token": guest_token },
  });
  return data;
}

export async function getTeamProgress(
  run_id: string,
  guest_token: string,
): Promise<RunProgress[]> {
  const { data } = await api.get(`/api/runs/${run_id}/team-progress`, {
    headers: { "X-Guest-Token": guest_token },
  });
  return data;
}

export async function getProgressResource(
  progress_id: string,
  guest_token: string,
): Promise<ResourceDetailPublicResponse> {
  const { data } = await api.get(`/api/runs/progress/${progress_id}/resource`, {
    headers: { "X-Guest-Token": guest_token },
  });
  return data;
}

export async function submitAnswer(
  progress_id: string,
  answer: unknown,
  guest_token: string,
): Promise<RunProgress> {
  const { data } = await api.post(
    `/api/runs/progress/${progress_id}/answer`,
    { answer },
    { headers: { "X-Guest-Token": guest_token } },
  );
  return data;
}

export async function markViewed(
  progress_id: string,
  guest_token: string,
): Promise<RunProgress> {
  const { data } = await api.post(
    `/api/runs/progress/${progress_id}/viewed`,
    {},
    { headers: { "X-Guest-Token": guest_token } },
  );
  return data;
}

export async function reviewAnswer(
  progress_id: string,
  score: number,
  feedback?: string,
): Promise<RunProgress> {
  const { data } = await api.post(`/api/runs/progress/${progress_id}/review`, {
    score,
    feedback,
  });
  return data;
}

export async function getPlayerProgressDetail(
  run_id: string,
  player_id: string,
): Promise<import("@/types/run").RunProgressResult[]> {
  const { data } = await api.get(
    `/api/runs/${run_id}/players/${player_id}/progress`,
  );
  return data;
}

export async function getResults(
  run_id: string,
  guest_token: string,
): Promise<import("@/types/run").GameRunResultResponse> {
  const { data } = await api.get(`/api/runs/${run_id}/results`, {
    params: { guest_token },
  });
  return data;
}

export async function updateGuestName(
  run_id: string,
  player_id: string,
  guest_name: string | null,
): Promise<RunPlayer> {
  const { data } = await api.patch(
    `/api/runs/${run_id}/players/${player_id}/guest-name`,
    { guest_name },
  );
  return data;
}

export async function deletePlayer(
  run_id: string,
  player_id: string,
): Promise<void> {
  await api.delete(`/api/runs/${run_id}/players/${player_id}`);
}

export async function updateRunSettings(
  run_id: string,
  data: import("@/types/run").RunUpdate,
): Promise<GameRun> {
  const { data: res } = await api.patch(`/api/runs/${run_id}/settings`, data);
  return res;
}

export async function restartRun(run_id: string): Promise<GameRun> {
  const { data } = await api.post(`/api/runs/${run_id}/restart`);
  return data;
}

export async function advanceStep(run_id: string): Promise<void> {
  await api.post(`/api/runs/${run_id}/advance-step`);
}

export async function getCurrentStep(run_id: string): Promise<{
  current_step_order: number;
  total_steps: number;
}> {
  const { data } = await api.get(`/api/runs/${run_id}/current-step`);
  return data;
}
