import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { LatencyLogger } from './utils/logger';
import { WavEncoder } from './utils/wav-encoder';

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

      if (transcript && transcript.trim().length > 0) {
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
      console.error('❌ Deepgram STT error:', error);
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

    this.logger.logEvent({
      eventType: 'deepgram_tts_request_sent',
      timestamp: process.hrtime.bigint(),
      metadata: { text },
    });

    const url = 'https://api.deepgram.com/v1/speak?model=aura-asteria-en&encoding=linear16&sample_rate=16000';

    const startTime = process.hrtime.bigint();
    let firstByteReceived = false;
    this.abortController = new AbortController();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: this.abortController.signal,
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.status} ${response.statusText}`);
      }

      this.reader = response.body?.getReader() || null;
      if (!this.reader) {
        throw new Error('No response body reader available');
      }

      while (true) {
        const { done, value } = await this.reader.read();

        if (done) {
          console.log('✅ TTS streaming completed');

          onComplete();
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

        // Wrap each PCM chunk independently so the browser can begin playback immediately.
        const pcmChunk = Buffer.from(value);
        const wavChunk = WavEncoder.encodeWAV(pcmChunk, 16000, 1);
        this.logger.logEvent({
          eventType: 'audio_encoded_to_wav',
          timestamp: process.hrtime.bigint(),
          metadata: { pcmSize: pcmChunk.length, wavSize: wavChunk.length },
        });
        onChunk(wavChunk);
      }
    } catch (error) {
      if (this.abortController?.signal.aborted) {
        console.log('🛑 TTS stream aborted');
        return;
      }
      console.error('❌ TTS Error:', error);
      throw error;
    } finally {
      this.reader = null;
      this.abortController = null;
    }
  }

  abort(): void {
    this.abortController?.abort();
    void this.reader?.cancel();
    this.reader = null;
  }
}
