/**
 * Retry Policy Implementation with Exponential Backoff
 *
 * Implements PRD Section 12.5.4 - Retry Policies with Exponential Backoff.
 * Comprehensive retry strategies for different failure scenarios.
 */

import { EventEmitter } from 'events';

export type RetryCategory = 'transient' | 'recoverable' | 'permanent' | 'rate_limited';

export interface RetryPolicyConfig {
  maxRetries: number;
  category: RetryCategory;
  initialDelayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
  jitterFactor: number;
  respectRetryAfter?: boolean;
  retryableErrors?: string[];
  nonRetryableErrors?: string[];
}

export interface RetryAttempt {
  attempt: number;
  delayMs: number;
  timestamp: number;
  error?: Error;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: RetryAttempt[];
  totalTimeMs: number;
}

export interface RetryPolicyStats {
  totalAttempts: number;
  successfulRetries: number;
  failedRetries: number;
  totalDelayMs: number;
  averageDelayMs: number;
}

/**
 * Predefined retry policies following PRD 12.5.4
 */
export const RetryPolicies = {
  /**
   * Transient failures - Network flakes, temporary timeouts
   * Strategy: Immediate retry (3x) with backoff
   * Backoff: 100ms → 200ms → 400ms (jittered)
   */
  transient: (): RetryPolicyConfig => ({
    maxRetries: 3,
    category: 'transient',
    initialDelayMs: 100,
    backoffMultiplier: 2,
    maxDelayMs: 1000,
    jitterFactor: 0.2,
  }),

  /**
   * Recoverable failures - Service unavailable, rate limits
   * Strategy: Exponential backoff (max 5 retries)
   * Backoff: 1s → 2s → 4s → 8s → 16s (jittered)
   */
  recoverable: (): RetryPolicyConfig => ({
    maxRetries: 5,
    category: 'recoverable',
    initialDelayMs: 1000,
    backoffMultiplier: 2,
    maxDelayMs: 30000,
    jitterFactor: 0.2,
    respectRetryAfter: true,
  }),

  /**
   * Rate limited failures - HTTP 429 or similar
   * Strategy: Exponential backoff with ceiling
   * Backoff: 30s → 60s → 120s → 300s → 600s
   * Ceiling: Max 10 minutes before giving up
   */
  rateLimited: (): RetryPolicyConfig => ({
    maxRetries: 5,
    category: 'rate_limited',
    initialDelayMs: 30000,
    backoffMultiplier: 2,
    maxDelayMs: 600000, // 10 minutes
    jitterFactor: 0.25,
    respectRetryAfter: true,
  }),

  /**
   * Network operations - General network retry
   */
  network: (): RetryPolicyConfig => ({
    maxRetries: 5,
    category: 'transient',
    initialDelayMs: 500,
    backoffMultiplier: 2,
    maxDelayMs: 30000,
    jitterFactor: 0.2,
  }),

  /**
   * LLM calls - Respect circuit breaker
   */
  llm: (): RetryPolicyConfig => ({
    maxRetries: 3,
    category: 'recoverable',
    initialDelayMs: 2000,
    backoffMultiplier: 1.5,
    maxDelayMs: 60000,
    jitterFactor: 0.1,
  }),

  /**
   * Portal operations - Respect rate limits
   */
  portal: (): RetryPolicyConfig => ({
    maxRetries: 5,
    category: 'rate_limited',
    initialDelayMs: 5000,
    backoffMultiplier: 2,
    maxDelayMs: 60000,
    jitterFactor: 0.2,
  }),

  /**
   * File operations - Disk I/O can be flaky
   */
  file: (): RetryPolicyConfig => ({
    maxRetries: 3,
    category: 'transient',
    initialDelayMs: 100,
    backoffMultiplier: 2,
    maxDelayMs: 5000,
    jitterFactor: 0.1,
  }),

  /**
   * PDF compilation - Fallback to markdown
   */
  pdf: (): RetryPolicyConfig => ({
    maxRetries: 2,
    category: 'recoverable',
    initialDelayMs: 1000,
    backoffMultiplier: 1,
    maxDelayMs: 5000,
    jitterFactor: 0,
  }),

  /**
   * No retry - For permanent failures
   */
  none: (): RetryPolicyConfig => ({
    maxRetries: 0,
    category: 'permanent',
    initialDelayMs: 0,
    backoffMultiplier: 1,
    maxDelayMs: 0,
    jitterFactor: 0,
  }),
};

/**
 * Retry Policy implementation
 */
export class RetryPolicy extends EventEmitter {
  private config: RetryPolicyConfig;
  private stats: RetryPolicyStats = {
    totalAttempts: 0,
    successfulRetries: 0,
    failedRetries: 0,
    totalDelayMs: 0,
    averageDelayMs: 0,
  };

  constructor(config: RetryPolicyConfig) {
    super();
    this.config = config;
  }

  /**
   * Execute a function with retry logic
   */
  async execute<T>(
    fn: (attempt: number) => Promise<T>,
    context?: { retryAfter?: number; operation?: string }
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    const attempts: RetryAttempt[] = [];
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      this.stats.totalAttempts++;

      try {
        const result = await fn(attempt);

        // Success
        if (attempt > 0) {
          this.stats.successfulRetries++;
          this.emit('retrySuccess', {
            attempt,
            operation: context?.operation,
            totalTimeMs: Date.now() - startTime,
          });
        }

        return {
          success: true,
          result,
          attempts,
          totalTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if this is a non-retryable error
        if (this.isNonRetryableError(lastError)) {
          this.emit('nonRetryableError', {
            error: lastError,
            attempt,
            operation: context?.operation,
          });
          break;
        }

        // Record the failed attempt
        const attemptRecord: RetryAttempt = {
          attempt,
          delayMs: attempt > 0 ? this.calculateDelay(attempt - 1) : 0,
          timestamp: Date.now(),
          error: lastError,
        };
        attempts.push(attemptRecord);

        // Check if we should retry
        if (attempt >= this.config.maxRetries) {
          this.stats.failedRetries++;
          this.emit('maxRetriesExceeded', {
            error: lastError,
            attempts,
            operation: context?.operation,
          });
          break;
        }

        // Calculate delay for next attempt
        const delayMs = this.calculateDelay(attempt, context?.retryAfter);
        this.stats.totalDelayMs += delayMs;
        this.stats.averageDelayMs = this.stats.totalDelayMs / (attempt + 1);

        this.emit('retryAttempt', {
          attempt: attempt + 1,
          maxRetries: this.config.maxRetries,
          delayMs,
          error: lastError,
          operation: context?.operation,
        });

        // Wait before retrying
        await this.sleep(delayMs);
      }
    }

    return {
      success: false,
      error: lastError,
      attempts,
      totalTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Calculate delay for a specific attempt
   */
  calculateDelay(attempt: number, retryAfter?: number): number {
    // Respect Retry-After header if provided
    if (this.config.respectRetryAfter && retryAfter && retryAfter > 0) {
      return retryAfter;
    }

    // Calculate exponential backoff
    let delay = this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt);

    // Cap at max delay
    delay = Math.min(delay, this.config.maxDelayMs);

    // Add jitter
    if (this.config.jitterFactor > 0) {
      const jitter = delay * this.config.jitterFactor * (Math.random() * 2 - 1);
      delay += jitter;
    }

    return Math.max(0, Math.round(delay));
  }

  /**
   * Check if an error is non-retryable
   */
  private isNonRetryableError(error: Error): boolean {
    // Check explicit non-retryable errors
    if (this.config.nonRetryableErrors) {
      for (const pattern of this.config.nonRetryableErrors) {
        if (error.message.includes(pattern) || error.name === pattern) {
          return true;
        }
      }
    }

    // Check explicit retryable errors (if defined, only these are retryable)
    if (this.config.retryableErrors && this.config.retryableErrors.length > 0) {
      for (const pattern of this.config.retryableErrors) {
        if (error.message.includes(pattern) || error.name === pattern) {
          return false;
        }
      }
      return true; // Not in retryable list
    }

    // Default: check for permanent error indicators
    const permanentErrors = [
      'ENOTFOUND',
      'EACCES',
      'EPERM',
      'EINVAL',
      'EEXIST',
    ];

    for (const code of permanentErrors) {
      if (error.message.includes(code)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get retry statistics
   */
  getStats(): RetryPolicyStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      totalDelayMs: 0,
      averageDelayMs: 0,
    };
  }

  /**
   * Sleep for a given duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Retry Policy Registry
 */
export class RetryPolicyRegistry {
  private policies = new Map<string, RetryPolicy>();

  /**
   * Register a policy
   */
  register(name: string, policy: RetryPolicy): void {
    this.policies.set(name, policy);
  }

  /**
   * Get a policy by name
   */
  get(name: string): RetryPolicy | undefined {
    return this.policies.get(name);
  }

  /**
   * Get or create a policy from predefined templates
   */
  getPredefined(name: keyof typeof RetryPolicies): RetryPolicy {
    if (!this.policies.has(name)) {
      const config = RetryPolicies[name]();
      this.policies.set(name, new RetryPolicy(config));
    }
    return this.policies.get(name)!;
  }

  /**
   * Check if a policy exists
   */
  has(name: string): boolean {
    return this.policies.has(name);
  }

  /**
   * Get all policies
   */
  getAll(): RetryPolicy[] {
    return Array.from(this.policies.values());
  }

  /**
   * Clear all policies
   */
  clear(): void {
    this.policies.clear();
  }
}

// Singleton instance
let registryInstance: RetryPolicyRegistry | null = null;

export function getRetryPolicyRegistry(): RetryPolicyRegistry {
  if (!registryInstance) {
    registryInstance = new RetryPolicyRegistry();
  }
  return registryInstance;
}

export function createRetryPolicy(config: RetryPolicyConfig): RetryPolicy {
  return new RetryPolicy(config);
}

export function getRetryPolicy(name: keyof typeof RetryPolicies): RetryPolicy {
  return getRetryPolicyRegistry().getPredefined(name);
}
