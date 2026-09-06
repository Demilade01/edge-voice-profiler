"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepgramTTSHandler = exports.DeepgramSTTHandler = void 0;
const sdk_1 = require("@deepgram/sdk");
class DeepgramSTTHandler {
    deepgram;
    connection;
    logger;
    onTranscriptCallback;
    constructor(apiKey, logger) {
        this.deepgram = (0, sdk_1.createClient)(apiKey);
        this.logger = logger;
    }
    async initialize(onTranscript) {
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
    setupEventHandlers() {
        this.connection.on(sdk_1.LiveTranscriptionEvents.Open, () => {
            console.log('✅ Deepgram STT connection opened');
        });
        this.connection.on(sdk_1.LiveTranscriptionEvents.Transcript, (data) => {
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
        this.connection.on(sdk_1.LiveTranscriptionEvents.Error, (error) => {
            console.error('❌ Deepgram STT error:', error);
        });
        this.connection.on(sdk_1.LiveTranscriptionEvents.Close, () => {
            console.log('🔌 Deepgram STT connection closed');
        });
    }
    sendAudio(audioData) {
        if (this.connection) {
            this.logger.logEvent({
                eventType: 'deepgram_stt_request_sent',
                timestamp: process.hrtime.bigint(),
                metadata: { chunkSize: audioData.length },
            });
            this.connection.send(audioData);
        }
    }
    close() {
        if (this.connection) {
            this.connection.finish();
        }
    }
}
exports.DeepgramSTTHandler = DeepgramSTTHandler;
class DeepgramTTSHandler {
    apiKey;
    logger;
    abortController = null;
    reader = null;
    requestId = 0;
    constructor(apiKey, logger) {
        this.apiKey = apiKey;
        this.logger = logger;
    }
    async synthesize(text, onChunk, onComplete) {
        console.log(`🔊 Starting TTS synthesis for: "${text}"`);
        const requestId = ++this.requestId;
        const isCurrentRequest = () => this.requestId === requestId;
        this.logger.logEvent({
            eventType: 'deepgram_tts_request_sent',
            timestamp: process.hrtime.bigint(),
            metadata: { text },
        });
        const url = 'https://api.deepgram.com/v1/speak?model=aura-asteria-en&encoding=linear16&sample_rate=16000';
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
        let chunkIndex = 0;
        const flushChunk = () => {
            if (!isCurrentRequest() || pendingPcm.length === 0)
                return;
            this.logger.logEvent({
                eventType: 'audio_chunk_sent_to_client',
                timestamp: process.hrtime.bigint(),
                metadata: { chunkSize: pendingPcm.length, chunkIndex },
            });
            // Send raw PCM bytes directly — no WAV wrapping
            onChunk(pendingPcm);
            chunkIndex++;
            pendingPcm = Buffer.alloc(0);
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
                    if (!isCurrentRequest())
                        return;
                    // Flush any remaining PCM data
                    flushChunk();
                    console.log(`✅ TTS streaming completed (${chunkIndex} chunks sent)`);
                    if (isCurrentRequest())
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
                // Accumulate raw PCM and flush when we have enough
                pendingPcm = Buffer.concat([pendingPcm, Buffer.from(value)]);
                if (pendingPcm.length >= CHUNK_THRESHOLD) {
                    flushChunk();
                }
            }
        }
        catch (error) {
            if (!isCurrentRequest() || abortController.signal.aborted) {
                console.log('🛑 TTS stream aborted');
                return;
            }
            console.error('❌ TTS Error:', error);
            throw error;
        }
        finally {
            if (isCurrentRequest()) {
                this.reader = null;
                this.abortController = null;
            }
        }
    }
    abort() {
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
exports.DeepgramTTSHandler = DeepgramTTSHandler;
