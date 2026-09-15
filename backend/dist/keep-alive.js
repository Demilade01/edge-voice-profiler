"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startKeepAlive = startKeepAlive;
const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
/**
 * Optional Render keep-alive helper.
 *
 * Render provides RENDER_EXTERNAL_URL for web services. The request is made
 * to the public /health endpoint so it counts as inbound traffic to the web
 * service while the process is already running.
 */
function startKeepAlive() {
    const enabled = process.env.KEEP_ALIVE_ENABLED === 'true';
    const baseUrl = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;
    if (!enabled || !baseUrl) {
        return () => undefined;
    }
    const intervalMs = parseInterval(process.env.KEEP_ALIVE_INTERVAL_MS);
    let healthUrl;
    try {
        healthUrl = new URL('/health', baseUrl).toString();
    }
    catch {
        console.warn(`[keep-alive] invalid KEEP_ALIVE_URL/RENDER_EXTERNAL_URL: ${baseUrl}`);
        return () => undefined;
    }
    let stopped = false;
    const ping = async () => {
        if (stopped)
            return;
        const pingStartedAt = Date.now();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(healthUrl, {
                method: 'GET',
                headers: { 'X-Keep-Alive': 'render' },
                signal: controller.signal,
            });
            if (!response.ok) {
                console.warn(`[keep-alive] ${response.status} from ${healthUrl}`);
                return;
            }
            console.log(`[keep-alive] health ping completed in ${Date.now() - pingStartedAt}ms`);
        }
        catch (error) {
            console.warn('[keep-alive] health ping failed:', error instanceof Error ? error.message : error);
        }
        finally {
            clearTimeout(timeout);
        }
    };
    const timer = setInterval(() => {
        void ping();
    }, intervalMs);
    timer.unref?.();
    console.log(`[keep-alive] enabled; pinging every ${Math.round(intervalMs / 60000)} minutes`);
    return () => {
        stopped = true;
        clearInterval(timer);
    };
}
function parseInterval(value) {
    const parsed = value ? Number(value) : DEFAULT_INTERVAL_MS;
    if (!Number.isFinite(parsed) || parsed < 60_000)
        return DEFAULT_INTERVAL_MS;
    return parsed;
}
