import Anthropic from '@anthropic-ai/sdk';
import { LatencyLogger } from './utils/logger';

export class LLMHandler {
  private anthropic: Anthropic;
  private logger: LatencyLogger;
  private conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  constructor(apiKey: string, logger: LatencyLogger) {
    this.anthropic = new Anthropic({
      apiKey: apiKey,
      baseURL: 'https://seekai.cc/v1',
    });
    this.logger = logger;
  }

  async getResponse(userMessage: string): Promise<string> {
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
      const message = await this.anthropic.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 150,
        system: 'You are a helpful voice assistant. Keep your responses concise and natural, as they will be spoken aloud. Aim for 1-2 sentences unless more detail is specifically requested.',
        messages: this.conversationHistory,
      });

      const assistantMessage = message.content[0]?.type === 'text' 
        ? message.content[0].text 
        : 'I apologize, but I could not generate a response.';

      this.logger.logEvent({
        eventType: 'llm_response_received',
        timestamp: process.hrtime.bigint(),
        metadata: { 
          responseText: assistantMessage,
          inputTokens: message.usage?.input_tokens,
          outputTokens: message.usage?.output_tokens,
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
    } catch (error) {
      console.error('❌ LLM Error:', error);
      throw error;
    }
  }

  reset(): void {
    this.conversationHistory = [];
    console.log('🔄 Conversation history reset');
  }
}

