import type { 
  LLMRequest, 
  LLMResponse, 
  LLMStreamChunk,
  LLMHealthCheck,
  StreamHandler 
} from './types.js';
import { LLMAdapter } from './adapter.js';

// Pricing per 1K tokens (as of 2024) - update as needed
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
};

export class AnthropicAdapter extends LLMAdapter {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: ConstructorParameters<typeof LLMAdapter>[0]) {
    super(config);
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com/v1';
    this.apiKey = config.apiKey || '';
  }

  getProvider(): string {
    return 'anthropic';
  }

  getDefaultModel(): string {
    return 'claude-3-sonnet-20240229';
  }

  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.apiKey) {
      errors.push('API key is required for Anthropic. Set ANTHROPIC_API_KEY environment variable.');
    }

    if (!this.apiKey.startsWith('sk-ant-')) {
      errors.push('Anthropic API key should start with "sk-ant-"');
    }

    return { valid: errors.length === 0, errors };
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    };
  }

  /**
   * Convert messages to Anthropic format (single system message + alternating user/assistant)
   */
  private convertMessages(messages: LLMRequest['messages']): {
    system?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  } {
    let system: string | undefined;
    const convertedMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    for (const message of messages) {
      if (message.role === 'system') {
        system = message.content;
      } else {
        convertedMessages.push({
          role: message.role,
          content: message.content,
        });
      }
    }

    return { system, messages: convertedMessages };
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    
    const { system, messages } = this.convertMessages(request.messages);
    
    const body: Record<string, unknown> = {
      model: request.model || this.config.model,
      messages,
      max_tokens: request.maxTokens ?? this.config.maxTokens,
      temperature: request.temperature ?? this.config.temperature,
    };

    if (system) {
      body.system = system;
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${error}`);
    }

    const data = await response.json() as {
      usage?: { input_tokens: number; output_tokens: number };
      model?: string;
      content?: Array<{ text?: string }>;
    };
    const latency = Date.now() - startTime;

    const usage = data.usage || { input_tokens: 0, output_tokens: 0 };
    const cost = this.calculateCost(
      data.model || request.model || this.config.model,
      usage.input_tokens,
      usage.output_tokens
    );

    return {
      content: data.content?.[0]?.text || '',
      usage: {
        promptTokens: usage.input_tokens,
        completionTokens: usage.output_tokens,
        totalTokens: usage.input_tokens + usage.output_tokens,
      },
      cost,
      model: data.model || request.model || this.config.model,
      provider: 'anthropic',
    };
  }

  async stream(request: LLMRequest, handler: StreamHandler): Promise<void> {
    const { system, messages } = this.convertMessages(request.messages);
    
    const body: Record<string, unknown> = {
      model: request.model || this.config.model,
      messages,
      max_tokens: request.maxTokens ?? this.config.maxTokens,
      temperature: request.temperature ?? this.config.temperature,
      stream: true,
    };

    if (system) {
      body.system = system;
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          handler({ content: '', done: true });
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              handler({ content: '', done: true });
              continue;
            }

            try {
              const chunk = JSON.parse(data);
              
              if (chunk.type === 'content_block_delta') {
                handler({
                  content: chunk.delta?.text || '',
                  done: false,
                });
              } else if (chunk.type === 'message_stop') {
                handler({ content: '', done: true });
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async healthCheck(): Promise<LLMHealthCheck> {
    const startTime = Date.now();
    
    try {
      // Anthropic doesn't have a simple models endpoint, so we do a minimal request
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(10000),
      });

      const latency = Date.now() - startTime;

      if (response.ok) {
        return {
          available: true,
          latency,
          model: this.config.model,
        };
      }

      // If we get a 400, the API is working but our request was invalid
      if (response.status === 400) {
        return {
          available: true,
          latency,
          model: this.config.model,
        };
      }

      const error = await response.text();
      return {
        available: false,
        error: `Anthropic API returned status ${response.status}: ${error}`,
        latency,
      };
    } catch (error) {
      return {
        available: false,
        error: `Cannot connect to Anthropic API: ${error}`,
      };
    }
  }

  estimateCost(request: LLMRequest): number {
    // Rough estimation assuming ~4 chars per token
    const estimatedInputTokens = Math.ceil(
      request.messages.reduce((acc, m) => acc + m.content.length, 0) / 4
    );
    const estimatedOutputTokens = request.maxTokens || this.config.maxTokens;
    
    return this.calculateCost(
      request.model || this.config.model,
      estimatedInputTokens,
      estimatedOutputTokens
    );
  }

  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    // Find pricing for the model
    const baseModel = Object.keys(PRICING).find(key => model.startsWith(key)) || 'claude-3-sonnet';
    const pricing = PRICING[baseModel];
    
    if (!pricing) {
      return 0;
    }

    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;
    
    return Math.round((inputCost + outputCost) * 10000) / 10000;
  }
}