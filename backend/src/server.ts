import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import openapiDocument from './openapi';
import {
  AethexConfigurationError,
  AethexUpstreamError,
  mintAethexConversationToken,
} from './aethex-token';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 8080);

app.use(cors());
app.use(express.json());
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDocument));

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/ready', (_req, res) => {
  const checks = {
    aethex: Boolean(process.env.AETHEX_API_KEY && process.env.AETHEX_AGENT_ID),
  };
  const ready = Object.values(checks).every(Boolean);

  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    checks,
  });
});

/**
 * Mint a short-lived browser token. The Aethex API key never leaves this
 * backend. The agent is pinned to AETHEX_AGENT_ID so callers cannot request
 * arbitrary agents.
 */
app.post('/api/aethex-token', async (req, res) => {
  const agentId = process.env.AETHEX_AGENT_ID;
  if (!agentId) {
    res.status(503).json({
      error: 'Aethex is not configured',
      detail: 'Set AETHEX_AGENT_ID on the backend',
    });
    return;
  }

  const requestedTtl = req.body?.ttl_seconds;
  let ttlSeconds: number | undefined;
  if (requestedTtl !== undefined) {
    if (!Number.isInteger(requestedTtl)) {
      res.status(400).json({
        error: 'Invalid ttl_seconds',
        detail: 'ttl_seconds must be a whole number',
      });
      return;
    }
    ttlSeconds = requestedTtl;
  }

  try {
    const token = await mintAethexConversationToken({ agentId, ttlSeconds });
    res.status(201).json({
      token: token.token,
      expires_in: token.expires_in,
      expires_at: token.expires_at,
      agent_id: token.agent_id,
    });
  } catch (error) {
    if (error instanceof AethexConfigurationError) {
      res.status(503).json({ error: 'Aethex is not configured', detail: error.message });
      return;
    }

    if (error instanceof AethexUpstreamError) {
      res.status(error.status >= 400 && error.status < 600 ? error.status : 502).json({
        error: 'Aethex token mint failed',
        detail: error.body,
      });
      return;
    }

    console.error('Aethex token route failed:', error);
    res.status(502).json({ error: 'Aethex token mint failed' });
  }
});

app.listen(port, () => {
  console.log(`Aethex profiler backend listening on http://localhost:${port}`);
});
