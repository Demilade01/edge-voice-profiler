"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LatencyLogger = void 0;
class LatencyLogger {
    turns = new Map();
    currentTurnId = null;
    eventCallback;
    constructor(eventCallback) {
        this.eventCallback = eventCallback;
    }
    startTurn(turnId) {
        this.currentTurnId = turnId;
        this.turns.set(turnId, {
            turnId,
            events: [],
            startTime: process.hrtime.bigint(),
        });
        this.logToConsole('info', `🎯 Started conversation turn: ${turnId}`);
    }
    logEvent(event, callback) {
        if (!this.currentTurnId) {
            return;
        }
        const turn = this.turns.get(this.currentTurnId);
        if (turn) {
            turn.events.push(event);
            // Calculate duration from previous event
            if (turn.events.length > 1) {
                const prevEvent = turn.events[turn.events.length - 2];
                const durationNs = event.timestamp - prevEvent.timestamp;
                event.durationMs = Number(durationNs) / 1_000_000;
            }
            const isHighFrequencyAudioEvent = event.eventType === 'server_audio_received' ||
                event.eventType === 'deepgram_stt_request_sent';
            if (!isHighFrequencyAudioEvent) {
                this.logToConsole('event', this.formatEvent(event));
            }
            // Send event to frontend in real-time via constructor callback
            if (this.eventCallback) {
                this.eventCallback(event);
            }
            // Also support passed callback for backwards compatibility
            if (callback) {
                callback(event);
            }
        }
    }
    endTurn() {
        if (!this.currentTurnId)
            return null;
        const turn = this.turns.get(this.currentTurnId);
        if (turn) {
            turn.endTime = process.hrtime.bigint();
            turn.totalLatencyMs = Number(turn.endTime - turn.startTime) / 1_000_000;
            turn.summary = this.createSummary(turn);
            this.logToConsole('info', `✅ Completed turn ${this.currentTurnId}: ${turn.totalLatencyMs.toFixed(2)}ms total`);
            this.logLatencyBreakdown(turn);
            this.currentTurnId = null;
            return turn;
        }
        return null;
    }
    formatEvent(event) {
        const emoji = this.getEventEmoji(event.eventType);
        const duration = event.durationMs ? ` (+${event.durationMs.toFixed(2)}ms)` : '';
        const metadata = event.metadata ? ` | ${JSON.stringify(event.metadata)}` : '';
        return `${emoji} ${event.eventType}${duration}${metadata}`;
    }
    getEventEmoji(eventType) {
        const emojiMap = {
            client_audio_sent: '📤',
            server_audio_received: '📥',
            deepgram_stt_request_sent: '🎤',
            deepgram_stt_response_received: '📝',
            llm_request_sent: '🤖',
            llm_response_received: '💬',
            deepgram_tts_request_sent: '🔊',
            deepgram_tts_first_byte: '⚡',
            deepgram_tts_chunk_received: '🎵',
            audio_chunk_sent_to_client: '📡',
            barge_in_detected: '🛑',
        };
        return emojiMap[eventType] || '•';
    }
    logLatencyBreakdown(turn) {
        console.log('\n┌─────────────────────────────────────────────────────┐');
        console.log('│           LATENCY BREAKDOWN                         │');
        console.log('├─────────────────────────────────────────────────────┤');
        const breakdown = this.calculateBreakdown(turn);
        Object.entries(breakdown).forEach(([phase, ms]) => {
            const bar = '█'.repeat(Math.floor(ms / 10));
            console.log(`│ ${phase.padEnd(25)} ${ms.toFixed(2).padStart(8)}ms ${bar}`);
        });
        console.log('├─────────────────────────────────────────────────────┤');
        console.log(`│ TOTAL LATENCY: ${turn.totalLatencyMs?.toFixed(2)}ms`.padEnd(54) + '│');
        console.log('└─────────────────────────────────────────────────────┘\n');
    }
    calculateBreakdown(turn) {
        const breakdown = {
            'Transport (Client→Server)': 0,
            'STT Processing': 0,
            'LLM Processing': 0,
            'TTS TTFB': 0,
            'TTS Streaming': 0,
            'Transport (Server→Client)': 0,
        };
        const events = turn.events;
        for (let i = 1; i < events.length; i++) {
            const curr = events[i];
            const prev = events[i - 1];
            const duration = curr.durationMs || 0;
            if (prev.eventType === 'client_audio_sent' && curr.eventType === 'server_audio_received') {
                breakdown['Transport (Client→Server)'] += duration;
            }
            else if (prev.eventType === 'deepgram_stt_request_sent' && curr.eventType === 'deepgram_stt_response_received') {
                breakdown['STT Processing'] += duration;
            }
            else if (prev.eventType === 'llm_request_sent' && curr.eventType === 'llm_response_received') {
                breakdown['LLM Processing'] += duration;
            }
            else if (prev.eventType === 'deepgram_tts_request_sent' && curr.eventType === 'deepgram_tts_first_byte') {
                breakdown['TTS TTFB'] += duration;
            }
            else if (prev.eventType === 'deepgram_tts_first_byte' && curr.eventType === 'deepgram_tts_chunk_received') {
                breakdown['TTS Streaming'] += duration;
            }
            else if (prev.eventType === 'audio_chunk_sent_to_client') {
                breakdown['Transport (Server→Client)'] += duration;
            }
        }
        return breakdown;
    }
    logToConsole(level, message) {
        const timestamp = new Date().toISOString();
        const prefix = level === 'error' ? '❌' : level === 'info' ? 'ℹ️ ' : '  ';
        console.log(`[${timestamp}] ${prefix} ${message}`);
    }
    getTurn(turnId) {
        return this.turns.get(turnId);
    }
    getAllTurns() {
        return Array.from(this.turns.values());
    }
    createSummary(turn) {
        const first = (eventType) => turn.events.find((event) => event.eventType === eventType);
        const delta = (from, to) => {
            if (!from || !to)
                return undefined;
            return Number(to.timestamp - from.timestamp) / 1_000_000;
        };
        const firstServerAudio = first('server_audio_received');
        const sttRequest = first('deepgram_stt_request_sent');
        const sttResponse = first('deepgram_stt_response_received');
        const llmRequest = first('llm_request_sent');
        const llmResponse = first('llm_response_received');
        const ttsRequest = first('deepgram_tts_request_sent');
        const ttsFirstByte = first('deepgram_tts_first_byte');
        const audioSent = first('audio_chunk_sent_to_client');
        return {
            turnId: turn.turnId,
            clientToServerMs: firstServerAudio ? Number(firstServerAudio.timestamp - turn.startTime) / 1_000_000 : undefined,
            sttMs: delta(sttRequest, sttResponse),
            llmMs: delta(llmRequest, llmResponse),
            ttsTimeToFirstByteMs: delta(ttsRequest, ttsFirstByte),
            serverToClientMs: delta(ttsFirstByte, audioSent),
            firstAudioMs: audioSent ? Number(audioSent.timestamp - turn.startTime) / 1_000_000 : undefined,
            totalTurnMs: turn.totalLatencyMs,
            cancelled: turn.events.some((event) => event.eventType === 'barge_in_detected'),
        };
    }
    exportToJSON() {
        return JSON.stringify(this.getAllTurns(), (key, value) => typeof value === 'bigint' ? value.toString() : value, 2);
    }
}
exports.LatencyLogger = LatencyLogger;
