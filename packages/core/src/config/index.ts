import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import YAML from 'yaml';
import { z } from 'zod';

// Configuration schema validation
const LaTeXConfigSchema = z.object({
  engine: z.enum(['pdflatex', 'xelatex', 'lualatex']).default('pdflatex'),
  maxRuns: z.number().default(3),
  timeout: z.number().default(60000),
});

const LLMProviderSchema = z.enum([
  'ollama',
  'llamacpp',
  'openai',
  'anthropic',
  'google',
  'azure-openai',
]);

const LLMConfigSchema = z.object({
  provider: LLMProviderSchema.default('ollama'),
  baseUrl: z.string().optional(),
  model: z.string().default('llama3.1:8b'),
  temperature: z.number().default(0.3),
  maxTokens: z.number().default(4096),
  timeout: z.number().default(120000),
  // External API specific settings
  apiKeyEnvVar: z.string().optional(), // Environment variable name for API key
  apiKey: z.string().optional(), // Only used if env var is not set (not recommended)
  organization: z.string().optional(), // For OpenAI organization
  // Rate limiting
  rateLimit: z.object({
    enabled: z.boolean().default(true),
    maxRequestsPerMinute: z.number().default(60),
  }).default({}),
  // Cost tracking
  costTracking: z.object({
    enabled: z.boolean().default(true),
    maxMonthlyBudget: z.number().optional(), // in USD
  }).default({}),
});

const PathsConfigSchema = z.object({
  dataDir: z.string().default('./data'),
  resumesDir: z.string().default('./resumes'),
  buildsDir: z.string().default('./resumes/builds'),
  dbPath: z.string().default('./data/tracker.sqlite'),
  logPath: z.string().default('./data/logs'),
});

const TailoringConfigSchema = z.object({
  maxSkills: z.number().default(15),
  maxBulletPoints: z.number().default(6),
  keywordBudget: z.number().default(0.8),
  enforceTruthfulness: z.boolean().default(true),
  generateCoverLetter: z.boolean().default(true),
});

const PortalsConfigSchema = z.object({
  defaultMode: z.enum(['assist', 'autofill']).default('assist'),
  stopBeforeSubmit: z.boolean().default(true),
  humanLikeDelays: z.boolean().default(true),
});

const ConfigSchema = z.object({
  version: z.string().default('1.0.0'),
  latex: LaTeXConfigSchema.default({}),
  llm: LLMConfigSchema.default({}),
  paths: PathsConfigSchema.default({}),
  tailoring: TailoringConfigSchema.default({}),
  portals: PortalsConfigSchema.default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
export type LLMProvider = z.infer<typeof LLMProviderSchema>;

export class ConfigManager {
  private config: Config;
  private configPath: string;
  private static instance: ConfigManager;

  private constructor() {
    this.configPath = this.getConfigPath();
    this.config = this.loadConfig();
    this.ensureDirectories();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  static resetInstance(): void {
    ConfigManager.instance = undefined as unknown as ConfigManager;
  }

  private getConfigPath(): string {
    // Check environment variable first
    if (process.env.APPLYPILOT_CONFIG) {
      return process.env.APPLYPILOT_CONFIG;
    }

    // Check current directory
    const localConfig = join(process.cwd(), 'config.yaml');
    if (existsSync(localConfig)) {
      return localConfig;
    }

    // Use user home directory
    const homeDir = homedir();
    const configDir = join(homeDir, '.applypilot');
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    return join(configDir, 'config.yaml');
  }

  private loadConfig(): Config {
    if (!existsSync(this.configPath)) {
      const defaultConfig = this.getDefaultConfig();
      this.saveConfig(defaultConfig);
      return defaultConfig;
    }

    try {
      const content = readFileSync(this.configPath, 'utf-8');
      const parsed = YAML.parse(content);
      return ConfigSchema.parse(parsed);
    } catch (error) {
      console.warn(`Failed to load config from ${this.configPath}, using defaults`);
      return this.getDefaultConfig();
    }
  }

  private getDefaultConfig(): Config {
    return {
      version: '1.0.0',
      latex: {
        engine: 'pdflatex',
        maxRuns: 3,
        timeout: 60000,
      },
      llm: {
        provider: 'ollama',
        baseUrl: 'http://localhost:11434',
        model: 'llama3.1:8b',
        temperature: 0.3,
        maxTokens: 4096,
        timeout: 120000,
        rateLimit: {
          enabled: true,
          maxRequestsPerMinute: 60,
        },
        costTracking: {
          enabled: true,
        },
      },
      paths: {
        dataDir: './data',
        resumesDir: './resumes',
        buildsDir: './resumes/builds',
        dbPath: './data/tracker.sqlite',
        logPath: './data/logs',
      },
      tailoring: {
        maxSkills: 15,
        maxBulletPoints: 6,
        keywordBudget: 0.8,
        enforceTruthfulness: true,
        generateCoverLetter: true,
      },
      portals: {
        defaultMode: 'assist',
        stopBeforeSubmit: true,
        humanLikeDelays: true,
      },
    };
  }

  private saveConfig(config: Config): void {
    const yaml = YAML.stringify(config);
    writeFileSync(this.configPath, yaml, 'utf-8');
  }

  private ensureDirectories(): void {
    const dirs = [
      this.config.paths.dataDir,
      this.config.paths.resumesDir,
      this.config.paths.buildsDir,
      this.config.paths.logPath,
    ];

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  getConfig(): Config {
    return this.config;
  }

  getLaTeXConfig() {
    return this.config.latex;
  }

  getLLMConfig() {
    return this.config.llm;
  }

  getPathsConfig() {
    return this.config.paths;
  }

  getTailoringConfig() {
    return this.config.tailoring;
  }

  getPortalsConfig() {
    return this.config.portals;
  }

  updateConfig(updates: Partial<Config>): void {
    this.config = ConfigSchema.parse({ ...this.config, ...updates });
    this.saveConfig(this.config);
  }

  updateLLMConfig(updates: Partial<Config['llm']>): void {
    this.config.llm = { ...this.config.llm, ...updates };
    this.saveConfig(this.config);
  }

  getConfigPathLocation(): string {
    return this.configPath;
  }

  /**
   * Get the appropriate environment variable name for API key based on provider
   */
  getAPIKeyEnvVar(): string {
    const provider = this.config.llm.provider;
    const envVarMap: Record<string, string> = {
      'openai': 'OPENAI_API_KEY',
      'anthropic': 'ANTHROPIC_API_KEY',
      'google': 'GOOGLE_API_KEY',
      'azure-openai': 'AZURE_OPENAI_API_KEY',
    };
    
    return this.config.llm.apiKeyEnvVar || envVarMap[provider] || `${provider.toUpperCase()}_API_KEY`;
  }

  /**
   * Check if current provider is an external API
   */
  isExternalProvider(): boolean {
    const externalProviders: LLMProvider[] = ['openai', 'anthropic', 'google', 'azure-openai'];
    return externalProviders.includes(this.config.llm.provider);
  }

  /**
   * Get API key from environment or config
   */
  getAPIKey(): string | undefined {
    const envVar = this.getAPIKeyEnvVar();
    return process.env[envVar] || this.config.llm.apiKey;
  }
}

// Convenience function
export function getConfig(): Config {
  return ConfigManager.getInstance().getConfig();
}

// Hot reload exports
export {
  HotReloadManager,
  getHotReloadManager,
  initializeHotReload,
  disposeHotReload,
} from './hot-reload.js';
export type {
  HotReloadConfig,
  ConfigChangeEvent,
  ConfigValidator,
} from './hot-reload.js';

// Secrets manager exports
export {
  SecretsManager,
  getSecretsManager,
  redactSensitiveInfo,
} from './secrets-manager.js';
export type {
  Secret,
  SecretsConfig,
  RedactionRule,
} from './secrets-manager.js';