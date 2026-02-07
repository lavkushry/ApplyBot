/**
 * Circuit Breaker Pattern Implementation
 *
 * Implements PRD Section 12.5.2 - Circuit Breaker Pattern.
 * Prevents cascading failures by automatically disabling failing components.
 */

import { EventEmitter } from 'events';

export type CircuitState = 'closed' | 'open' | 'half_open' | 'forced_open';

export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;
  successThreshold: number;
  openTimeout: number;
  halfOpenTimeout: number;
  cooldownPeriod: number;
  resetCount: number;
  backoff?: {
    enabled: boolean;
    initialMs: number;
    multiplier: number;
    maxMs: number;
    jitter: number;
  };
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  tripCount: number;
  totalRequests: number;
  rejectedRequests: number;
}

export interface CircuitBreakerEvent {
  name: string;
  fromState: CircuitState;
  toState: CircuitState;
  timestamp: number;
  reason?: string;
}

/**
 * Circuit Breaker implementation following PRD 12.5.2
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit tripped, requests blocked (fail-fast)
 * - HALF_OPEN: Allow one test request to check recovery
 * - FORCED_OPEN: Manually opened for testing
 */
export class CircuitBreaker extends EventEmitter {
  private name: string;
  private config: CircuitBreakerConfig;
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private tripCount = 0;
  private totalRequests = 0;
  private rejectedRequests = 0;
  private halfOpenTestInProgress = false;
  private resetTimer?: NodeJS.Timeout;

  constructor(config: CircuitBreakerConfig) {
    super();
    this.name = config.name;
    this.config = config;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if circuit allows the request
    if (!this.canExecute()) {
      this.rejectedRequests++;
      throw new CircuitBreakerError(
        `Circuit breaker '${this.name}' is ${this.state}`,
        this.state,
        this.name
      );
    }

    // If in half-open state, mark test as in progress
    if (this.state === 'half_open') {
      this.halfOpenTestInProgress = true;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Check if the circuit allows execution
   */
  canExecute(): boolean {
    switch (this.state) {
      case 'closed':
        return true;
      case 'open':
        // Check if we should transition to half-open
        if (this.shouldAttemptReset()) {
          this.transitionTo('half_open', 'Timeout elapsed, testing recovery');
          return true;
        }
        return false;
      case 'half_open':
        // Only allow one test request at a time
        return !this.halfOpenTestInProgress;
      case 'forced_open':
        return false;
      default:
        return false;
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      tripCount: this.tripCount,
      totalRequests: this.totalRequests,
      rejectedRequests: this.rejectedRequests,
    };
  }

  /**
   * Manually open the circuit (for testing)
   */
  forceOpen(reason?: string): void {
    this.transitionTo('forced_open', reason || 'Manually forced open');
  }

  /**
   * Manually close the circuit
   */
  forceClose(reason?: string): void {
    this.reset();
    this.transitionTo('closed', reason || 'Manually forced closed');
  }

  /**
   * Reset circuit to initial state
   */
  reset(): void {
    this.failures = 0;
    this.successes = 0;
    this.halfOpenTestInProgress = false;
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.lastSuccessTime = Date.now();

    switch (this.state) {
      case 'closed':
        // Reset failures on success in closed state
        this.failures = 0;
        break;
      case 'half_open':
        this.successes++;
        this.halfOpenTestInProgress = false;

        // If we've had enough successes, close the circuit
        if (this.successes >= this.config.successThreshold) {
          this.transitionTo('closed', 'Recovery confirmed, closing circuit');
        }
        break;
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    switch (this.state) {
      case 'closed':
        // Check if we should open the circuit
        if (this.failures >= this.config.failureThreshold) {
          this.tripCount++;
          this.transitionTo('open', `Failure threshold exceeded (${this.failures} failures)`);
        }
        break;
      case 'half_open':
        this.halfOpenTestInProgress = false;
        // Test failed, go back to open
        this.transitionTo('open', 'Test request failed, reopening circuit');
        break;
    }
  }

  /**
   * Check if enough time has passed to attempt reset
   */
  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return true;
    const elapsed = Date.now() - this.lastFailureTime;
    return elapsed >= this.config.openTimeout;
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState, reason: string): void {
    const oldState = this.state;
    this.state = newState;

    // Reset counters on state transitions
    if (newState === 'closed') {
      this.failures = 0;
      this.successes = 0;
      this.halfOpenTestInProgress = false;
    } else if (newState === 'open') {
      this.successes = 0;
      this.halfOpenTestInProgress = false;

      // Schedule automatic transition to half-open
      this.scheduleReset();
    }

    const event: CircuitBreakerEvent = {
      name: this.name,
      fromState: oldState,
      toState: newState,
      timestamp: Date.now(),
      reason,
    };

    this.emit('stateChange', event);
  }

  /**
   * Schedule automatic reset attempt
   */
  private scheduleReset(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }

    this.resetTimer = setTimeout(() => {
      if (this.state === 'open') {
        this.transitionTo('half_open', 'Automatic timeout, attempting recovery');
      }
    }, this.config.openTimeout);
  }

  /**
   * Calculate backoff delay with jitter
   */
  getBackoffDelay(attempt: number): number {
    if (!this.config.backoff?.enabled) {
      return 0;
    }

    const { initialMs, multiplier, maxMs, jitter } = this.config.backoff;
    let delay = initialMs * Math.pow(multiplier, attempt);
    delay = Math.min(delay, maxMs);

    // Add jitter
    const jitterAmount = delay * jitter * (Math.random() * 2 - 1);
    delay += jitterAmount;

    return Math.max(0, Math.round(delay));
  }
}

/**
 * Circuit Breaker Error
 */
export class CircuitBreakerError extends Error {
  readonly state: CircuitState;
  readonly circuitName: string;

  constructor(message: string, state: CircuitState, circuitName: string) {
    super(message);
    this.name = 'CircuitBreakerError';
    this.state = state;
    this.circuitName = circuitName;
  }
}

/**
 * Circuit Breaker Registry
 */
export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();
  private defaultConfig: Partial<CircuitBreakerConfig>;

  constructor(defaultConfig: Partial<CircuitBreakerConfig> = {}) {
    this.defaultConfig = defaultConfig;
  }

  /**
   * Get or create a circuit breaker
   */
  get(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(name)) {
      const mergedConfig: CircuitBreakerConfig = {
        name,
        failureThreshold: 5,
        successThreshold: 2,
        openTimeout: 60000,
        halfOpenTimeout: 10000,
        cooldownPeriod: 300000,
        resetCount: 3,
        ...this.defaultConfig,
        ...config,
      };
      this.breakers.set(name, new CircuitBreaker(mergedConfig));
    }
    return this.breakers.get(name)!;
  }

  /**
   * Check if a circuit breaker exists
   */
  has(name: string): boolean {
    return this.breakers.has(name);
  }

  /**
   * Get all circuit breakers
   */
  getAll(): CircuitBreaker[] {
    return Array.from(this.breakers.values());
  }

  /**
   * Get statistics for all circuit breakers
   */
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Clear all circuit breakers
   */
  clear(): void {
    this.breakers.clear();
  }
}

// Singleton instance
let registryInstance: CircuitBreakerRegistry | null = null;

export function getCircuitBreakerRegistry(): CircuitBreakerRegistry {
  if (!registryInstance) {
    registryInstance = new CircuitBreakerRegistry();
  }
  return registryInstance;
}

export function createCircuitBreaker(
  name: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  return getCircuitBreakerRegistry().get(name, config);
}
