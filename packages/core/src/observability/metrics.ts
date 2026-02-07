/**
 * Metrics Framework Implementation
 *
 * Implements PRD Section 15.5.2 - Metrics Framework.
 * Comprehensive metrics collection across business, technical, and resource dimensions.
 */

import { EventEmitter } from 'events';

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';
export type MetricCategory = 'business' | 'technical' | 'resource' | 'custom';

export interface MetricValue {
  value: number;
  timestamp: number;
  tags: Record<string, string>;
}

export interface MetricDefinition {
  name: string;
  type: MetricType;
  category: MetricCategory;
  description: string;
  unit?: string;
  tags: string[];
  aggregations: string[];
}

export interface MetricsConfig {
  enabled: boolean;
  backend: 'prometheus' | 'datadog' | 'cloudwatch' | 'custom';
  collection: {
    interval: number;
    bufferSize: number;
    flushInterval: number;
    maxRetries: number;
  };
  business: {
    applications: {
      enabled: boolean;
      tags: string[];
      aggregations: string[];
    };
    jobs: {
      enabled: boolean;
      tags: string[];
      aggregations: string[];
    };
    userEngagement: {
      enabled: boolean;
      tags: string[];
      aggregations: string[];
    };
  };
  technical: {
    latency: {
      enabled: boolean;
      tags: string[];
      percentiles: number[];
      histogramBuckets: number[];
    };
    errors: {
      enabled: boolean;
      tags: string[];
      aggregations: string[];
    };
    throughput: {
      enabled: boolean;
      tags: string[];
      aggregations: string[];
    };
    circuitBreakers: {
      enabled: boolean;
      tags: string[];
      aggregations: string[];
    };
    retries: {
      enabled: boolean;
      tags: string[];
      aggregations: string[];
    };
  };
  resources: {
    cpu: {
      enabled: boolean;
      tags: string[];
      aggregations: string[];
    };
    memory: {
      enabled: boolean;
      tags: string[];
      aggregations: string[];
    };
    disk: {
      enabled: boolean;
      tags: string[];
      aggregations: string[];
    };
    network: {
      enabled: boolean;
      tags: string[];
      aggregations: string[];
    };
  };
  custom: {
    portals: {
      enabled: boolean;
      tags: string[];
      aggregations: string[];
    };
    llm: {
      enabled: boolean;
      tags: string[];
      aggregations: string[];
    };
    pdf: {
      enabled: boolean;
      tags: string[];
      aggregations: string[];
    };
    browser: {
      enabled: boolean;
      tags: string[];
      aggregations: string[];
    };
    plugins: {
      enabled: boolean;
      tags: string[];
      aggregations: string[];
    };
  };
}

export interface MetricSnapshot {
  name: string;
  type: MetricType;
  values: MetricValue[];
  stats: {
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
    p50?: number;
    p95?: number;
    p99?: number;
  };
}

/**
 * Metrics collector implementation
 */
export class MetricsCollector extends EventEmitter {
  private config: MetricsConfig;
  private metrics = new Map<string, MetricDefinition>();
  private values = new Map<string, MetricValue[]>();
  private flushTimer?: NodeJS.Timeout;

  constructor(config: MetricsConfig) {
    super();
    this.config = config;

    if (config.enabled) {
      this.start();
    }
  }

  /**
   * Register a metric
   */
  register(definition: MetricDefinition): void {
    this.metrics.set(definition.name, definition);
    if (!this.values.has(definition.name)) {
      this.values.set(definition.name, []);
    }
  }

  /**
   * Record a metric value
   */
  record(name: string, value: number, tags: Record<string, string> = {}): void {
    const definition = this.metrics.get(name);
    if (!definition) {
      // Auto-register if not exists
      this.register({
        name,
        type: 'gauge',
        category: 'custom',
        description: `Auto-registered metric: ${name}`,
        tags: Object.keys(tags),
        aggregations: ['avg', 'sum'],
      });
    }

    const values = this.values.get(name) || [];
    values.push({
      value,
      timestamp: Date.now(),
      tags,
    });

    // Keep only last N values to prevent memory leak
    const maxValues = this.config.collection.bufferSize;
    if (values.length > maxValues) {
      values.splice(0, values.length - maxValues);
    }

    this.values.set(name, values);
    this.emit('recorded', { name, value, tags });
  }

  /**
   * Increment a counter metric
   */
  increment(name: string, tags: Record<string, string> = {}, value = 1): void {
    this.record(name, value, tags);
  }

  /**
   * Set a gauge metric
   */
  gauge(name: string, value: number, tags: Record<string, string> = {}): void {
    this.record(name, value, tags);
  }

  /**
   * Record a histogram value
   */
  histogram(name: string, value: number, tags: Record<string, string> = {}): void {
    this.record(name, value, tags);
  }

  /**
   * Get metric snapshot
   */
  getSnapshot(name: string): MetricSnapshot | undefined {
    const definition = this.metrics.get(name);
    const values = this.values.get(name);

    if (!definition || !values || values.length === 0) {
      return undefined;
    }

    const numericValues = values.map((v) => v.value);
    const sorted = [...numericValues].sort((a, b) => a - b);

    const sum = numericValues.reduce((a, b) => a + b, 0);
    const count = numericValues.length;

    return {
      name,
      type: definition.type,
      values: values.slice(-100), // Last 100 values
      stats: {
        count,
        sum,
        avg: sum / count,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        p50: this.percentile(sorted, 0.5),
        p95: this.percentile(sorted, 0.95),
        p99: this.percentile(sorted, 0.99),
      },
    };
  }

  /**
   * Get all metric snapshots
   */
  getAllSnapshots(): MetricSnapshot[] {
    const snapshots: MetricSnapshot[] = [];
    for (const name of this.metrics.keys()) {
      const snapshot = this.getSnapshot(name);
      if (snapshot) {
        snapshots.push(snapshot);
      }
    }
    return snapshots;
  }

  /**
   * Start metrics collection
   */
  start(): void {
    if (this.flushTimer) return;

    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.collection.flushInterval);

    this.emit('started');
  }

  /**
   * Stop metrics collection
   */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    this.emit('stopped');
  }

  /**
   * Flush metrics to backend
   */
  private flush(): void {
    const snapshots = this.getAllSnapshots();
    this.emit('flush', snapshots);
  }

  /**
   * Calculate percentile
   */
  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }
}

/**
 * Predefined business metrics
 */
export const BusinessMetrics = {
  applicationSubmitted: (portal: string, status: string) => ({
    name: 'applications_submitted_total',
    value: 1,
    tags: { portal, status },
  }),
  jobProcessed: (source: string, status: string) => ({
    name: 'jobs_processed_total',
    value: 1,
    tags: { source, status },
  }),
  userEngagement: (action: string) => ({
    name: 'user_engagement_total',
    value: 1,
    tags: { action },
  }),
};

/**
 * Predefined technical metrics
 */
export const TechnicalMetrics = {
  operationLatency: (operation: string, tool: string, durationMs: number) => ({
    name: 'operation_latency_ms',
    value: durationMs,
    tags: { operation, tool },
  }),
  operationError: (operation: string, tool: string, errorType: string) => ({
    name: 'operation_errors_total',
    value: 1,
    tags: { operation, tool, error_type: errorType },
  }),
  circuitBreakerState: (tool: string, state: string) => ({
    name: 'circuit_breaker_state',
    value: state === 'open' ? 1 : state === 'half_open' ? 0.5 : 0,
    tags: { tool, state },
  }),
  retryAttempt: (operation: string, tool: string, attempt: number) => ({
    name: 'retry_attempts_total',
    value: 1,
    tags: { operation, tool, attempt: String(attempt) },
  }),
};

/**
 * Predefined resource metrics
 */
export const ResourceMetrics = {
  cpuUsage: (process: string, percent: number) => ({
    name: 'cpu_usage_percent',
    value: percent,
    tags: { process },
  }),
  memoryUsage: (type: string, bytes: number) => ({
    name: 'memory_usage_bytes',
    value: bytes,
    tags: { type },
  }),
  diskUsage: (mount: string, percent: number) => ({
    name: 'disk_usage_percent',
    value: percent,
    tags: { mount },
  }),
  networkIO: (direction: string, bytes: number) => ({
    name: 'network_io_bytes',
    value: bytes,
    tags: { direction },
  }),
};

/**
 * Default metrics configuration
 */
export function getDefaultMetricsConfig(): MetricsConfig {
  return {
    enabled: true,
    backend: 'prometheus',
    collection: {
      interval: 1000,
      bufferSize: 10000,
      flushInterval: 10000,
      maxRetries: 3,
    },
    business: {
      applications: {
        enabled: true,
        tags: ['portal', 'status', 'user'],
        aggregations: ['count', 'success_rate', 'time_to_apply'],
      },
      jobs: {
        enabled: true,
        tags: ['source', 'status', 'stage'],
        aggregations: ['count', 'by_status', 'by_stage'],
      },
      userEngagement: {
        enabled: true,
        tags: ['user', 'action_type'],
        aggregations: ['count', 'unique_users', 'actions_per_session'],
      },
    },
    technical: {
      latency: {
        enabled: true,
        tags: ['operation', 'tool', 'status'],
        percentiles: [50, 95, 99],
        histogramBuckets: [10, 50, 100, 500, 1000, 5000, 10000, 30000],
      },
      errors: {
        enabled: true,
        tags: ['tool', 'operation', 'error_type', 'severity'],
        aggregations: ['count', 'rate', 'by_severity'],
      },
      throughput: {
        enabled: true,
        tags: ['operation', 'tool'],
        aggregations: ['rate', 'count_per_second', 'count_per_minute'],
      },
      circuitBreakers: {
        enabled: true,
        tags: ['tool', 'state'],
        aggregations: ['state_changes', 'time_in_state'],
      },
      retries: {
        enabled: true,
        tags: ['operation', 'tool', 'outcome'],
        aggregations: ['count', 'retry_rate', 'success_after_retry'],
      },
    },
    resources: {
      cpu: {
        enabled: true,
        tags: ['process', 'component'],
        aggregations: ['avg', 'peak', 'by_process'],
      },
      memory: {
        enabled: true,
        tags: ['type', 'component'],
        aggregations: ['avg', 'peak', 'heap_vs_rss'],
      },
      disk: {
        enabled: true,
        tags: ['mount_point', 'type'],
        aggregations: ['usage_percent', 'free_bytes', 'by_type'],
      },
      network: {
        enabled: true,
        tags: ['direction', 'endpoint'],
        aggregations: ['bytes_per_second', 'by_endpoint'],
      },
    },
    custom: {
      portals: {
        enabled: true,
        tags: ['portal', 'operation', 'status'],
        aggregations: ['success_rate', 'by_portal'],
      },
      llm: {
        enabled: true,
        tags: ['model', 'operation'],
        aggregations: ['token_count', 'cost_estimate', 'by_model'],
      },
      pdf: {
        enabled: true,
        tags: ['operation', 'status'],
        aggregations: ['success_rate', 'compilation_time'],
      },
      browser: {
        enabled: true,
        tags: ['operation', 'status'],
        aggregations: ['success_rate', 'automation_time'],
      },
      plugins: {
        enabled: true,
        tags: ['plugin', 'operation', 'status'],
        aggregations: ['success_rate', 'execution_time', 'by_plugin'],
      },
    },
  };
}

// Singleton instance
let metricsInstance: MetricsCollector | null = null;

export function getMetricsCollector(config?: Partial<MetricsConfig>): MetricsCollector {
  if (!metricsInstance) {
    metricsInstance = new MetricsCollector({
      ...getDefaultMetricsConfig(),
      ...config,
    });
  }
  return metricsInstance;
}
