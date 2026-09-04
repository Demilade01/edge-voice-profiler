export interface LatencyEvent {
  eventType:
    | 'client_audio_sent'
    | 'server_audio_received'
    | 'deepgram_stt_request_sent'
    | 'deepgram_stt_response_received'
    | 'llm_request_sent'
    | 'llm_response_received'
    | 'deepgram_tts_request_sent'
    | 'deepgram_tts_first_byte'
    | 'deepgram_tts_chunk_received'
    | 'audio_encoded_to_wav'
    | 'audio_chunk_sent_to_client'
    | 'barge_in_detected';
  timestamp: bigint;
  durationMs?: number;
  metadata?: {
    chunkSize?: number;
    transcript?: string;
    responseText?: string;
    audioChunkSize?: number;
    wavSize?: number;
    ttfb?: number;
    [key: string]: unknown;
  };
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
  startTime: bigint;
  endTime?: bigint;
  totalLatencyMs?: number;
  summary?: LatencySummary;
}

export interface AudioChunk {
  data: Buffer;
  timestamp: bigint;
}

export interface ClientMessage {
  type: 'audio' | 'start' | 'stop' | 'barge_in';
  turnId?: string;
  data?: ArrayBuffer | string;
  timestamp?: number;
}

export interface ServerMessage {
  type: 'audio' | 'transcript' | 'latency' | 'summary' | 'error' | 'status';
  data?: unknown;
  timestamp?: number;
}
