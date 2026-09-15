"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AethexUpstreamError = exports.AethexConfigurationError = void 0;
exports.mintAethexConversationToken = mintAethexConversationToken;
async function mintAethexConversationToken(options) {
    const apiKey = process.env.AETHEX_API_KEY;
    if (!apiKey) {
        throw new AethexConfigurationError('AETHEX_API_KEY is not configured');
    }
    const apiBaseUrl = (process.env.AETHEX_API_BASE_URL || 'https://api.aethexai.com/api/v1').replace(/\/+$/, '');
    const response = await fetch(`${apiBaseUrl}/conversation/token`, {
        method: 'POST',
        headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            agent_id: options.agentId,
            ...(options.ttlSeconds === undefined ? {} : { ttl_seconds: options.ttlSeconds }),
        }),
    });
    const body = await readJsonOrText(response);
    if (!response.ok) {
        throw new AethexUpstreamError(response.status, body);
    }
    if (!isAethexTokenResponse(body)) {
        throw new AethexUpstreamError(502, {
            error: 'Aethex returned an invalid token response',
        });
    }
    return body;
}
class AethexConfigurationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AethexConfigurationError';
    }
}
exports.AethexConfigurationError = AethexConfigurationError;
class AethexUpstreamError extends Error {
    status;
    body;
    constructor(status, body) {
        super(`Aethex token request failed with status ${status}`);
        this.status = status;
        this.body = body;
        this.name = 'AethexUpstreamError';
    }
}
exports.AethexUpstreamError = AethexUpstreamError;
async function readJsonOrText(response) {
    const text = await response.text();
    if (!text)
        return null;
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
}
function isAethexTokenResponse(value) {
    if (!isRecord(value))
        return false;
    return (typeof value.token === 'string' &&
        typeof value.expires_in === 'number' &&
        typeof value.expires_at === 'string' &&
        typeof value.agent_id === 'string');
}
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
