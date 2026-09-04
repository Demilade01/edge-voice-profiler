# Voice Latency Profiler

A real-time voice chat application with comprehensive latency monitoring and network performance analysis.

## Features

- **Real-time Voice Chat**: Full-duplex voice communication with STT, LLM, and TTS
- **Latency Dashboard**: Live metrics tracking every stage of the pipeline
- **Voice Activity Detection**: Smart barge-in and conversation management
- **Network Stress Testing**: Built-in tools to test under degraded conditions
- **Beautiful UI**: Warm, editorial design with audio visualizations

## Architecture

- **Frontend**: Next.js 15+ with React 19, TypeScript, Tailwind CSS
- **Backend**: Node.js with Express, WebSocket, Deepgram STT/TTS, Groq LLM
- **Real-time**: WebSocket-based bidirectional audio streaming

## Prerequisites

- Node.js 18+ and npm
- Deepgram API key (for STT/TTS)
- Groq API key (for the LLM)

## Setup

### 1. Backend Setup

```bash
cd backend
npm install

# Create .env file
echo "DEEPGRAM_API_KEY=your_deepgram_key_here" > .env
echo "GROQ_API_KEY=your_groq_key_here" >> .env
echo "PORT=8080" >> .env

# Start the backend
npm run dev
```

### 2. Frontend Setup

```bash
cd frontend
npm install

# Create .env.local file
echo "NEXT_PUBLIC_WS_URL=ws://localhost:8080" > .env.local

# Start the frontend
npm run dev
```

### 3. Access the Application

Open your browser to `http://localhost:3000`

## Usage

1. **Click "Start Voice Session"** to connect and enable your microphone
2. **Start speaking** - Your audio is transcribed in real-time
3. **Watch the metrics** - Latency dashboard shows every pipeline stage
4. **Agent responds** - TTS audio plays back with barge-in support

## Latency Metrics Tracked

- 🎤 **Audio Capture**: Microphone to WebSocket
- 📡 **Network RTT**: Round-trip time
- 🎯 **STT Latency**: Speech-to-text processing
- 🧠 **LLM Latency**: AI response generation
- 🔊 **TTS Latency**: Text-to-speech synthesis
- ⏱️ **Total Latency**: End-to-end response time

## Network Testing

Test under degraded conditions:
1. Open Chrome DevTools (F12)
2. Go to Network tab → Throttling
3. Select "Slow 3G" or "Fast 3G"
4. Watch real-time latency changes

## Technology Stack

### Frontend
- Next.js 15 (React 19, App Router)
- TypeScript
- Tailwind CSS 4
- Web Audio API
- WebSocket Client

### Backend
- Node.js + Express
- WebSocket Server
- Deepgram SDK (STT/TTS)
- Anthropic Claude API
- TypeScript

## Project Structure

```
voice-project/
├── frontend/
│   ├── app/
│   │   ├── page.tsx          # Main voice interface
│   │   ├── layout.tsx        # App layout
│   │   └── globals.css       # Design system
│   ├── components/
│   │   ├── AudioVisualizer.tsx
│   │   └── LatencyDashboard.tsx
│   ├── lib/
│   │   ├── audio-capture.ts   # Microphone handler
│   │   ├── vad.ts            # Voice activity detection
│   │   └── websocket-client.ts
│   └── types/
│       └── index.ts
│
└── backend/
    ├── src/
    │   ├── server.ts          # WebSocket server
    │   ├── deepgram-handler.ts # STT/TTS
    │   ├── llm-handler.ts     # Claude integration
    │   ├── types.ts
    │   └── utils/
    │       └── logger.ts      # Latency tracking
    └── package.json
```

## Key Features Explained

### Voice Activity Detection (VAD)
- Detects when user starts/stops speaking
- Implements barge-in to interrupt agent
- Prevents echo and feedback loops

### Streaming Pipeline
- STT: Real-time transcription with Deepgram
- LLM: Streaming responses from Claude
- TTS: Instant audio synthesis with Deepgram

### Latency Logging
- Timestamps every stage
- Calculates deltas between stages
- Sends metrics to frontend dashboard
- Waterfall visualization

## Troubleshooting

**Microphone not working?**
- Check browser permissions
- Ensure HTTPS or localhost
- Try a different browser

**WebSocket connection fails?**
- Verify backend is running on port 8080
- Check CORS settings
- Ensure .env.local has correct WS URL

**No audio playback?**
- Check browser audio permissions
- Verify Deepgram TTS API key
- Check browser console for errors

**High latency?**
- Check your internet connection
- Verify API keys are valid
- Use network throttling to test

## Development

### Run Both Servers Simultaneously

Terminal 1:
```bash
cd backend && npm run dev
```

Terminal 2:
```bash
cd frontend && npm run dev
```

### Build for Production

Frontend:
```bash
cd frontend
npm run build
npm start
```

Backend:
```bash
cd backend
npm run build
npm start
```

## API Keys

Get your API keys:
- **Deepgram**: https://console.deepgram.com/
- **Groq**: https://console.groq.com/

## License

MIT

## Contributing

Pull requests welcome! Please ensure all tests pass and code is formatted.

---

Built with ❤️ for low-latency voice AI
