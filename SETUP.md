# Aethex setup checklist

1. Create or select an Aethex agent and copy its UUID.
2. Put the API key and agent UUID in `backend/.env`.
3. Put the agent UUID and backend URL in `frontend/.env.local`.
4. Start the backend and confirm `/ready` returns `200`.
5. Confirm `POST /api/aethex-token` returns `201`.
6. Start the frontend over `localhost` or HTTPS, grant microphone permission,
   and test start/stop, remote audio, and barge-in.

The browser calls Aethex signaling through the SDK using the short-lived token.
The API key remains backend-only.

## Render backend settings

For the backend Render service, use:

```text
Root Directory: backend
Build Command: npm ci --include=dev && npm run build
Start Command: npm start
Health Check Path: /health
```

Do not use `npm run build` by itself because the build environment must install
the backend dependencies and TypeScript type packages first. The repository
also contains a `render.yaml` Blueprint with these settings.
