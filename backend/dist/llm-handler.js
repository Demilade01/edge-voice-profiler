"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMHandler = void 0;
const groq_sdk_1 = __importDefault(require("groq-sdk"));
class LLMHandler {
    groq;
    logger;
    conversationHistory = [];
    constructor(apiKey, logger) {
        this.groq = new groq_sdk_1.default({ apiKey });
        this.logger = logger;
    }
    async getResponse(userMessage) {
        console.log(`🤖 LLM processing: "${userMessage}"`);
        this.conversationHistory.push({
            role: 'user',
            content: userMessage,
        });
        this.logger.logEvent({
            eventType: 'llm_request_sent',
            timestamp: process.hrtime.bigint(),
            metadata: { userMessage },
        });
        try {
            const completion = await this.groq.chat.completions.create({
                model: 'llama-3.1-70b-versatile', // Fast and high-quality
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful voice assistant. Keep your responses concise and natural, as they will be spoken aloud. Aim for 1-2 sentences unless more detail is specifically requested.',
                    },
                    ...this.conversationHistory,
                ],
                temperature: 0.7,
                max_tokens: 150,
            });
            const assistantMessage = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.';
            this.logger.logEvent({
                eventType: 'llm_response_received',
                timestamp: process.hrtime.bigint(),
                metadata: {
                    responseText: assistantMessage,
                    model: 'llama-3.1-70b-versatile',
                    tokensUsed: completion.usage?.total_tokens,
                },
            });
            this.conversationHistory.push({
                role: 'assistant',
                content: assistantMessage,
            });
            // Keep conversation history manageable (last 10 messages)
            if (this.conversationHistory.length > 10) {
                this.conversationHistory = this.conversationHistory.slice(-10);
            }
            console.log(`💬 LLM response: "${assistantMessage}"`);
            return assistantMessage;
        }
        catch (error) {
            console.error('❌ LLM Error:', error);
            throw error;
        }
    }
    reset() {
        this.conversationHistory = [];
        console.log('🔄 Conversation history reset');
    }
}
exports.LLMHandler = LLMHandler;
