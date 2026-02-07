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
  'gemini-1.5-pro': { input: 0.0035, output: 0.0105 },
  'gemini-1.5-flash': { input: 0.00035, output: 0.00105 },
  'gemini-pro': { input: 0.0005, output: 0.0015 },
};

export class GoogleAdapter extends LLMAdapter {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: ConstructorParameters<typeof LLMAdapter>[0]) {
    super(config);
    this.baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    this.apiKey = config.apiKey || '';
  }

  getProvider(): string {
    return 'google';
  }

  getDefaultModel(): string {
    return 'gemini-1.5-flash';
  }

  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.apiKey) {
      errors.push('API key is required for Google. Set GOOGLE_API_KEY environment variable.');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Convert messages to Google Gemini format
   */
  private convertMessages(messages: LLMRequest['messages']): {
    systemInstruction?: { parts: { text: string } };
    contents: Array<{ role: string; parts: { text: string }[] }>;
  } {
    let systemInstruction: { parts: { text: string } } | undefined;
    const contents: Array<{ role: string; parts: { text: string }[] }> = [];

    for (const message of messages) {
      if (message.role === 'system') {
        systemInstruction = { parts: { text: message.content } };
      } else {
        contents.push({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        });
      }
    }

    return { systemInstruction, contents };
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    
    const { systemInstruction, contents } = this.convertMessages(request.messages);
    const model = request.model || this.config.model;
    
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? this.config.temperature,
        maxOutputTokens: request.maxTokens ?? this.config.maxTokens,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    const response = await fetch(
      `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google API error: ${error}`);
    }

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
    };
    const latency = Date.now() - startTime;

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const usage = data.usageMetadata || { promptTokenCount: 0, candidatesTokenCount: 0 };
    
    const cost = this.calculateCost(
      model,
      usage.promptTokenCount,
      usage.candidatesTokenCount
    );

    return {
      content,
      usage: {
        promptTokens: usage.promptTokenCount,
        completionTokens: usage.candidatesTokenCount,
        totalTokens: usage.promptTokenCount + usage.candidatesTokenCount,
      },
      cost,
      model,
      provider: 'google',
    };
  }

  async stream(request: LLMRequest, handler: StreamHandler): Promise<void> {
    const { systemInstruction, contents } = this.convertMessages(request.messages);
    const model = request.model || this.config.model;
    
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? this.config.temperature,
        maxOutputTokens: request.maxTokens ?? this.config.maxTokens,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    const response = await fetch(
      `${this.baseUrl}/models/${model}:streamGenerateContent?key=${this.apiKey}&alt=sse`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google API error: ${error}`);
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
              const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
              
              handler({
                content: text,
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
      const response = await fetch(
        `${this.baseUrl}/models?key=${this.apiKey}`,
        {
          method: 'GET',
          signal: AbortSignal.timeout(10000),
        }
      );

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
        error: `Google API returned status ${response.status}: ${error}`,
        latency,
      };
    } catch (error) {
      return {
        available: false,
        error: `Cannot connect to Google API: ${error}`,
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
    const baseModel = Object.keys(PRICING).find(key => model.includes(key)) || 'gemini-pro';
    const pricing = PRICING[baseModel];
    
    if (!pricing) {
      return 0;
    }

    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;
    
    return Math.round((inputCost + outputCost) * 10000) / 10000;
  }
}
