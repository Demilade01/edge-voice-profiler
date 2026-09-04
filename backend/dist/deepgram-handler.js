"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepgramTTSHandler = exports.DeepgramSTTHandler = void 0;
const sdk_1 = require("@deepgram/sdk");
const wav_encoder_1 = require("./utils/wav-encoder");
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
    constructor(apiKey, logger) {
        this.apiKey = apiKey;
        this.logger = logger;
    }
    async synthesize(text, onChunk, onComplete) {
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
                const wavChunk = wav_encoder_1.WavEncoder.encodeWAV(pcmChunk, 16000, 1);
                this.logger.logEvent({
                    eventType: 'audio_encoded_to_wav',
                    timestamp: process.hrtime.bigint(),
                    metadata: { pcmSize: pcmChunk.length, wavSize: wavChunk.length },
                });
                onChunk(wavChunk);
            }
        }
        catch (error) {
            if (this.abortController?.signal.aborted) {
                console.log('🛑 TTS stream aborted');
                return;
            }
            console.error('❌ TTS Error:', error);
            throw error;
        }
        finally {
            this.reader = null;
            this.abortController = null;
        }
    }
    abort() {
        this.abortController?.abort();
        void this.reader?.cancel();
        this.reader = null;
    }
}
exports.DeepgramTTSHandler = DeepgramTTSHandler;
