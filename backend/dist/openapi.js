"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const openapiDocument = {
    openapi: '3.0.3',
    info: {
        title: 'Aethex Voice Profiler API',
        version: '2.0.0',
        description: 'Health checks and secure ephemeral-token minting for the Aethex WebRTC client.',
    },
    servers: [{ url: 'http://localhost:8080', description: 'Local backend' }],
    paths: {
        '/health': {
            get: {
                summary: 'Check backend health',
                responses: {
                    '200': {
                        description: 'Backend is running.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['status', 'timestamp'],
                                    properties: {
                                        status: { type: 'string', example: 'healthy' },
                                        timestamp: { type: 'string', format: 'date-time' },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/ready': {
            get: {
                summary: 'Check Aethex configuration',
                responses: {
                    '200': { description: 'Aethex is configured.' },
                    '503': { description: 'Aethex credentials or agent ID are missing.' },
                },
            },
        },
        '/api/aethex-token': {
            post: {
                summary: 'Mint a short-lived Aethex conversation token',
                responses: {
                    '201': {
                        description: 'Token minted.',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['token', 'expires_in', 'expires_at', 'agent_id'],
                                    properties: {
                                        token: { type: 'string' },
                                        expires_in: { type: 'number' },
                                        expires_at: { type: 'string', format: 'date-time' },
                                        agent_id: { type: 'string', format: 'uuid' },
                                    },
                                },
                            },
                        },
                    },
                    '400': { description: 'Invalid request.' },
                    '503': { description: 'Aethex is not configured.' },
                    '502': { description: 'Aethex token service failed.' },
                },
            },
        },
    },
};
exports.default = openapiDocument;
