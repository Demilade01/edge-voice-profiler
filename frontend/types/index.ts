export interface LatencyEvent {
  eventType: string;
  timestamp: string;
  durationMs?: number;
  metadata?: {
    chunkSize?: number;
    transcript?: string;
    responseText?: string;
    [key: string]: any;
  };
}

export interface ConversationTurn {
  turnId: string;
  events: LatencyEvent[];
  startTime: string;
  endTime?: string;
  totalLatencyMs?: number;
}

export interface ServerMessage {
  type: 'status' | 'transcript' | 'audio' | 'latency' | 'error';
  data?: any;
  timestamp?: number;
}

export interface ClientMessage {
  type: 'start' | 'stop' | 'barge_in';
  timestamp: number;
}
