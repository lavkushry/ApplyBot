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

// Dead Letter Queue
export {
  DeadLetterQueue,
  getDeadLetterQueue,
  getDefaultDLQConfig,
} from './dead-letter-queue.js';
export type {
  DLQPriority,
  DLQItem,
  DLQConfig,
  DLQStats,
  DLQNotification,
} from './dead-letter-queue.js';

// Health Check
export {
  HealthCheckSystem,
  HealthChecks,
  getHealthCheckSystem,
  getDefaultHealthCheckConfig,
} from './health-check.js';
export type {
  HealthTier,
  HealthStatus,
  HealthCheckConfig,
  HealthCheckResult,
  HealthCheckSummary,
  HealthCheckDefinition,
} from './health-check.js';

// Graceful Degradation
export {
  GracefulDegradation,
  getGracefulDegradation,
  getDefaultDegradationConfig,
} from './graceful-degradation.js';
export type {
  DegradationLevel,
  OperationPriority,
  GracefulDegradationConfig,
  DegradationState,
  DegradationEvent,
} from './graceful-degradation.js';
