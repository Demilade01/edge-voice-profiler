"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const ws_1 = require("ws");
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = require("./utils/logger");
const deepgram_handler_1 = require("./deepgram-handler");
const llm_handler_1 = require("./llm-handler");
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const openapi_1 = __importDefault(require("./openapi"));
dotenv_1.default.config();
const requiredEnvironment = ['DEEPGRAM_API_KEY', 'GROQ_API_KEY'];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
if (missingEnvironment.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnvironment.join(', ')}`);
}
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const wss = new ws_1.WebSocketServer({ server });
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use('/docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(openapi_1.default));
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});
app.get('/ready', (req, res) => {
    const checks = {
        deepgram: Boolean(process.env.DEEPGRAM_API_KEY),
        groq: Boolean(process.env.GROQ_API_KEY),
    };
    const ready = Object.values(checks).every(Boolean);
    res.status(ready ? 200 : 503).json({
        status: ready ? 'ready' : 'not_ready',
        checks,
    });
});
// Connection map to track active sessions
const connections = new Map();
console.log('🚀 Starting Voice Latency Profiler Backend...\n');
wss.on('connection', async (ws) => {
    const sessionId = `session_${Date.now()}`;
    console.log(`\n🔌 New WebSocket connection: ${sessionId}`);
    // Create logger with real-time event callback
    const logger = new logger_1.LatencyLogger((event) => {
        // Send each event to frontend in real-time
        sendMessage(ws, {
            type: 'latency',
            data: event,
            timestamp: Date.now(),
        });
    });
    const sttHandler = new deepgram_handler_1.DeepgramSTTHandler(process.env.DEEPGRAM_API_KEY, logger);
    const ttsHandler = new deepgram_handler_1.DeepgramTTSHandler(process.env.DEEPGRAM_API_KEY, logger);
    const llmHandler = new llm_handler_1.LLMHandler(process.env.GROQ_API_KEY, logger);
    connections.set(sessionId, {
        ws,
        logger,
        sttHandler,
        ttsHandler,
        llmHandler,
        isProcessing: false,
        activeTurnId: null,
        responseGeneration: 0,
    });
    await sttHandler.initialize(async (transcript) => {
        const conn = connections.get(sessionId);
        if (!conn || conn.isProcessing || !conn.activeTurnId)
            return;
        conn.isProcessing = true;
        const turnId = conn.activeTurnId;
        const responseId = ++conn.responseGeneration;
        const isCurrentResponse = () => (conn.isProcessing &&
            conn.activeTurnId === turnId &&
            conn.responseGeneration === responseId);
        try {
            sendMessage(ws, {
                type: 'transcript',
                data: transcript,
                timestamp: Date.now(),
            });
            const response = await llmHandler.getResponse(transcript);
            if (!isCurrentResponse())
                return;
            sendMessage(ws, {
                type: 'status',
                data: { event: 'agent_speaking_start', text: response, turnId, responseId },
                timestamp: Date.now(),
            });
            await ttsHandler.synthesize(response, (audioChunk) => {
                if (!isCurrentResponse())
                    return;
                logger.logEvent({
                    eventType: 'audio_chunk_sent_to_client',
                    timestamp: process.hrtime.bigint(),
                    metadata: { chunkSize: audioChunk.length },
                });
                if (ws.readyState === ws_1.WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'audio',
                        data: audioChunk.toString('base64'),
                        turnId,
                        responseId,
                        timestamp: Date.now(),
                    }));
                }
            }, () => {
                if (!isCurrentResponse())
                    return;
                sendMessage(ws, {
                    type: 'status',
                    data: { event: 'agent_speaking_end', turnId, responseId },
                    timestamp: Date.now(),
                });
                logger.endTurn();
                conn.isProcessing = false;
                conn.activeTurnId = null;
                const turnData = logger.getAllTurns()[logger.getAllTurns().length - 1];
                if (turnData?.summary) {
                    sendMessage(ws, {
                        type: 'summary',
                        data: turnData.summary,
                        timestamp: Date.now(),
                    });
                }
            });
        }
        catch (error) {
            if (!isCurrentResponse())
                return;
            console.error('❌ Error processing conversation:', error);
            conn.isProcessing = false;
            sendMessage(ws, {
                type: 'error',
                data: { message: 'Failed to process audio' },
                timestamp: Date.now(),
            });
        }
    });
    ws.on('message', async (data, isBinary) => {
        const conn = connections.get(sessionId);
        if (!conn)
            return;
        if (isBinary) {
            handleAudioFrame(conn, data);
            return;
        }
        try {
            const message = JSON.parse(data.toString());
            if (message.type === 'start') {
                console.log('▶️  Client started speaking');
                if (conn.activeTurnId)
                    return;
                const turnId = message.turnId || `turn_${Date.now()}`;
                conn.activeTurnId = turnId;
                conn.logger.startTurn(turnId);
            }
            else if (message.type === 'stop') {
                console.log('⏹️  Client stopped speaking');
                if (message.turnId && message.turnId !== conn.activeTurnId)
                    return;
            }
            else if (message.type === 'barge_in') {
                console.log('🛑 Barge-in detected by client');
                const cancelledResponseId = conn.responseGeneration;
                conn.responseGeneration++;
                conn.logger.logEvent({
                    eventType: 'barge_in_detected',
                    timestamp: process.hrtime.bigint(),
                });
                conn.ttsHandler.abort();
                conn.isProcessing = false;
                conn.activeTurnId = null;
                sendMessage(ws, {
                    type: 'status',
                    data: {
                        event: 'agent_speaking_end',
                        reason: 'barge_in',
                        responseId: cancelledResponseId,
                    },
                    timestamp: Date.now(),
                });
                const cancelledTurn = conn.logger.endTurn();
                if (cancelledTurn?.summary) {
                    sendMessage(ws, {
                        type: 'summary',
                        data: cancelledTurn.summary,
                        timestamp: Date.now(),
                    });
                }
            }
        }
        catch {
            sendMessage(ws, {
                type: 'error',
                data: { message: 'Invalid control message' },
                timestamp: Date.now(),
            });
        }
    });
    ws.on('close', () => {
        console.log(`\n🔌 WebSocket disconnected: ${sessionId}`);
        const conn = connections.get(sessionId);
        if (conn) {
            conn.sttHandler.close();
            console.log('\n📊 Exporting session logs...');
            const logs = conn.logger.exportToJSON();
            console.log('Session summary available for export');
            connections.delete(sessionId);
        }
    });
    ws.on('error', (error) => {
        console.error(`❌ WebSocket error for ${sessionId}:`, error);
    });
    sendMessage(ws, {
        type: 'status',
        data: { message: 'Connected to voice latency profiler', sessionId },
        timestamp: Date.now(),
    });
});
function sendMessage(ws, message) {
    if (ws.readyState === ws_1.WebSocket.OPEN) {
        ws.send(JSON.stringify(message, (_key, value) => typeof value === 'bigint' ? value.toString() : value));
    }
}
function handleAudioFrame(conn, packet) {
    if (packet.length < 16)
        return;
    const magic = packet.readUInt32BE(0);
    if (magic !== 0x56504631)
        return;
    const sequence = packet.readUInt32BE(4);
    const clientSentAt = packet.readDoubleBE(8);
    const audio = packet.subarray(16);
    conn.logger.logEvent({
        eventType: 'server_audio_received',
        timestamp: process.hrtime.bigint(),
        metadata: { chunkSize: audio.length, sequence, clientSentAt },
    });
    conn.sttHandler.sendAudio(audio);
}
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`\n✅ Server running on http://localhost:${PORT}`);
    console.log(`✅ WebSocket server ready on ws://localhost:${PORT}`);
    console.log('\n📊 Monitoring latency across the entire voice pipeline...\n');
});
process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    connections.forEach((conn) => {
        conn.sttHandler.close();
        conn.ws.close();
    });
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});
