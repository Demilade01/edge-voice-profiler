import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { LatencyLogger } from './utils/logger';
import { DeepgramSTTHandler, DeepgramTTSHandler } from './deepgram-handler';
import { LLMHandler } from './llm-handler';
import { ClientMessage } from './types';

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Connection map to track active sessions
const connections = new Map<string, {
  ws: WebSocket;
  logger: LatencyLogger;
  sttHandler: DeepgramSTTHandler;
  ttsHandler: DeepgramTTSHandler;
  llmHandler: LLMHandler;
  isProcessing: boolean;
}>();

console.log('🚀 Starting Voice Latency Profiler Backend...\n');

wss.on('connection', async (ws: WebSocket) => {
  const sessionId = `session_${Date.now()}`;
  console.log(`\n🔌 New WebSocket connection: ${sessionId}`);

  const logger = new LatencyLogger();
  const sttHandler = new DeepgramSTTHandler(process.env.DEEPGRAM_API_KEY!, logger);
  const ttsHandler = new DeepgramTTSHandler(process.env.DEEPGRAM_API_KEY!, logger);
  const llmHandler = new LLMHandler(process.env.ANTHROPIC_API_KEY!, logger);

  connections.set(sessionId, {
    ws,
    logger,
    sttHandler,
    ttsHandler,
    llmHandler,
    isProcessing: false,
  });

  await sttHandler.initialize(async (transcript: string) => {
    const conn = connections.get(sessionId);
    if (!conn || conn.isProcessing) return;

    conn.isProcessing = true;

    try {
      sendMessage(ws, {
        type: 'transcript',
        data: transcript,
        timestamp: Date.now(),
      });

      const response = await llmHandler.getResponse(transcript);

      await ttsHandler.synthesize(
        response,
        (audioChunk: Buffer) => {
          logger.logEvent({
            eventType: 'audio_chunk_sent_to_client',
            timestamp: process.hrtime.bigint(),
            metadata: { chunkSize: audioChunk.length },
          });

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'audio',
              data: audioChunk.toString('base64'),
              timestamp: Date.now(),
            }));
          }
        },
        () => {
          logger.endTurn();
          conn.isProcessing = false;

          const turnData = logger.getAllTurns()[logger.getAllTurns().length - 1];
          if (turnData) {
            sendMessage(ws, {
              type: 'latency',
              data: turnData,
              timestamp: Date.now(),
            });
          }
        }
      );
    } catch (error) {
      console.error('❌ Error processing conversation:', error);
      conn.isProcessing = false;
      sendMessage(ws, {
        type: 'error',
        data: { message: 'Failed to process audio' },
        timestamp: Date.now(),
      });
    }
  });

  ws.on('message', async (data: Buffer) => {
    const conn = connections.get(sessionId);
    if (!conn) return;

    try {
      const message = JSON.parse(data.toString()) as ClientMessage;

      if (message.type === 'start') {
        console.log('▶️  Client started speaking');
        const turnId = `turn_${Date.now()}`;
        conn.logger.startTurn(turnId);
      } else if (message.type === 'stop') {
        console.log('⏹️  Client stopped speaking');
      } else if (message.type === 'barge_in') {
        console.log('🛑 Barge-in detected by client');
        conn.logger.logEvent({
          eventType: 'barge_in_detected',
          timestamp: process.hrtime.bigint(),
        });
        conn.isProcessing = false;
      }
    } catch {
      conn.logger.logEvent({
        eventType: 'server_audio_received',
        timestamp: process.hrtime.bigint(),
        metadata: { chunkSize: data.length },
      });

      conn.sttHandler.sendAudio(data);
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

function sendMessage(ws: WebSocket, message: any): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
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
