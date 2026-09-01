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
    | 'audio_chunk_sent_to_client'
    | 'barge_in_detected';
  timestamp: bigint;
  durationMs?: number;
  metadata?: {
    chunkSize?: number;
    transcript?: string;
    responseText?: string;
    audioChunkSize?: number;
    ttfb?: number;
    [key: string]: any;
  };
}

export interface ConversationTurn {
  turnId: string;
  events: LatencyEvent[];
  startTime: bigint;
  endTime?: bigint;
  totalLatencyMs?: number;
}

export interface AudioChunk {
  data: Buffer;
  timestamp: bigint;
}

export interface ClientMessage {
  type: 'audio' | 'start' | 'stop' | 'barge_in';
  data?: ArrayBuffer | string;
  timestamp?: number;
}

export interface ServerMessage {
  type: 'audio' | 'transcript' | 'latency' | 'error' | 'status';
  data?: any;
  timestamp?: number;
}
