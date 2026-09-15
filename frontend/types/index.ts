export interface LatencyEvent {
  eventType: string;
  timestamp: string;
  elapsedMs?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}
