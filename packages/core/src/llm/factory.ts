import type { LLMConfig } from './types.js';
import { LLMAdapter } from './adapter.js';
import { OllamaAdapter } from './ollama-adapter.js';
import { OpenAIAdapter } from './openai-adapter.js';
import { AnthropicAdapter } from './anthropic-adapter.js';
import { GoogleAdapter } from './google-adapter.js';
import { AzureOpenAIAdapter } from './azure-adapter.js';

export class LLMFactory {
  /**
   * Create an LLM adapter based on configuration
   */
  static createAdapter(config: LLMConfig): LLMAdapter {
    switch (config.provider) {
      case 'ollama':
        return new OllamaAdapter(config);
      case 'llamacpp':
        // For now, llama.cpp uses the same adapter pattern as Ollama
        // In the future, this could be a separate adapter
        return new OllamaAdapter({ ...config, baseUrl: config.baseUrl || 'http://localhost:8080' });
      case 'openai':
        return new OpenAIAdapter(config);
      case 'anthropic':
        return new AnthropicAdapter(config);
      case 'google':
        return new GoogleAdapter(config);
      case 'azure-openai':
        return new AzureOpenAIAdapter(config);
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  }

  /**
   * Get available providers
   */
  static getAvailableProviders(): string[] {
    return [
      'ollama',
      'llamacpp',
      'openai',
      'anthropic',
      'google',
      'azure-openai',
    ];
  }

  /**
   * Get default model for a provider
   */
  static getDefaultModel(provider: string): string {
    switch (provider) {
      case 'ollama':
        return 'llama3.1:8b';
      case 'llamacpp':
        return 'local-model';
      case 'openai':
        return 'gpt-4o';
      case 'anthropic':
        return 'claude-3-sonnet-20240229';
      case 'google':
        return 'gemini-1.5-flash';
      case 'azure-openai':
        return 'gpt-4';
      default:
        return 'unknown';
    }
  }

  /**
   * Get environment variable name for API key
   */
  static getAPIKeyEnvVar(provider: string): string {
    const envVarMap: Record<string, string> = {
      'openai': 'OPENAI_API_KEY',
      'anthropic': 'ANTHROPIC_API_KEY',
      'google': 'GOOGLE_API_KEY',
      'azure-openai': 'AZURE_OPENAI_API_KEY',
    };
    
    return envVarMap[provider] || `${provider.toUpperCase()}_API_KEY`;
  }

  /**
   * Check if provider requires an API key
   */
  static requiresAPIKey(provider: string): boolean {
    const apiKeyProviders = ['openai', 'anthropic', 'google', 'azure-openai'];
    return apiKeyProviders.includes(provider);
  }

  /**
   * Check if provider is local (no external API calls)
   */
  static isLocalProvider(provider: string): boolean {
    return provider === 'ollama' || provider === 'llamacpp';
  }

  /**
   * Get provider description
   */
  static getProviderDescription(provider: string): string {
    const descriptions: Record<string, string> = {
      'ollama': 'Local LLM via Ollama (default, free, private)',
      'llamacpp': 'Local LLM via llama.cpp (default, free, private)',
      'openai': 'OpenAI GPT models (requires API key)',
      'anthropic': 'Anthropic Claude models (requires API key)',
      'google': 'Google Gemini models (requires API key)',
      'azure-openai': 'Azure OpenAI Service (requires API key)',
    };
    
    return descriptions[provider] || provider;
  }

  /**
   * Get provider-specific setup instructions
   */
  static getSetupInstructions(provider: string): string {
    const instructions: Record<string, string> = {
      'ollama': `
1. Install Ollama: https://ollama.ai/download
2. Pull a model: ollama pull llama3.1:8b
3. Start Ollama: ollama serve
4. ApplyPilot will connect to http://localhost:11434`,
      
      'openai': `
1. Get API key from: https://platform.openai.com/api-keys
2. Set environment variable: export OPENAI_API_KEY="sk-..."
3. Run: applypilot set-llm --provider openai --model gpt-4o`,
      
      'anthropic': `
1. Get API key from: https://console.anthropic.com/
2. Set environment variable: export ANTHROPIC_API_KEY="sk-ant-..."
3. Run: applypilot set-llm --provider anthropic --model claude-3-sonnet-20240229`,
      
      'google': `
1. Get API key from: https://makersuite.google.com/app/apikey
2. Set environment variable: export GOOGLE_API_KEY="..."
3. Run: applypilot set-llm --provider google --model gemini-1.5-flash`,
      
      'azure-openai': `
1. Create Azure OpenAI resource in Azure Portal
2. Deploy a model in Azure AI Studio
3. Get endpoint and key from Azure Portal
4. Set environment variable: export AZURE_OPENAI_API_KEY="..."
5. Run: applypilot set-llm --provider azure-openai --model your-deployment-name
6. Edit config.yaml to set baseUrl: https://your-resource.openai.azure.com`,
    };
    
    return instructions[provider] || 'See documentation for setup instructions.';
  }
}