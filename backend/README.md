# Voice Latency Profiler - Backend

## Overview

Node.js WebSocket server that handles the entire voice processing pipeline with microsecond-level latency tracking.

## Architecture

```
Client Audio → WebSocket → Deepgram STT → Claude LLM → Deepgram Aura TTS → Client
                  ↓              ↓              ↓              ↓              ↓
              Timestamp      Timestamp      Timestamp      Timestamp      Timestamp
```

## Features

- **WebSocket Server**: Real-time bidirectional audio streaming
- **Deepgram STT**: Streaming speech-to-text with live transcription
- **Claude LLM**: Conversational AI via Anthropic API (seekai.cc endpoint)
- **Deepgram Aura TTS**: HTTP streaming text-to-speech with TTFB tracking
- **Latency Logger**: Comprehensive event logging with `process.hrtime.bigint()` precision
- **Session Management**: Independent session tracking per WebSocket connection

## Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment Variables

Create a `.env` file:

```bash
cp .env.example .env
```

Add your API keys:

```env
DEEPGRAM_API_KEY=your_deepgram_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
PORT=8080
NODE_ENV=development
```

### 3. Build

```bash
npm run build
```

### 4. Run

**Development (with hot reload):**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

## API Endpoints

### HTTP Endpoints

- `GET /health` - Health check endpoint

### WebSocket

- `ws://localhost:8080` - Main WebSocket connection

## WebSocket Protocol

### Client → Server Messages

**Start Speaking:**
```json
{
  "type": "start",
  "timestamp": 1234567890
}
```

**Stop Speaking:**
```json
{
  "type": "stop",
  "timestamp": 1234567890
}
```

**Barge-in (interrupt agent):**
```json
{
  "type": "barge_in",
  "timestamp": 1234567890
}
```

**Audio Data:**
- Raw binary audio chunks (PCM 16-bit, 16kHz, mono)

### Server → Client Messages

**Connection Status:**
```json
{
  "type": "status",
  "data": {
    "message": "Connected to voice latency profiler",
    "sessionId": "session_1234567890"
  },
  "timestamp": 1234567890
}
```

**Transcript:**
```json
{
  "type": "transcript",
  "data": "User said this",
  "timestamp": 1234567890
}
```

**Audio Chunk:**
```json
{
  "type": "audio",
  "data": "base64_encoded_audio_data",
  "timestamp": 1234567890
}
```

**Latency Data:**
```json
{
  "type": "latency",
  "data": {
    "turnId": "turn_1234567890",
    "events": [...],
    "totalLatencyMs": 542.15
  },
  "timestamp": 1234567890
}
```

**Error:**
```json
{
  "type": "error",
  "data": {
    "message": "Error description"
  },
  "timestamp": 1234567890
}
```

## Latency Events Tracked

| Event Type | Description |
|------------|-------------|
| `server_audio_received` | Audio chunk arrives at server |
| `deepgram_stt_request_sent` | Audio forwarded to Deepgram |
| `deepgram_stt_response_received` | Transcript received from Deepgram |
| `llm_request_sent` | Transcript sent to Claude |
| `llm_response_received` | Response received from Claude |
| `deepgram_tts_request_sent` | Text sent to Deepgram TTS |
| `deepgram_tts_first_byte` | First audio byte (TTFB) |
| `deepgram_tts_chunk_received` | Each TTS chunk received |
| `audio_chunk_sent_to_client` | Audio chunk sent to client |
| `barge_in_detected` | User interrupted agent |

## Project Structure

```
backend/
├── src/
│   ├── server.ts              # Main WebSocket server
│   ├── deepgram-handler.ts    # STT & TTS handlers
│   ├── llm-handler.ts          # Claude LLM integration
│   ├── types/
│   │   └── index.ts           # TypeScript interfaces
│   └── utils/
│       └── logger.ts          # Latency logging system
├── dist/                      # Compiled JavaScript
├── package.json
├── tsconfig.json
└── .env
```

## Console Output

The server logs real-time events with emojis for easy monitoring:

```
🚀 Starting Voice Latency Profiler Backend...

✅ Server running on http://localhost:8080
✅ WebSocket server ready on ws://localhost:8080

📊 Monitoring latency across the entire voice pipeline...

🔌 New WebSocket connection: session_1234567890
🎤 Deepgram STT connection initialized
▶️  Client started speaking
📥 server_audio_received (+0.00ms)
📝 Transcript: "Hello, how are you?"
🤖 LLM processing: "Hello, how are you?"
💬 LLM response: "I'm doing well, thank you! How can I help you today?"
🔊 Starting TTS synthesis
⚡ TTS TTFB: 142.35ms
🎵 deepgram_tts_chunk_received (+15.23ms)
📡 audio_chunk_sent_to_client (+1.45ms)

┌─────────────────────────────────────────────────────┐
│           LATENCY BREAKDOWN                         │
├─────────────────────────────────────────────────────┤
│ Transport (Client→Server) 45.23ms ████
│ STT Processing            156.78ms ███████████████
│ LLM Processing            234.56ms ███████████████████████
│ TTS TTFB                  142.35ms ██████████████
│ TTS Streaming              89.12ms ████████
│ Transport (Server→Client)  12.34ms █
├─────────────────────────────────────────────────────┤
│ TOTAL LATENCY: 680.38ms                             │
└─────────────────────────────────────────────────────┘
```

## Next Steps

- Connect frontend client for full voice loop
- Test under network degradation (3G throttling)
- Export latency data for analysis
- Deploy to production environment

## Technologies

- **Node.js + TypeScript**
- **Express** - HTTP server
- **ws** - WebSocket library
- **@deepgram/sdk** - Deepgram STT integration
- **@anthropic-ai/sdk** - Claude AI integration
- **dotenv** - Environment configuration
