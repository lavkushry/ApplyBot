import { request } from 'http';
import { LLMAdapter } from './adapter.js';
import type { LLMHealthCheck, LLMRequest, LLMResponse, StreamHandler } from './types.js';

export class OllamaAdapter extends LLMAdapter {
  private baseUrl: string;

  constructor(config: ConstructorParameters<typeof LLMAdapter>[0]) {
    super(config);
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
  }

  getProvider(): string {
    return 'ollama';
  }

  getDefaultModel(): string {
    return 'llama3.1:8b';
  }

  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.baseUrl) {
      errors.push('Base URL is required for Ollama');
    }

    try {
      new URL(this.baseUrl);
    } catch {
      errors.push(`Invalid base URL: ${this.baseUrl}`);
    }

    return { valid: errors.length === 0, errors };
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || this.config.model,
        messages: request.messages,
        stream: false,
        options: {
          temperature: request.temperature ?? this.config.temperature,
          num_predict: request.maxTokens ?? this.config.maxTokens,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${error}`);
    }

    const data = (await response.json()) as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
      model?: string;
    };
    const latency = Date.now() - startTime;

    return {
      content: data.message?.content || '',
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
      cost: 0, // Local LLM is free
      model: data.model || request.model || this.config.model,
      provider: 'ollama',
    };
  }

  async stream(request: LLMRequest, handler: StreamHandler): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || this.config.model,
        messages: request.messages,
        stream: true,
        options: {
          temperature: request.temperature ?? this.config.temperature,
          num_predict: request.maxTokens ?? this.config.maxTokens,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${error}`);
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
          if (line.trim()) {
            try {
              const chunk = JSON.parse(line);
              handler({
                content: chunk.message?.content || '',
                done: chunk.done || false,
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
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      const latency = Date.now() - startTime;

      if (response.ok) {
        const data = (await response.json()) as { models?: Array<{ name: string }> };
        const models = data.models || [];
        const defaultModel = this.config.model;
        const hasModel = models.some((m: { name: string }) => m.name === defaultModel);

        return {
          available: true,
          latency,
          model: hasModel ? defaultModel : `${defaultModel} (not pulled)`,
        };
      }

      return {
        available: false,
        error: `Ollama returned status ${response.status}`,
        latency,
      };
    } catch (error) {
      return {
        available: false,
        error: `Cannot connect to Ollama at ${this.baseUrl}. Is it running?`,
      };
    }
  }

  estimateCost(): number {
    return 0; // Local LLM is free
  }
}
