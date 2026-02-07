/**
 * Skills System Types - OpenClaw-inspired AgentSkills-compatible Architecture
 *
 * Skills are discoverable, composable capabilities that agents can use.
 * Each skill has a manifest, parameters, and execution logic.
 */

export interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  category: SkillCategory;
  tags: string[];
  parameters: SkillParameter[];
  returns: SkillReturn;
  examples: SkillExample[];
  handler: SkillHandler;
  requiresApproval: boolean;
  timeoutMs: number;
  metadata: SkillMetadata;
}

export type SkillCategory =
  | 'analysis'
  | 'generation'
  | 'research'
  | 'communication'
  | 'tracking'
  | 'integration'
  | 'utility';

export interface SkillParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  default?: unknown;
  enum?: unknown[];
  validation?: ParameterValidation;
}

export interface ParameterValidation {
  min?: number;
  max?: number;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
}

export interface SkillReturn {
  type: string;
  description: string;
  schema?: Record<string, unknown>;
}

export interface SkillExample {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  expectedResult: unknown;
}

export type SkillHandler = (
  params: Record<string, unknown>,
  context: SkillContext
) => Promise<SkillResult>;

export interface SkillContext {
  sessionId?: string;
  userId?: string;
  memory: MemoryManager;
  config: Record<string, unknown>;
  logger: Logger;
  abortSignal?: AbortSignal;
}

export interface SkillResult {
  success: boolean;
  data?: unknown;
  error?: SkillError;
  metadata: SkillExecutionMetadata;
}

export interface SkillError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
}

export interface SkillExecutionMetadata {
  executionTimeMs: number;
  startTime: Date;
  endTime: Date;
  parameters: Record<string, unknown>;
  logs: string[];
}

export interface SkillMetadata {
  author?: string;
  license?: string;
  homepage?: string;
  repository?: string;
  dependencies?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillManifest {
  skills: SkillDefinition[];
  version: string;
  name: string;
  description: string;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  category: SkillCategory;
  tags: string[];
  parameters: SkillParameter[];
  returns: SkillReturn;
  examples: SkillExample[];
  requiresApproval: boolean;
  timeoutMs: number;
  metadata: SkillMetadata;
}

export interface SkillSearchOptions {
  query?: string;
  category?: SkillCategory;
  tags?: string[];
  requiresApproval?: boolean;
}

export interface SkillRegistry {
  register(skill: Skill): void;
  unregister(skillId: string): boolean;
  get(skillId: string): Skill | undefined;
  search(options: SkillSearchOptions): Skill[];
  list(): Skill[];
  getCategories(): SkillCategory[];
  getTags(): string[];
}

// Forward declarations for types from other modules
interface MemoryManager {
  addEntry(content: string, type: string, options?: unknown): unknown;
  search(options: unknown): unknown[];
}

interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}
