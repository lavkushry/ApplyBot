/**
 * Observability Module - Enterprise-Grade Monitoring
 *
 * Implements PRD Section 15.5 - Observability & Monitoring.
 * Provides metrics collection, distributed tracing, and alerting.
 */

// Metrics
export {
  MetricsCollector,
  BusinessMetrics,
  TechnicalMetrics,
  ResourceMetrics,
  getMetricsCollector,
  getDefaultMetricsConfig,
} from './metrics.js';
export type {
  MetricType,
  MetricCategory,
  MetricValue,
  MetricDefinition,
  MetricsConfig,
  MetricSnapshot,
} from './metrics.js';

// Tracing
export {
  TracingSystem,
  getTracingSystem,
  getDefaultTracingConfig,
} from './tracing.js';
export type {
  TraceContext,
  Span,
  SpanEvent,
  TracingConfig,
} from './tracing.js';

// Alerting
export {
  AlertingSystem,
  DefaultAlertRules,
  getAlertingSystem,
  getDefaultAlertingConfig,
} from './alerting.js';
export type {
  AlertSeverity,
  AlertStatus,
  AlertRule,
  Alert,
  AlertingConfig,
  AlertNotification,
} from './alerting.js';
