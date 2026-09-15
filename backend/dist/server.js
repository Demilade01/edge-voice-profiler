"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const openapi_1 = __importDefault(require("./openapi"));
const keep_alive_1 = require("./keep-alive");
const aethex_token_1 = require("./aethex-token");
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = Number(process.env.PORT || 8080);
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use('/docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(openapi_1.default));
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
    let ttlSeconds;
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
        const token = await (0, aethex_token_1.mintAethexConversationToken)({ agentId, ttlSeconds });
        res.status(201).json({
            token: token.token,
            expires_in: token.expires_in,
            expires_at: token.expires_at,
            agent_id: token.agent_id,
        });
    }
    catch (error) {
        if (error instanceof aethex_token_1.AethexConfigurationError) {
            res.status(503).json({ error: 'Aethex is not configured', detail: error.message });
            return;
        }
        if (error instanceof aethex_token_1.AethexUpstreamError) {
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
const httpServer = app.listen(port, () => {
    console.log(`Aethex profiler backend listening on http://localhost:${port}`);
});
const stopKeepAlive = (0, keep_alive_1.startKeepAlive)();
function shutdown() {
    stopKeepAlive();
    httpServer.close(() => process.exit(0));
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
