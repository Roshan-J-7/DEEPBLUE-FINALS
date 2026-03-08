import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Cerebras LLM Service
 * Uses OpenAI-compatible API for ultra-fast inference
 */
class CerebrasService {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.CEREBRAS_API_KEY,
      baseURL: 'https://api.cerebras.ai/v1'
    });
    
    this.model = process.env.AI_MODEL || 'llama3.1-8b';
    this.systemPrompt = process.env.SYSTEM_PROMPT || 
      'You are a helpful AI assistant speaking on the phone. Keep responses concise and conversational.';
    
    // Conversation history per call
    this.conversations = new Map();
  }

  /**
   * Initialize conversation for a new call
   */
  initConversation(callSid) {
    this.conversations.set(callSid, [
      {
        role: 'system',
        content: this.systemPrompt
      }
    ]);
  }

  /**
   * Get AI response using Cerebras
   */
  async getResponse(callSid, userMessage) {
    try {
      // Get or create conversation history
      if (!this.conversations.has(callSid)) {
        this.initConversation(callSid);
      }

      const messages = this.conversations.get(callSid);
      
      // Add user message
      messages.push({
        role: 'user',
        content: userMessage
      });

      console.log(`[Cerebras] Processing message for call ${callSid}`);
      const startTime = Date.now();

      // Call Cerebras API
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages,
        max_tokens: 150, // Keep responses concise for voice
        temperature: 0.7,
        stream: false
      });

      const latency = Date.now() - startTime;
      console.log(`[Cerebras] Response generated in ${latency}ms`);

      const aiResponse = response.choices[0].message.content;

      // Add AI response to history
      messages.push({
        role: 'assistant',
        content: aiResponse
      });

      // Keep conversation history manageable (last 10 exchanges)
      if (messages.length > 21) {
        messages.splice(1, 2); // Keep system prompt, remove oldest exchange
      }

      return aiResponse;

    } catch (error) {
      console.error('[Cerebras] Error:', error.message);
      throw new Error('Failed to get AI response');
    }
  }

  /**
   * Stream response (for future real-time implementation)
   */
  async *streamResponse(callSid, userMessage) {
    try {
      if (!this.conversations.has(callSid)) {
        this.initConversation(callSid);
      }

      const messages = this.conversations.get(callSid);
      messages.push({ role: 'user', content: userMessage });

      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: messages,
        max_tokens: 150,
        temperature: 0.7,
        stream: true
      });

      let fullResponse = '';

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          yield content;
        }
      }

      messages.push({ role: 'assistant', content: fullResponse });

    } catch (error) {
      console.error('[Cerebras] Stream error:', error.message);
      throw error;
    }
  }

  /**
   * Clear conversation history for a call
   */
  clearConversation(callSid) {
    this.conversations.delete(callSid);
    console.log(`[Cerebras] Cleared conversation for call ${callSid}`);
  }

  /**
   * Get conversation history
   */
  getConversation(callSid) {
    return this.conversations.get(callSid) || [];
  }
}

export default new CerebrasService();
