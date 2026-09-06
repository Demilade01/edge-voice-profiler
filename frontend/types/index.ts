export interface LatencyEvent {
  eventType: string;
  timestamp: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface LatencySummary {
  turnId: string;
  clientToServerMs?: number;
  sttMs?: number;
  llmMs?: number;
  ttsTimeToFirstByteMs?: number;
  serverToClientMs?: number;
  firstAudioMs?: number;
  totalTurnMs?: number;
  cancelled?: boolean;
}

export interface ConversationTurn {
  turnId: string;
  events: LatencyEvent[];
  startTime: string;
  endTime?: string;
  totalLatencyMs?: number;
}

export interface ServerMessage {
  type: 'status' | 'transcript' | 'audio' | 'latency' | 'summary' | 'error';
  data?: unknown;
  timestamp?: number;
  turnId?: string;
  responseId?: number;
}

export interface ResponseMessageData {
  turnId?: string;
  responseId: number;
}

export interface ClientMessage {
  type: 'start' | 'stop' | 'barge_in';
  turnId?: string;
  timestamp: number;
}
