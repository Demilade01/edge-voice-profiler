# Aethex Voice Profiler

> A diagnostic edge-network profiler for measuring conversational voice
> latency over Aethex WebRTC.

This repository contains a Next.js frontend and a small Node.js backend. The
browser connects to an Aethex agent through `@aethexai/react`, while the
backend keeps the Aethex API key private and mints short-lived browser
conversation tokens.

The application is intentionally more than a voice-chat demo. It captures a
browser-side latency waterfall for each conversational turn, including WebRTC
connection timing, speech boundaries, finalized transcription, first remote
audio activity, response completion, and barge-in interruption timing.

## Contents

- [Architecture](#architecture)
- [Request and audio flow](#request-and-audio-flow)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
- [Local development](#local-development)
- [Backend API](#backend-api)
- [Latency instrumentation](#latency-instrumentation)
- [Voice activity and barge-in](#voice-activity-and-barge-in)
- [Render deployment](#render-deployment)
- [Testing and verification](#testing-and-verification)
- [Troubleshooting](#troubleshooting)
- [Security notes](#security-notes)
- [Contribution workflow](#contribution-workflow)

## Architecture

```text
┌────────────────────────────── Browser / Next.js ──────────────────────────────┐
│                                                                                │
│  Start session                                                                  │
│       │                                                                        │
│       ├── POST /api/aethex-token ────────┐                                     │
│       │                                  │                                     │
│       │                         Node/Express backend                           │
│       │                                  │                                     │
│       │                    Aethex conversation token                            │
│       │                                  │                                     │
│       └── useAethexCall({ agentId, getToken })                                 │
│                          │                                                     │
│                Aethex WebRTC microphone + remote audio                         │
│                          │                                                     │
│       ┌──────────────────┴───────────────────┐                                 │
│       │                                      │                                 │
│  Local VAD/analyser                    Aethex remote audio                     │
│  (detection only)                      (SDK-managed playback)                  │
│       │                                      │                                 │
│  Barge-in → interrupt()                 Metrics data channel                   │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Important transport boundary

The frontend does **not** manually encode microphone PCM, create a custom
audio WebSocket, or synthesize/play response audio. Aethex owns the voice
transport through WebRTC. The local analyser exists only to detect user speech
for visual feedback and barge-in behavior.

## Request and audio flow

1. The user presses **Start voice session**.
2. The frontend requests a short-lived token from `POST /api/aethex-token`.
3. The backend calls Aethex with the server-only `AETHEX_API_KEY` and pinned
   `AETHEX_AGENT_ID`.
4. `useAethexCall` establishes the Aethex WebRTC session.
5. Aethex receives microphone audio through its WebRTC transport.
6. Aethex remote audio is played by the SDK-managed browser audio sink.
7. The frontend observes local speech, remote audio state, and pipeline
   metrics for the profiler dashboard.
8. After a call ends, the frontend attempts to retrieve the session transcript
   for the conversation timeline.

## Repository layout

```text
.
├── backend/
│   ├── src/
│   │   ├── aethex-token.ts       # Secure token minting
│   │   ├── keep-alive.ts         # Optional Render health pinger
│   │   ├── openapi.ts            # Swagger/OpenAPI document
│   │   └── server.ts             # Express entrypoint
│   ├── .env.example
│   ├── package.json
│   └── README.md
├── frontend/
│   ├── app/
│   │   ├── page.tsx              # Voice console and session orchestration
│   │   ├── globals.css           # Observatory UI system
│   │   └── layout.tsx
│   ├── components/
│   │   ├── AudioVisualizer.tsx   # State-aware live audio visualization
│   │   └── LatencyDashboard.tsx  # Summary metrics and event stream
│   ├── lib/
│   │   ├── local-vad-monitor.ts  # Local RMS analyser for VAD only
│   │   └── vad.ts                # Speech and barge-in detector
│   └── package.json
├── SETUP.md
└── start.bat
```

## Prerequisites

- Node.js 20 or newer
- npm
- An Aethex account
- An Aethex agent UUID
- An Aethex API key
- A browser with WebRTC, microphone, and Web Audio API support

Microphone access requires `localhost` or HTTPS. Plain HTTP remote deployments
will generally be blocked by browser media-security rules.

## Configuration

### Backend environment

Copy the example file:

```powershell
Copy-Item backend/.env.example backend/.env
```

Set these values in `backend/.env`:

```env
AETHEX_API_KEY=ae_live_your_server_only_key
AETHEX_AGENT_ID=your-agent-uuid
AETHEX_API_BASE_URL=https://api.aethexai.com/api/v1
PORT=8080
NODE_ENV=development
```

Optional Render keep-alive configuration:

```env
KEEP_ALIVE_ENABLED=false
KEEP_ALIVE_INTERVAL_MS=600000
# Optional local/custom override:
# KEEP_ALIVE_URL=https://your-service.onrender.com
```

`RENDER_EXTERNAL_URL` is used automatically when the keep-alive is enabled and
`KEEP_ALIVE_URL` is not set.

### Frontend environment

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8080
NEXT_PUBLIC_AETHEX_AGENT_ID=your-agent-uuid
```

The agent ID is safe to expose to the browser. The Aethex API key is not.

## Local development

Install dependencies:

```powershell
cd backend
npm install

cd ..\frontend
npm install
```

Run the backend:

```powershell
cd backend
npm run dev
```

Run the frontend in a second terminal:

```powershell
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), grant microphone
permission, and press **Start voice session**.

For a one-command Windows startup, configure both environment files and run:

```powershell
.\start.bat
```

## Backend API

### `GET /health`

Returns process health. This endpoint does not require Aethex credentials and
is used by the optional keep-alive helper.

Example:

```powershell
Invoke-RestMethod http://localhost:8080/health
```

### `GET /ready`

Checks whether both `AETHEX_API_KEY` and `AETHEX_AGENT_ID` are configured.

Expected response when ready:

```json
{
  "status": "ready",
  "checks": {
    "aethex": true
  }
}
```

### `POST /api/aethex-token`

Mints a short-lived token for the configured agent. The API key is used only
inside the backend.

PowerShell test:

```powershell
$response = Invoke-WebRequest `
  -Method Post `
  -Uri "http://localhost:8080/api/aethex-token" `
  -ContentType "application/json" `
  -Body "{}"

$body = $response.Content | ConvertFrom-Json
[pscustomobject]@{
  StatusCode = $response.StatusCode
  AgentId = $body.agent_id
  HasToken = [bool]$body.token
}
```

Expected status: `201`.

The backend also exposes Swagger UI at:

```text
http://localhost:8080/docs
```

## Latency instrumentation

Latency events are written to both the browser console and the dashboard.
Events include:

| Event | Meaning |
| --- | --- |
| `session_start` | Browser session timer started |
| `microphone_permission_granted` | Aethex microphone stream acquired |
| `webrtc_connected` | WebRTC call reached connected state |
| `user_speech_start` | Local VAD detected speech |
| `user_speech_end` | Local VAD detected the end of speech |
| `finalized_transcription` | Final transcript became available |
| `remote_stream_received` | Remote Aethex stream attached |
| `first_remote_audio_activity` | First measurable remote audio activity |
| `response_completed` | Agent output stopped |
| `barge_in_triggered` | User interrupted agent output |
| `session_ended` | Call ended |

Each event may contain:

- ISO timestamp
- Milliseconds elapsed since session start
- Milliseconds elapsed since the current turn started
- Event-specific metadata

### Interpreting the main metrics

- **WebRTC connect:** `webrtc_connected - session_start`
- **Transcription:** `finalized_transcription - user_speech_end`
- **Audio TTFB:** `first_remote_audio_activity - user_speech_end`
- **Response:** `response_completed - first_remote_audio_activity`
- **Barge-in response:** `barge_in_triggered - first_remote_audio_activity`

Live transcription is not guaranteed to arrive through the Aethex metrics
channel. When available, metrics are used immediately; otherwise the frontend
attempts a transcript fetch after the call ends.

## Voice activity and barge-in

The frontend receives the microphone stream through the Aethex SDK platform
adapter. `LocalVadMonitor` connects that stream to an analyser without sending
additional audio anywhere.

When speech is detected:

1. The UI changes to the speaking state.
2. A `user_speech_start` event is logged.
3. If the agent is speaking, `interrupt()` is called immediately.
4. The event log records `barge_in_triggered` with response timing.
5. The UI displays an interruption confirmation.

The manual **Interrupt** button uses the same Aethex `interrupt()` method.

## Render deployment

Deploy the `backend` directory as a Render Web Service.

Recommended service settings:

```text
Root directory: backend
Build command: npm install && npm run build
Start command: npm start
Health check path: /health
```

Required Render environment variables:

```env
AETHEX_API_KEY=...
AETHEX_AGENT_ID=...
AETHEX_API_BASE_URL=https://api.aethexai.com/api/v1
NODE_ENV=production
KEEP_ALIVE_ENABLED=true
KEEP_ALIVE_INTERVAL_MS=600000
```

The frontend must use the deployed backend URL:

```env
NEXT_PUBLIC_BACKEND_URL=https://your-backend.onrender.com
NEXT_PUBLIC_AETHEX_AGENT_ID=your-agent-uuid
```

The keep-alive is best-effort. It should not be treated as a substitute for a
non-sleeping production service or an external uptime monitor.

## Testing and verification

Run frontend checks:

```powershell
cd frontend
npm run lint
npm run build
```

Run backend checks:

```powershell
cd backend
npm run build
```

Manual browser acceptance checklist:

- Token route returns HTTP `201`.
- Returned `agent_id` matches the configured agent.
- WebRTC connects without a custom WebSocket.
- Microphone audio reaches the Aethex agent.
- Remote Aethex audio plays cleanly.
- Mute and output volume work.
- Manual interrupt stops agent output.
- Speaking over the agent triggers automatic barge-in.
- Stop and restart work repeatedly.
- Latency events appear in the dashboard and browser console.
- Mobile and desktop layouts remain usable.

## Troubleshooting

### `Aethex is not configured`

Confirm that `backend/.env` contains both:

```env
AETHEX_API_KEY=...
AETHEX_AGENT_ID=...
```

Restart the backend after changing environment variables.

### Token request fails upstream

Check:

1. The API key is active and has not been revoked.
2. The agent UUID is correct.
3. The voice configured on the Aethex agent is valid.
4. The backend can reach `api.aethexai.com`.
5. The backend is using the expected `AETHEX_API_BASE_URL`.

Do not paste API keys into source files, frontend environment files, logs, or
issues.

### Microphone permission fails

- Use `localhost` during development or HTTPS in production.
- Check browser microphone permissions.
- Confirm another application is not exclusively using the microphone.
- Reload after changing browser permissions.

### Remote audio is silent

- Confirm the call reached `connected`.
- Check browser autoplay and output-device permissions.
- Confirm the browser tab is not muted.
- Test the output-volume control.
- Inspect the console for Aethex call errors.

### No transcript appears during a live call

The Aethex SDK does not promise live transcript delivery through the metrics
channel. The UI may populate the transcript after the session ends when the
session transcript is available.

## Security notes

- Keep `AETHEX_API_KEY` in the backend only.
- Never prefix the API key with `NEXT_PUBLIC_`.
- Rotate any key that has been exposed in chat, source control, logs, or
  screenshots.
- Do not log token values or authorization headers.
- Keep the frontend agent ID public but pin token minting to the backend
  `AETHEX_AGENT_ID`.
- Review CORS and deployment domains before production use.

## Contribution workflow

Before opening a pull request:

1. Explain the user-facing or infrastructure change.
2. Keep Aethex transport changes isolated from UI changes where possible.
3. Run frontend lint/build and backend build.
4. Test start, stop, reconnect, mute, playback, and barge-in manually for
   voice-related changes.
5. Never commit `.env`, `.env.local`, API keys, token payloads, or generated
   secrets.

Suggested commit prefixes:

```text
feat: new user-facing capability
fix: behavior or reliability correction
refactor: internal restructuring without behavior change
docs: documentation-only change
chore: tooling or dependency maintenance
```
