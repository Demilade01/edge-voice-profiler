# Aethex profiler backend

The backend is intentionally small. It provides:

- `GET /health`
- `GET /ready`
- `POST /api/aethex-token`
- Swagger documentation at `/docs`

The token route calls Aethex's conversation-token endpoint with
`AETHEX_API_KEY` and the pinned `AETHEX_AGENT_ID`. WebRTC signaling, microphone
transport, remote audio, and interruption are handled by
`@aethexai/react` in the frontend.

## Render keep-alive

Set `KEEP_ALIVE_ENABLED=true` in Render environment variables. The service
uses Render's `RENDER_EXTERNAL_URL` and pings `/health` every 10 minutes.
`KEEP_ALIVE_URL` can be used when a custom public URL is preferred.
