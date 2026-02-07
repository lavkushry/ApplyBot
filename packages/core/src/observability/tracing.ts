/**
 * Distributed Tracing System
 *
 * Implements PRD Section 15.5.4 - Distributed Tracing.
 * End-to-end request tracing across all components for debugging and performance analysis.
 */

import { EventEmitter } from 'events';

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
}

export interface Span {
  id: string;
  traceId: string;
  parentId?: string;
  name: string;
  type: 'tool' | 'llm' | 'db' | 'external' | 'internal';
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'ok' | 'error' | 'in_progress';
  attributes: Record<string, unknown>;
  events: SpanEvent[];
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

export interface TracingConfig {
  enabled: boolean;
  sampleRate: number;
  errorSampleRate: number;
  slowThresholdMs: number;
  maxSpansPerTrace: number;
  maxAttributesPerSpan: number;
  backends: {
    opentelemetry?: {
      enabled: boolean;
      endpoint?: string;
    };
    jaeger?: {
      enabled: boolean;
      endpoint?: string;
    };
    zipkin?: {
      enabled: boolean;
      endpoint?: string;
    };
    file?: {
      enabled: boolean;
      path?: string;
    };
  };
}

/**
 * Tracing system implementation
 */
export class TracingSystem extends EventEmitter {
  private config: TracingConfig;
  private activeSpans = new Map<string, Span>();
  private completedSpans: Span[] = [];

  constructor(config: TracingConfig) {
    super();
    this.config = config;
  }

  /**
   * Generate a new trace ID
   */
  generateTraceId(): string {
    return `trace-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Generate a new span ID
   */
  generateSpanId(): string {
    return `span-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Start a new span
   */
  startSpan(
    name: string,
    type: Span['type'],
    parentContext?: TraceContext,
    attributes: Record<string, unknown> = {}
  ): { span: Span; context: TraceContext } {
    const traceId = parentContext?.traceId || this.generateTraceId();
    const spanId = this.generateSpanId();

    // Determine if this trace should be sampled
    const sampled = parentContext?.sampled ?? this.shouldSample();

    const span: Span = {
      id: spanId,
      traceId,
      parentId: parentContext?.spanId,
      name,
      type,
      startTime: Date.now(),
      status: 'in_progress',
      attributes: this.sanitizeAttributes(attributes),
      events: [],
    };

    this.activeSpans.set(spanId, span);

    const context: TraceContext = {
      traceId,
      spanId,
      parentSpanId: parentContext?.spanId,
      sampled,
    };

    this.emit('spanStarted', span);

    return { span, context };
  }

  /**
   * End a span
   */
  endSpan(spanId: string, status: 'ok' | 'error' = 'ok', attributes: Record<string, unknown> = {}): Span | undefined {
    const span = this.activeSpans.get(spanId);
    if (!span) return undefined;

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status;

    // Merge final attributes
    span.attributes = { ...span.attributes, ...this.sanitizeAttributes(attributes) };

    this.activeSpans.delete(spanId);

    // Check if it's a slow trace
    const isSlow = span.duration > this.config.slowThresholdMs;
    const shouldKeep = span.status === 'error' || isSlow || this.shouldSample();

    if (shouldKeep) {
      this.completedSpans.push(span);

      // Limit stored spans
      if (this.completedSpans.length > this.config.maxSpansPerTrace * 10) {
        this.completedSpans.shift();
      }

      this.emit('spanEnded', span);

      // Export to backends
      this.exportSpan(span);
    }

    return span;
  }

  /**
   * Add an event to a span
   */
  addEvent(spanId: string, name: string, attributes?: Record<string, unknown>): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.events.push({
      name,
      timestamp: Date.now(),
      attributes,
    });
  }

  /**
   * Get active span by ID
   */
  getActiveSpan(spanId: string): Span | undefined {
    return this.activeSpans.get(spanId);
  }

  /**
   * Get all active spans
   */
  getAllActiveSpans(): Span[] {
    return Array.from(this.activeSpans.values());
  }

  /**
   * Get completed spans for a trace
   */
  getTraceSpans(traceId: string): Span[] {
    return this.completedSpans.filter((s) => s.traceId === traceId);
  }

  /**
   * Get all completed spans
   */
  getAllCompletedSpans(): Span[] {
    return [...this.completedSpans];
  }

  /**
   * Clear all spans
   */
  clear(): void {
    this.activeSpans.clear();
    this.completedSpans = [];
  }

  /**
   * Create W3C trace context header
   */
  createW3CContext(context: TraceContext): string {
    const sampledFlag = context.sampled ? '01' : '00';
    return `00-${context.traceId}-${context.spanId}-${sampledFlag}`;
  }

  /**
   * Parse W3C trace context header
   */
  parseW3CContext(header: string): TraceContext | undefined {
    const parts = header.split('-');
    if (parts.length !== 4 || parts[0] !== '00') {
      return undefined;
    }

    return {
      traceId: parts[1],
      spanId: parts[2],
      sampled: parts[3] === '01',
    };
  }

  /**
   * Determine if a trace should be sampled
   */
  private shouldSample(): boolean {
    return Math.random() < this.config.sampleRate;
  }

  /**
   * Sanitize attributes to prevent excessive data
   */
  private sanitizeAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const keys = Object.keys(attributes).slice(0, this.config.maxAttributesPerSpan);

    for (const key of keys) {
      const value = attributes[key];
      // Only include primitive types
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Export span to configured backends
   */
  private exportSpan(span: Span): void {
    if (!this.config.enabled) return;

    // File export
    if (this.config.backends.file?.enabled) {
      this.exportToFile(span);
    }

    // OpenTelemetry export
    if (this.config.backends.opentelemetry?.enabled) {
      this.exportToOpenTelemetry(span);
    }

    // Jaeger export
    if (this.config.backends.jaeger?.enabled) {
      this.exportToJaeger(span);
    }

    // Zipkin export
    if (this.config.backends.zipkin?.enabled) {
      this.exportToZipkin(span);
    }
  }

  /**
   * Export span to file
   */
  private exportToFile(span: Span): void {
    // In a real implementation, this would write to a file
    this.emit('fileExport', span);
  }

  /**
   * Export span to OpenTelemetry
   */
  private exportToOpenTelemetry(span: Span): void {
    this.emit('otelExport', span);
  }

  /**
   * Export span to Jaeger
   */
  private exportToJaeger(span: Span): void {
    this.emit('jaegerExport', span);
  }

  /**
   * Export span to Zipkin
   */
  private exportToZipkin(span: Span): void {
    this.emit('zipkinExport', span);
  }
}

/**
 * Default tracing configuration
 */
export function getDefaultTracingConfig(): TracingConfig {
  return {
    enabled: true,
    sampleRate: 0.1, // 10% default sampling
    errorSampleRate: 1.0, // 100% for errors
    slowThresholdMs: 5000, // 5 seconds
    maxSpansPerTrace: 100,
    maxAttributesPerSpan: 50,
    backends: {
      file: {
        enabled: true,
        path: '~/.applypilot/traces.jsonl',
      },
      opentelemetry: {
        enabled: false,
      },
      jaeger: {
        enabled: false,
      },
      zipkin: {
        enabled: false,
      },
    },
  };
}

// Singleton instance
let tracingInstance: TracingSystem | null = null;

export function getTracingSystem(config?: Partial<TracingConfig>): TracingSystem {
  if (!tracingInstance) {
    tracingInstance = new TracingSystem({
      ...getDefaultTracingConfig(),
      ...config,
    });
  }
  return tracingInstance;
}
