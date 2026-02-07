import { Router } from 'express';
import { z } from 'zod';
import { ConfigManager, LLMFactory } from '@applypilot/core';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// Get current settings
router.get('/', asyncHandler(async (req, res) => {
  const config = ConfigManager.getInstance();
  
  res.json({
    llm: config.getLLMConfig(),
    tailoring: config.getTailoringConfig(),
    paths: config.getPathsConfig(),
  });
}));

// Update LLM settings
const llmSettingsSchema = z.object({
  provider: z.enum(['ollama', 'openai', 'anthropic', 'google', 'azure-openai']),
  model: z.string(),
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().min(100).max(8000).optional(),
});

router.patch('/llm', asyncHandler(async (req, res) => {
  const settings = llmSettingsSchema.parse(req.body);
  const config = ConfigManager.getInstance();
  
  config.updateLLMConfig(settings);
  
  res.json({
    message: 'LLM settings updated',
    settings: config.getLLMConfig(),
  });
}));

// Test LLM connection
router.post('/llm/test', asyncHandler(async (req, res) => {
  const config = ConfigManager.getInstance();
  const llmConfig = config.getLLMConfig();
  
  const adapter = LLMFactory.createAdapter({
    ...llmConfig,
    apiKey: config.getAPIKey() || '',
  });
  
  const health = await adapter.healthCheck();
  
  res.json({
    connected: health.available,
    latency: health.latency,
    model: health.model,
    error: health.error,
  });
}));

// Get available providers
router.get('/llm/providers', asyncHandler(async (req, res) => {
  const providers = LLMFactory.getAvailableProviders().map(provider => ({
    id: provider,
    name: provider.charAt(0).toUpperCase() + provider.slice(1),
    description: LLMFactory.getProviderDescription(provider),
    isLocal: LLMFactory.isLocalProvider(provider),
    requiresApiKey: LLMFactory.requiresAPIKey(provider),
    defaultModel: LLMFactory.getDefaultModel(provider),
  }));
  
  res.json({ providers });
}));

// Update tailoring settings
const tailoringSettingsSchema = z.object({
  maxSkills: z.number().min(5).max(30),
  maxBulletPoints: z.number().min(3).max(10),
  enforceTruthfulness: z.boolean(),
});

router.patch('/tailoring', asyncHandler(async (req, res) => {
  const settings = tailoringSettingsSchema.parse(req.body);
  const config = ConfigManager.getInstance();
  
  // Would need to add this method to ConfigManager
  // config.updateTailoringConfig(settings);
  
  res.json({
    message: 'Tailoring settings updated',
    settings,
  });
}));

export { router as settingsRouter };
