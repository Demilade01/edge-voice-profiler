import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { LatencyLogger } from './utils/logger';

export class DeepgramSTTHandler {
  private deepgram: any;
  private connection: any;
  private logger: LatencyLogger;
  private onTranscriptCallback?: (transcript: string) => void;

  constructor(apiKey: string, logger: LatencyLogger) {
    this.deepgram = createClient(apiKey);
    this.logger = logger;
  }

  async initialize(onTranscript: (transcript: string) => void): Promise<void> {
    this.onTranscriptCallback = onTranscript;

    // Configure Deepgram for low-latency streaming
    this.connection = this.deepgram.listen.live({
      model: 'nova-2',
      language: 'en-US',
      smart_format: true,
      interim_results: false,
      endpointing: 500,
      punctuate: true,
      encoding: 'linear16',
      sample_rate: 16000,
      channels: 1,
    });

    this.setupEventHandlers();

    console.log('🎤 Deepgram STT connection initialized');
  }

  private setupEventHandlers(): void {
    this.connection.on(LiveTranscriptionEvents.Open, () => {
      console.log('✅ Deepgram STT connection opened');
    });

    this.connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
      const transcript = data.channel?.alternatives?.[0]?.transcript;

      if (transcript && transcript.trim().length > 0 && data.speech_final) {
          this.logger.logEvent({
            eventType: 'deepgram_stt_response_received',
            timestamp: process.hrtime.bigint(),
            metadata: { transcript, confidence: data.channel?.alternatives?.[0]?.confidence },
          });

          console.log(`📝 Transcript: "${transcript}"`);

          if (this.onTranscriptCallback) {
            this.onTranscriptCallback(transcript);
          }
        }
    });

    this.connection.on(LiveTranscriptionEvents.Error, (error: any) => {
      console.error('❌ Deepgram STT error:', {
        type: error?.type,
        message: error?.message,
        code: error?.code,
        reason: error?.reason,
        data: error?.data,
        readyState: this.connection?.getReadyState?.(),
      });
    });

    this.connection.on(LiveTranscriptionEvents.Close, () => {
      console.log('🔌 Deepgram STT connection closed');
    });
  }

  sendAudio(audioData: Buffer): void {
    if (this.connection) {
      this.logger.logEvent({
        eventType: 'deepgram_stt_request_sent',
        timestamp: process.hrtime.bigint(),
        metadata: { chunkSize: audioData.length },
      });

      this.connection.send(audioData);
    }
  }

  close(): void {
    if (this.connection) {
      this.connection.finish();
    }
  }
}

export class DeepgramTTSHandler {
  private apiKey: string;
  private logger: LatencyLogger;
  private abortController: AbortController | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private requestId = 0;

  constructor(apiKey: string, logger: LatencyLogger) {
    this.apiKey = apiKey;
    this.logger = logger;
  }

  async synthesize(
    text: string,
    onChunk: (chunk: Buffer) => void,
    onComplete: () => void
  ): Promise<void> {
    console.log(`🔊 Starting TTS synthesis for: "${text}"`);

    const requestId = ++this.requestId;
    const isCurrentRequest = () => this.requestId === requestId;

    this.logger.logEvent({
      eventType: 'deepgram_tts_request_sent',
      timestamp: process.hrtime.bigint(),
      metadata: { text },
    });

    const url = 'https://api.deepgram.com/v1/speak?model=aura-asteria-en&encoding=linear16&sample_rate=16000&container=none';

    const startTime = process.hrtime.bigint();
    let firstByteReceived = false;
    const abortController = new AbortController();
    this.abortController = abortController;

    // Stream raw PCM directly to the client — no WAV encoding.
    // The client's AudioWorklet ring buffer consumes continuous PCM samples,
    // so there are no chunk boundaries, no WAV headers, and no decode artifacts.
    // We flush every ~8000 bytes (~250ms of 16kHz/16bit mono audio).
    const CHUNK_THRESHOLD = 8000;
    let pendingPcm = Buffer.alloc(0);
    let initialAudio = Buffer.alloc(0);
    let streamFormatChecked = false;
    let chunkIndex = 0;

    const flushChunk = () => {
      if (!isCurrentRequest() || pendingPcm.length < 2) return;

      const sendLength = pendingPcm.length - (pendingPcm.length % 2);
      const audioChunk = pendingPcm.subarray(0, sendLength);
      pendingPcm = pendingPcm.subarray(sendLength);

      this.logger.logEvent({
        eventType: 'audio_chunk_sent_to_client',
        timestamp: process.hrtime.bigint(),
        metadata: { chunkSize: audioChunk.length, chunkIndex },
      });

      // Send raw PCM bytes directly — no WAV wrapping
      onChunk(audioChunk);
      chunkIndex++;
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: abortController.signal,
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.status} ${response.statusText}`);
      }

      this.reader = response.body?.getReader() || null;
      if (!this.reader) {
        throw new Error('No response body reader available');
      }
      const reader = this.reader;

      while (true) {
        if (!isCurrentRequest()) {
          console.log('🛑 TTS delivery stopped (abort flag)');
          return;
        }

        const { done, value } = await reader.read();

        if (done) {
          if (!isCurrentRequest()) return;
          // Flush any remaining PCM data
          flushChunk();

          console.log(`✅ TTS streaming completed (${chunkIndex} chunks sent)`);
          if (pendingPcm.length === 1) {
            console.warn('⚠️ Dropping incomplete final PCM byte');
            pendingPcm = Buffer.alloc(0);
          }
          if (isCurrentRequest()) onComplete();
          break;
        }

        if (!firstByteReceived) {
          const ttfb = Number(process.hrtime.bigint() - startTime) / 1_000_000;
          this.logger.logEvent({
            eventType: 'deepgram_tts_first_byte',
            timestamp: process.hrtime.bigint(),
            metadata: { ttfb },
          });
          console.log(`⚡ TTS TTFB: ${ttfb.toFixed(2)}ms`);
          firstByteReceived = true;
        }

        this.logger.logEvent({
          eventType: 'deepgram_tts_chunk_received',
          timestamp: process.hrtime.bigint(),
          metadata: { audioChunkSize: value.length },
        });

        let pcmChunk = Buffer.from(value);
        if (!streamFormatChecked) {
          initialAudio = Buffer.concat([initialAudio, pcmChunk]);
          const isWav = initialAudio.subarray(0, 4).toString('ascii') === 'RIFF';

          if (isWav) {
            const dataMarker = initialAudio.indexOf(Buffer.from('data'), 12);
            if (dataMarker === -1 || initialAudio.length < dataMarker + 8) {
              continue;
            }

            pcmChunk = initialAudio.subarray(dataMarker + 8);
            console.warn('⚠️ TTS returned WAV framing; stripped header before sending PCM');
          } else {
            pcmChunk = initialAudio;
          }

          initialAudio = Buffer.alloc(0);
          streamFormatChecked = true;
        }

        // Accumulate raw PCM and flush when we have enough
        pendingPcm = Buffer.concat([pendingPcm, pcmChunk]);
        if (pendingPcm.length >= CHUNK_THRESHOLD) {
          flushChunk();
        }
      }
    } catch (error) {
      if (!isCurrentRequest() || abortController.signal.aborted) {
        console.log('🛑 TTS stream aborted');
        return;
      }
      console.error('❌ TTS Error:', error);
      throw error;
    } finally {
      if (isCurrentRequest()) {
        this.reader = null;
        this.abortController = null;
      }
    }
  }

  abort(): void {
    this.requestId++;
    this.abortController?.abort();
    const reader = this.reader;
    this.reader = null;
    if (reader) {
      void reader.cancel().catch(() => {
      });
    }
  }
}
