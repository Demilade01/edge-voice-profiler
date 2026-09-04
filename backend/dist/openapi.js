"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const openapiDocument = {
    openapi: '3.0.3',
    info: {
        title: 'Voice Latency Profiler API',
        version: '1.0.0',
        description: [
            'HTTP health endpoints and the WebSocket protocol for the edge-network voice latency profiler.',
            '',
            '## WebSocket connection',
            'Connect a browser client to `ws://localhost:8080` (or `wss://` in production).',
            'Swagger UI documents the protocol below but does not open WebSocket sessions.',
            '',
            '## Binary audio frame',
            'Each client audio packet is a 16-byte big-endian header followed by 16-bit little-endian PCM audio at 16 kHz, mono:',
            '- bytes 0-3: magic `0x56504631` (`VPF1`)',
            '- bytes 4-7: unsigned 32-bit sequence number',
            '- bytes 8-15: IEEE-754 float64 client `performance.now()` timestamp',
            '- bytes 16+: PCM16 audio payload, normally 800 samples / 50 ms',
        ].join('\n'),
        contact: {
            name: 'Voice Latency Profiler',
        },
    },
    servers: [
        {
            url: 'http://localhost:8080',
            description: 'Local backend',
        },
    ],
    tags: [
        {
            name: 'System',
            description: 'Backend health and readiness checks.',
        },
        {
            name: 'WebSocket',
            description: 'Real-time audio and voice-turn protocol.',
        },
    ],
    paths: {
        '/health': {
            get: {
                tags: ['System'],
                summary: 'Check backend health',
                operationId: 'getHealth',
                responses: {
                    '200': {
                        description: 'Backend is running.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/HealthResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/ready': {
            get: {
                tags: ['System'],
                summary: 'Check backend readiness',
                operationId: 'getReadiness',
                responses: {
                    '200': {
                        description: 'Required provider configuration is available.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ReadinessResponse' },
                            },
                        },
                    },
                    '503': {
                        description: 'One or more required provider credentials are missing.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ReadinessResponse' },
                            },
                        },
                    },
                },
            },
        },
    },
    components: {
        schemas: {
            HealthResponse: {
                type: 'object',
                required: ['status', 'timestamp'],
                properties: {
                    status: { type: 'string', example: 'healthy' },
                    timestamp: { type: 'string', format: 'date-time' },
                },
            },
            ReadinessResponse: {
                type: 'object',
                required: ['status', 'checks'],
                properties: {
                    status: { type: 'string', enum: ['ready', 'not_ready'] },
                    checks: {
                        type: 'object',
                        additionalProperties: { type: 'boolean' },
                        example: { deepgram: true, groq: true },
                    },
                },
            },
            ClientControlMessage: {
                type: 'object',
                required: ['type'],
                properties: {
                    type: { type: 'string', enum: ['start', 'stop', 'barge_in'] },
                    turnId: { type: 'string', example: 'turn_1720000000000' },
                    timestamp: { type: 'number', description: 'Browser performance.now() timestamp.' },
                },
            },
            ServerMessage: {
                type: 'object',
                required: ['type', 'timestamp'],
                properties: {
                    type: {
                        type: 'string',
                        enum: ['status', 'transcript', 'audio', 'latency', 'summary', 'error'],
                    },
                    data: { description: 'Message-specific payload.' },
                    timestamp: { type: 'integer', format: 'int64', description: 'Server wall-clock timestamp in milliseconds.' },
                },
            },
            LatencySummary: {
                type: 'object',
                required: ['turnId'],
                properties: {
                    turnId: { type: 'string' },
                    clientToServerMs: { type: 'number' },
                    sttMs: { type: 'number' },
                    llmMs: { type: 'number' },
                    ttsTimeToFirstByteMs: { type: 'number' },
                    serverToClientMs: { type: 'number' },
                    firstAudioMs: { type: 'number' },
                    totalTurnMs: { type: 'number' },
                    cancelled: { type: 'boolean' },
                },
            },
        },
    },
    'x-websocket': {
        url: '/ws',
        messages: {
            clientControl: {
                direction: 'client -> server',
                contentType: 'application/json',
                schema: { $ref: '#/components/schemas/ClientControlMessage' },
            },
            clientAudio: {
                direction: 'client -> server',
                contentType: 'application/octet-stream',
                description: 'Binary VPF1 audio frame described in the WebSocket connection section.',
            },
            server: {
                direction: 'server -> client',
                contentType: 'application/json',
                schema: { $ref: '#/components/schemas/ServerMessage' },
            },
            latencySummary: {
                direction: 'server -> client',
                contentType: 'application/json',
                schema: { $ref: '#/components/schemas/LatencySummary' },
            },
        },
    },
};
exports.default = openapiDocument;
