import type { 
  LLMRequest, 
  LLMResponse, 
  LLMStreamChunk,
  LLMHealthCheck,
  StreamHandler 
} from './types.js';
import { LLMAdapter } from './adapter.js';

// Azure OpenAI pricing varies by region and deployment
// These are approximate prices per 1K tokens
const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-35-turbo': { input: 0.0005, output: 0.0015 },
};

export class AzureOpenAIAdapter extends LLMAdapter {
  private endpoint: string;
  private apiKey: string;
  private deploymentName: string;
  private apiVersion: string;

  constructor(config: ConstructorParameters<typeof LLMAdapter>[0]) {
    super(config);
    // Azure endpoint format: https://{resource-name}.openai.azure.com
    this.endpoint = config.baseUrl || '';
    this.apiKey = config.apiKey || '';
    // Deployment name is often different from model name in Azure
    this.deploymentName = config.model || '';
    this.apiVersion = '2024-02-01';
  }

  getProvider(): string {
    return 'azure-openai';
  }

  getDefaultModel(): string {
    return 'gpt-4';
  }

  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.endpoint) {
      errors.push('Azure OpenAI endpoint is required. Set baseUrl in config (e.g., https://your-resource.openai.azure.com)');
    }

    if (!this.apiKey) {
      errors.push('API key is required for Azure OpenAI. Set AZURE_OPENAI_API_KEY environment variable.');
    }

    if (!this.deploymentName) {
      errors.push('Deployment name is required for Azure OpenAI. Set it as the model in config.');
    }

    return { valid: errors.length === 0, errors };
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'api-key': this.apiKey,
    };
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    
    const response = await fetch(
      `${this.endpoint}/openai/deployments/${this.deploymentName}/chat/completions?api-version=${this.apiVersion}`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          messages: request.messages,
          temperature: request.temperature ?? this.config.temperature,
          max_tokens: request.maxTokens ?? this.config.maxTokens,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Azure OpenAI API error: ${error}`);
    }

    const data = await response.json() as {
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const latency = Date.now() - startTime;

    const usage = data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    
    // Try to determine the actual model from the deployment
    const actualModel = data.model || this.deploymentName;
    const cost = this.calculateCost(
      actualModel,
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
      model: actualModel,
      provider: 'azure-openai',
    };
  }

  async stream(request: LLMRequest, handler: StreamHandler): Promise<void> {
    const response = await fetch(
      `${this.endpoint}/openai/deployments/${this.deploymentName}/chat/completions?api-version=${this.apiVersion}`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          messages: request.messages,
          temperature: request.temperature ?? this.config.temperature,
          max_tokens: request.maxTokens ?? this.config.maxTokens,
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Azure OpenAI API error: ${error}`);
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
      // Azure doesn't have a simple health endpoint, so we try to list models
      const response = await fetch(
        `${this.endpoint}/openai/models?api-version=${this.apiVersion}`,
        {
          method: 'GET',
          headers: this.getHeaders(),
          signal: AbortSignal.timeout(10000),
        }
      );

      const latency = Date.now() - startTime;

      if (response.ok) {
        return {
          available: true,
          latency,
          model: this.deploymentName,
        };
      }

      const error = await response.text();
      return {
        available: false,
        error: `Azure OpenAI API returned status ${response.status}: ${error}`,
        latency,
      };
    } catch (error) {
      return {
        available: false,
        error: `Cannot connect to Azure OpenAI API: ${error}`,
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
      this.deploymentName,
      estimatedInputTokens,
      estimatedOutputTokens
    );
  }

  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    // Find pricing for the model (handle variants)
    const baseModel = Object.keys(PRICING).find(key => 
      model.toLowerCase().includes(key.toLowerCase())
    ) || 'gpt-4';
    const pricing = PRICING[baseModel];
    
    if (!pricing) {
      return 0;
    }

    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;
    
    return Math.round((inputCost + outputCost) * 10000) / 10000;
  }
}
