/**
 * Skill Registry - OpenClaw-inspired Skills System
 *
 * Manages skill registration, discovery, and execution.
 * Provides AgentSkills-compatible interface.
 */

import type {
  Skill,
  SkillDefinition,
  SkillCategory,
  SkillSearchOptions,
  SkillResult,
  SkillContext,
  SkillExecutionMetadata,
  SkillError,
} from './types.js';

export interface SkillRegistryConfig {
  defaultTimeoutMs: number;
  maxConcurrentExecutions: number;
  enableCaching: boolean;
  cacheTtlMs: number;
}

export class SkillRegistryImpl {
  private skills = new Map<string, Skill>();
  private config: SkillRegistryConfig;
  private executionCount = 0;
  private cache = new Map<string, { result: SkillResult; timestamp: number }>();

  constructor(config: Partial<SkillRegistryConfig> = {}) {
    this.config = {
      defaultTimeoutMs: 30000,
      maxConcurrentExecutions: 10,
      enableCaching: false,
      cacheTtlMs: 60000,
      ...config,
    };
  }

  /**
   * Register a skill
   */
  register(skill: Skill): void {
    if (this.skills.has(skill.id)) {
      throw new Error(`Skill already registered: ${skill.id}`);
    }

    // Validate skill
    this.validateSkill(skill);

    this.skills.set(skill.id, skill);
  }

  /**
   * Unregister a skill
   */
  unregister(skillId: string): boolean {
    return this.skills.delete(skillId);
  }

  /**
   * Get a skill by ID
   */
  get(skillId: string): Skill | undefined {
    return this.skills.get(skillId);
  }

  /**
   * Search skills with filters
   */
  search(options: SkillSearchOptions): Skill[] {
    let results = Array.from(this.skills.values());

    if (options.query) {
      const query = options.query.toLowerCase();
      results = results.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query) ||
          s.tags.some((t) => t.toLowerCase().includes(query))
      );
    }

    if (options.category) {
      results = results.filter((s) => s.category === options.category);
    }

    if (options.tags && options.tags.length > 0) {
      results = results.filter((s) =>
        options.tags!.some((tag) => s.tags.includes(tag))
      );
    }

    if (options.requiresApproval !== undefined) {
      results = results.filter(
        (s) => s.requiresApproval === options.requiresApproval
      );
    }

    return results;
  }

  /**
   * List all skills
   */
  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get all skill categories
   */
  getCategories(): SkillCategory[] {
    const categories = new Set<SkillCategory>();
    for (const skill of this.skills.values()) {
      categories.add(skill.category);
    }
    return Array.from(categories);
  }

  /**
   * Get all skill tags
   */
  getTags(): string[] {
    const tags = new Set<string>();
    for (const skill of this.skills.values()) {
      for (const tag of skill.tags) {
        tags.add(tag);
      }
    }
    return Array.from(tags);
  }

  /**
   * Execute a skill
   */
  async execute(
    skillId: string,
    parameters: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      return this.createErrorResult('SKILL_NOT_FOUND', `Skill not found: ${skillId}`);
    }

    // Check concurrent execution limit
    if (this.executionCount >= this.config.maxConcurrentExecutions) {
      return this.createErrorResult(
        'MAX_CONCURRENT_EXCEEDED',
        'Maximum concurrent skill executions exceeded',
        { retryable: true }
      );
    }

    // Check cache
    if (this.config.enableCaching) {
      const cacheKey = this.getCacheKey(skillId, parameters);
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTtlMs) {
        return cached.result;
      }
    }

    // Validate parameters
    const validationError = this.validateParameters(skill, parameters);
    if (validationError) {
      return this.createErrorResult('INVALID_PARAMETERS', validationError);
    }

    // Execute with timeout
    this.executionCount++;
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      const timeoutMs = skill.timeoutMs || this.config.defaultTimeoutMs;

      const result = await this.executeWithTimeout(
        skill,
        parameters,
        context,
        timeoutMs
      );

      const executionTimeMs = Date.now() - startTime;
      const metadata: SkillExecutionMetadata = {
        executionTimeMs,
        startTime: new Date(startTime),
        endTime: new Date(),
        parameters,
        logs,
      };

      const skillResult: SkillResult = {
        success: result.success,
        data: result.data,
        error: result.error,
        metadata,
      };

      // Cache result if successful and caching enabled
      if (this.config.enableCaching && skillResult.success) {
        const cacheKey = this.getCacheKey(skillId, parameters);
        this.cache.set(cacheKey, { result: skillResult, timestamp: Date.now() });
      }

      return skillResult;
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const skillError: SkillError = {
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : String(error),
        retryable: true,
      };

      return {
        success: false,
        error: skillError,
        metadata: {
          executionTimeMs,
          startTime: new Date(startTime),
          endTime: new Date(),
          parameters,
          logs,
        },
      };
    } finally {
      this.executionCount--;
    }
  }

  /**
   * Get skill manifest for AgentSkills compatibility
   */
  getManifest(): {
    skills: SkillDefinition[];
    version: string;
    name: string;
    description: string;
  } {
    return {
      skills: this.list().map((s) => this.toSkillDefinition(s)),
      version: '1.0.0',
      name: 'ApplyPilot Skills',
      description: 'Job search automation skills for ApplyPilot',
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalSkills: number;
    categories: number;
    tags: number;
    activeExecutions: number;
    cacheSize: number;
  } {
    return {
      totalSkills: this.skills.size,
      categories: this.getCategories().length,
      tags: this.getTags().length,
      activeExecutions: this.executionCount,
      cacheSize: this.cache.size,
    };
  }

  // Private methods

  private validateSkill(skill: Skill): void {
    if (!skill.id) throw new Error('Skill ID is required');
    if (!skill.name) throw new Error('Skill name is required');
    if (!skill.handler) throw new Error('Skill handler is required');

    // Validate parameters
    for (const param of skill.parameters) {
      if (!param.name) throw new Error('Parameter name is required');
      if (!param.type) throw new Error(`Parameter type is required for ${param.name}`);
    }
  }

  private validateParameters(
    skill: Skill,
    parameters: Record<string, unknown>
  ): string | null {
    for (const param of skill.parameters) {
      if (param.required && !(param.name in parameters)) {
        return `Missing required parameter: ${param.name}`;
      }

      const value = parameters[param.name];
      if (value !== undefined) {
        // Type validation
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== param.type) {
          return `Invalid type for parameter ${param.name}: expected ${param.type}, got ${actualType}`;
        }

        // Enum validation
        if (param.enum && !param.enum.includes(value)) {
          return `Invalid value for parameter ${param.name}: must be one of ${param.enum.join(', ')}`;
        }

        // String validation
        if (param.type === 'string' && typeof value === 'string') {
          if (param.validation?.minLength && value.length < param.validation.minLength) {
            return `Parameter ${param.name} must be at least ${param.validation.minLength} characters`;
          }
          if (param.validation?.maxLength && value.length > param.validation.maxLength) {
            return `Parameter ${param.name} must be at most ${param.validation.maxLength} characters`;
          }
          if (param.validation?.pattern && !new RegExp(param.validation.pattern).test(value)) {
            return `Parameter ${param.name} does not match required pattern`;
          }
        }

        // Number validation
        if (param.type === 'number' && typeof value === 'number') {
          if (param.validation?.min !== undefined && value < param.validation.min) {
            return `Parameter ${param.name} must be at least ${param.validation.min}`;
          }
          if (param.validation?.max !== undefined && value > param.validation.max) {
            return `Parameter ${param.name} must be at most ${param.validation.max}`;
          }
        }
      }
    }

    return null;
  }

  private async executeWithTimeout(
    skill: Skill,
    parameters: Record<string, unknown>,
    context: SkillContext,
    timeoutMs: number
  ): Promise<SkillResult> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Skill execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      skill
        .handler(parameters, context)
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  private createErrorResult(
    code: string,
    message: string,
    options: { retryable?: boolean; details?: Record<string, unknown> } = {}
  ): SkillResult {
    return {
      success: false,
      error: {
        code,
        message,
        retryable: options.retryable ?? false,
        details: options.details,
      },
      metadata: {
        executionTimeMs: 0,
        startTime: new Date(),
        endTime: new Date(),
        parameters: {},
        logs: [],
      },
    };
  }

  private getCacheKey(skillId: string, parameters: Record<string, unknown>): string {
    return `${skillId}:${JSON.stringify(parameters)}`;
  }

  private toSkillDefinition(skill: Skill): SkillDefinition {
    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      version: skill.version,
      category: skill.category,
      tags: skill.tags,
      parameters: skill.parameters,
      returns: skill.returns,
      examples: skill.examples,
      requiresApproval: skill.requiresApproval,
      timeoutMs: skill.timeoutMs,
      metadata: skill.metadata,
    };
  }
}
