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
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
};

export class OpenAIAdapter extends LLMAdapter {
  private baseUrl: string;
  private apiKey: string;
  private organization?: string;

  constructor(config: ConstructorParameters<typeof LLMAdapter>[0]) {
    super(config);
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.apiKey = config.apiKey || '';
    this.organization = config.organization;
  }

  getProvider(): string {
    return 'openai';
  }

  getDefaultModel(): string {
    return 'gpt-4o';
  }

  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.apiKey) {
      errors.push('API key is required for OpenAI. Set OPENAI_API_KEY environment variable.');
    }

    if (!this.apiKey.startsWith('sk-')) {
      errors.push('OpenAI API key should start with "sk-"');
    }

    return { valid: errors.length === 0, errors };
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };

    if (this.organization) {
      headers['OpenAI-Organization'] = this.organization;
    }

    return headers;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: request.model || this.config.model,
        messages: request.messages,
        temperature: request.temperature ?? this.config.temperature,
        max_tokens: request.maxTokens ?? this.config.maxTokens,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json() as {
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const latency = Date.now() - startTime;

    const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const cost = this.calculateCost(
      data.model || request.model || this.config.model,
      usage.prompt_tokens,
      usage.completion_tokens
    );

    return {
      content: data.choices?.[0]?.message?.content || '',
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      },
      cost,
      model: data.model || request.model || this.config.model,
      provider: 'openai',
    };
  }

  async stream(request: LLMRequest, handler: StreamHandler): Promise<void> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: request.model || this.config.model,
        messages: request.messages,
        temperature: request.temperature ?? this.config.temperature,
        max_tokens: request.maxTokens ?? this.config.maxTokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
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
          if (line.trim() === '' || line.trim() === 'data: [DONE]') {
            if (line.trim() === 'data: [DONE]') {
              handler({ content: '', done: true });
            }
            continue;
          }

          if (line.startsWith('data: ')) {
            try {
              const chunk = JSON.parse(line.slice(6));
              const content = chunk.choices?.[0]?.delta?.content || '';
              handler({
                content,
                done: false,
              });
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
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.getHeaders(),
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

      const error = await response.text();
      return {
        available: false,
        error: `OpenAI API returned status ${response.status}: ${error}`,
        latency,
      };
    } catch (error) {
      return {
        available: false,
        error: `Cannot connect to OpenAI API: ${error}`,
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
    // Find pricing for the model (handle variants like gpt-4-0125-preview)
    const baseModel = Object.keys(PRICING).find(key => model.startsWith(key)) || 'gpt-4';
    const pricing = PRICING[baseModel];
    
    if (!pricing) {
      return 0;
    }

    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;
    
    return Math.round((inputCost + outputCost) * 10000) / 10000; // Round to 4 decimal places
  }
}