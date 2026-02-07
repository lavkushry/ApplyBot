/**
 * Resilience Module - Production-Grade Error Handling
 *
 * Implements PRD Section 12 - Resilience & Error Handling.
 * Provides circuit breakers, retry policies, health checks, and graceful degradation.
 */

// Circuit Breaker
export {
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitBreakerError,
  getCircuitBreakerRegistry,
  createCircuitBreaker,
} from './circuit-breaker.js';
export type {
  CircuitState,
  CircuitBreakerConfig,
  CircuitBreakerStats,
  CircuitBreakerEvent,
} from './circuit-breaker.js';

// Retry Policy
export {
  RetryPolicy,
  RetryPolicyRegistry,
  RetryPolicies,
  getRetryPolicyRegistry,
  createRetryPolicy,
  getRetryPolicy,
} from './retry-policy.js';
export type {
  RetryCategory,
  RetryPolicyConfig,
  RetryAttempt,
  RetryResult,
  RetryPolicyStats,
} from './retry-policy.js';
