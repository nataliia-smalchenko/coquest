/**
 * WebSocket message type definitions — mirrors backend app/schemas/websocket.py
 *
 * Teacher → Server (outgoing from teacher client):
 *   start_run  — trigger run start
 *   stop_run   — trigger run stop
 *   review_answer — grade an open-ended answer
 *
 * Player → Server (outgoing from player client):
 *   submit_answer, mark_viewed, chat_message
 *
 * Server → Client (incoming on both sides):
 *   connected, run_started, run_stopped, run_completed, …
 */

// Teacher → Server
export interface StartRunMessage {
  type: "start_run";
}

export interface StopRunMessage {
  type: "stop_run";
}

export interface ReviewAnswerMessage {
  type: "review_answer";
  progress_id: string;
  /** Normalised score in [0, 1] */
  score: number;
  feedback?: string;
}

export type TeacherOutgoingMessage =
  | StartRunMessage
  | StopRunMessage
  | ReviewAnswerMessage;

// Player → Server
export interface SingleChoiceAnswer {
  option_id: string;
}
export interface MultipleChoiceAnswer {
  option_ids: string[];
}
export interface TextAnswer {
  text: string;
}

export type PlayerAnswer =
  | SingleChoiceAnswer
  | MultipleChoiceAnswer
  | TextAnswer;

export interface SubmitAnswerMessage {
  type: "submit_answer";
  progress_id: string;
  answer: PlayerAnswer;
}

export interface MarkViewedMessage {
  type: "mark_viewed";
  progress_id: string;
}

export interface ChatOutgoingMessage {
  type: "chat_message";
  message: string;
}

export type PlayerOutgoingMessage =
  | SubmitAnswerMessage
  | MarkViewedMessage
  | ChatOutgoingMessage;
