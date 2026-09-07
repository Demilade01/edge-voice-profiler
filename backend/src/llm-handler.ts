import Groq from 'groq-sdk';
import { LatencyLogger } from './utils/logger';

export class LLMHandler {
  private groq: Groq;
  private logger: LatencyLogger;
  private conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  constructor(apiKey: string, logger: LatencyLogger) {
    this.groq = new Groq({ apiKey });
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
      const completion = await this.groq.chat.completions.create({
        model: 'openai/gpt-oss-20b', // Fast and high-quality
        messages: [
          {
            role: 'system',
            content: 'You are a helpful voice assistant. Keep your responses concise and natural, as they will be spoken aloud. ' +
            'Aim for 1-2 sentences unless more detail is specifically requested. ' +
            'Use the available tools whenever they would give a more accurate or useful answer than guessing. ' +
            "If someone asks for something you have no tool or ability to actually do (like generating money, " +
            "predicting the future, or taking a real-world action you're not equipped for), never just say you " +
            "can't help. Instead, briefly and naturally explain what is and isn't possible, and offer the closest " +
            'useful thing you can actually do instead. Always respond in full, natural spoken sentences — never a ' +
            'bare refusal, an error message, or a one-word answer.',
          },
          ...this.conversationHistory,
        ],
        temperature: 0.7,
        max_tokens: 250,
      });

      const rawAssistantMessage = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.';
      const assistantMessage = rawAssistantMessage
        .replace(/["“”]/g, '')
        .replace(/\*/g, '')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();

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

