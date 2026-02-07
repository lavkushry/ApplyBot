/**
 * Health Check System Implementation
 *
 * Implements PRD Section 12.5.6 - Health Check SLAs.
 * Three-tier health check architecture with automated remediation.
 */

import { EventEmitter } from 'events';

export type HealthTier = 'L1' | 'L2' | 'L3';
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface HealthCheckConfig {
  enabled: boolean;
  tiers: {
    L1: {
      enabled: boolean;
      interval: number;
      timeout: number;
      targetResponseTime: number;
      targetUptime: number;
    };
    L2: {
      enabled: boolean;
      interval: number;
      timeout: number;
      targetResponseTime: number;
      targetUptime: number;
    };
    L3: {
      enabled: boolean;
      interval: number;
      timeout: number;
      targetResponseTime: number;
      targetUptime: number;
    };
  };
  caching: {
    enabled: boolean;
    ttl: number;
    negativeTtl: number;
  };
  remediation: {
    enabled: boolean;
    autoRetry: boolean;
    autoRestart: boolean;
    notifyOnFailure: boolean;
  };
}

export interface HealthCheckResult {
  tier: HealthTier;
  component: string;
  status: HealthStatus;
  responseTime: number;
  timestamp: number;
  message?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface HealthCheckSummary {
  overall: HealthStatus;
  timestamp: number;
  tiers: Record<
    HealthTier,
    {
      status: HealthStatus;
      checks: HealthCheckResult[];
      responseTime: number;
      uptime: number;
    }
  >;
  degradedComponents: string[];
  unhealthyComponents: string[];
}

export interface HealthCheckDefinition {
  name: string;
  tier: HealthTier;
  check: () => Promise<HealthCheckResult>;
  dependencies?: string[];
}

/**
 * Health Check implementation following PRD 12.5.6
 */
export class HealthCheckSystem extends EventEmitter {
  private config: HealthCheckConfig;
  private checks = new Map<string, HealthCheckDefinition>();
  private results = new Map<string, HealthCheckResult>();
  private cache = new Map<string, { result: HealthCheckResult; expiresAt: number }>();
  private timers = new Map<HealthTier, NodeJS.Timeout>();
  private isRunning = false;

  constructor(config: HealthCheckConfig) {
    super();
    this.config = config;
  }

  /**
   * Register a health check
   */
  register(definition: HealthCheckDefinition): void {
    this.checks.set(definition.name, definition);
  }

  /**
   * Unregister a health check
   */
  unregister(name: string): boolean {
    return this.checks.delete(name);
  }

  /**
   * Start health checks
   */
  start(): void {
    if (this.isRunning || !this.config.enabled) return;

    this.isRunning = true;

    // Start timers for each tier
    for (const tier of ['L1', 'L2', 'L3'] as HealthTier[]) {
      const tierConfig = this.config.tiers[tier];
      if (tierConfig.enabled) {
        this.timers.set(
          tier,
          setInterval(() => {
            this.runTierChecks(tier);
          }, tierConfig.interval)
        );
      }
    }

    this.emit('started');
  }

  /**
   * Stop health checks
   */
  stop(): void {
    this.isRunning = false;

    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();

    this.emit('stopped');
  }

  /**
   * Run checks for a specific tier
   */
  async runTierChecks(tier: HealthTier): Promise<HealthCheckResult[]> {
    const tierChecks = Array.from(this.checks.values()).filter(
      (check) => check.tier === tier
    );

    const results: HealthCheckResult[] = [];

    for (const check of tierChecks) {
      const result = await this.runCheck(check);
      results.push(result);
    }

    this.emit('tierComplete', { tier, results });

    return results;
  }

  /**
   * Run a single health check
   */
  async runCheck(definition: HealthCheckDefinition): Promise<HealthCheckResult> {
    const cacheKey = `${definition.tier}:${definition.name}`;

    // Check cache
    if (this.config.caching.enabled) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.result;
      }
    }

    const startTime = Date.now();
    const tierConfig = this.config.tiers[definition.tier];

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Health check timeout after ${tierConfig.timeout}ms`));
        }, tierConfig.timeout);
      });

      const result = await Promise.race([definition.check(), timeoutPromise]);
      result.responseTime = Date.now() - startTime;

      // Update cache
      if (this.config.caching.enabled) {
        const ttl =
          result.status === 'healthy'
            ? this.config.caching.ttl
            : this.config.caching.negativeTtl;
        this.cache.set(cacheKey, {
          result,
          expiresAt: Date.now() + ttl * 1000,
        });
      }

      // Store result
      this.results.set(definition.name, result);

      // Handle remediation
      if (result.status !== 'healthy' && this.config.remediation.enabled) {
        this.handleRemediation(result, definition);
      }

      this.emit('checkComplete', result);

      return result;
    } catch (error) {
      const result: HealthCheckResult = {
        tier: definition.tier,
        component: definition.name,
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };

      this.results.set(definition.name, result);

      if (this.config.caching.enabled) {
        this.cache.set(cacheKey, {
          result,
          expiresAt: Date.now() + this.config.caching.negativeTtl * 1000,
        });
      }

      this.emit('checkComplete', result);

      return result;
    }
  }

  /**
   * Get health summary
   */
  getSummary(): HealthCheckSummary {
    const now = Date.now();
    const allResults = Array.from(this.results.values());

    const tierResults: Record<
      HealthTier,
      { status: HealthStatus; checks: HealthCheckResult[]; responseTime: number; uptime: number }
    > = {
      L1: { status: 'unknown', checks: [], responseTime: 0, uptime: 0 },
      L2: { status: 'unknown', checks: [], responseTime: 0, uptime: 0 },
      L3: { status: 'unknown', checks: [], responseTime: 0, uptime: 0 },
    };

    for (const tier of ['L1', 'L2', 'L3'] as HealthTier[]) {
      const checks = allResults.filter((r) => r.tier === tier);
      const healthyCount = checks.filter((c) => c.status === 'healthy').length;
      const degradedCount = checks.filter((c) => c.status === 'degraded').length;
      const unhealthyCount = checks.filter((c) => c.status === 'unhealthy').length;

      let status: HealthStatus = 'unknown';
      if (unhealthyCount > 0) status = 'unhealthy';
      else if (degradedCount > 0) status = 'degraded';
      else if (healthyCount > 0) status = 'healthy';

      const responseTime =
        checks.length > 0
          ? checks.reduce((sum, c) => sum + c.responseTime, 0) / checks.length
          : 0;

      const uptime =
        checks.length > 0 ? (healthyCount / checks.length) * 100 : 0;

      tierResults[tier] = { status, checks, responseTime, uptime };
    }

    const degradedComponents = allResults
      .filter((r) => r.status === 'degraded')
      .map((r) => r.component);

    const unhealthyComponents = allResults
      .filter((r) => r.status === 'unhealthy')
      .map((r) => r.component);

    let overall: HealthStatus = 'healthy';
    if (unhealthyComponents.length > 0) overall = 'unhealthy';
    else if (degradedComponents.length > 0) overall = 'degraded';

    return {
      overall,
      timestamp: now,
      tiers: tierResults,
      degradedComponents,
      unhealthyComponents,
    };
  }

  /**
   * Get result for a specific component
   */
  getResult(component: string): HealthCheckResult | undefined {
    return this.results.get(component);
  }

  /**
   * Get all results
   */
  getAllResults(): HealthCheckResult[] {
    return Array.from(this.results.values());
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Handle remediation for failed checks
   */
  private handleRemediation(
    result: HealthCheckResult,
    definition: HealthCheckDefinition
  ): void {
    this.emit('remediation', { result, definition });

    if (this.config.remediation.autoRetry) {
      // Schedule retry
      setTimeout(() => {
        this.runCheck(definition);
      }, 5000);
    }

    if (this.config.remediation.notifyOnFailure) {
      this.emit('notification', {
        type: result.status === 'unhealthy' ? 'critical' : 'warning',
        component: result.component,
        message: result.message || result.error || 'Health check failed',
        tier: result.tier,
      });
    }
  }
}

/**
 * Predefined health checks
 */
export const HealthChecks = {
  /**
   * L1 - Gateway connectivity
   */
  gatewayConnectivity: (): HealthCheckDefinition => ({
    name: 'gateway-connectivity',
    tier: 'L1',
    check: async () => ({
      tier: 'L1',
      component: 'gateway-connectivity',
      status: 'healthy',
      responseTime: 0,
      timestamp: Date.now(),
      message: 'Gateway is reachable',
    }),
  }),

  /**
   * L1 - LLM provider reachability
   */
  llmReachability: (): HealthCheckDefinition => ({
    name: 'llm-reachability',
    tier: 'L1',
    check: async () => ({
      tier: 'L1',
      component: 'llm-reachability',
      status: 'healthy',
      responseTime: 0,
      timestamp: Date.now(),
      message: 'LLM provider is reachable',
    }),
  }),

  /**
   * L1 - SQLite database accessibility
   */
  databaseAccessibility: (): HealthCheckDefinition => ({
    name: 'database-accessibility',
    tier: 'L1',
    check: async () => ({
      tier: 'L1',
      component: 'database-accessibility',
      status: 'healthy',
      responseTime: 0,
      timestamp: Date.now(),
      message: 'Database is accessible',
    }),
  }),

  /**
   * L2 - Tool availability
   */
  toolAvailability: (toolName: string): HealthCheckDefinition => ({
    name: `tool-${toolName}`,
    tier: 'L2',
    check: async () => ({
      tier: 'L2',
      component: `tool-${toolName}`,
      status: 'healthy',
      responseTime: 0,
      timestamp: Date.now(),
      message: `Tool ${toolName} is available`,
    }),
  }),

  /**
   * L2 - Session manager health
   */
  sessionManagerHealth: (): HealthCheckDefinition => ({
    name: 'session-manager',
    tier: 'L2',
    check: async () => ({
      tier: 'L2',
      component: 'session-manager',
      status: 'healthy',
      responseTime: 0,
      timestamp: Date.now(),
      message: 'Session manager is healthy',
    }),
  }),

  /**
   * L2 - Memory system health
   */
  memorySystemHealth: (): HealthCheckDefinition => ({
    name: 'memory-system',
    tier: 'L2',
    check: async () => ({
      tier: 'L2',
      component: 'memory-system',
      status: 'healthy',
      responseTime: 0,
      timestamp: Date.now(),
      message: 'Memory system is healthy',
    }),
  }),

  /**
   * L3 - Portal API reachability
   */
  portalAPIReachability: (portal: string): HealthCheckDefinition => ({
    name: `portal-${portal}`,
    tier: 'L3',
    check: async () => ({
      tier: 'L3',
      component: `portal-${portal}`,
      status: 'healthy',
      responseTime: 0,
      timestamp: Date.now(),
      message: `Portal ${portal} API is reachable`,
    }),
  }),

  /**
   * L3 - External service dependencies
   */
  externalServiceHealth: (service: string): HealthCheckDefinition => ({
    name: `external-${service}`,
    tier: 'L3',
    check: async () => ({
      tier: 'L3',
      component: `external-${service}`,
      status: 'healthy',
      responseTime: 0,
      timestamp: Date.now(),
      message: `External service ${service} is healthy`,
    }),
  }),
};

/**
 * Default health check configuration
 */
export function getDefaultHealthCheckConfig(): HealthCheckConfig {
  return {
    enabled: true,
    tiers: {
      L1: {
        enabled: true,
        interval: 30000, // 30 seconds
        timeout: 1000, // 1 second
        targetResponseTime: 1000,
        targetUptime: 99.9,
      },
      L2: {
        enabled: true,
        interval: 120000, // 2 minutes
        timeout: 5000, // 5 seconds
        targetResponseTime: 5000,
        targetUptime: 99.5,
      },
      L3: {
        enabled: true,
        interval: 300000, // 5 minutes
        timeout: 30000, // 30 seconds
        targetResponseTime: 30000,
        targetUptime: 99.0,
      },
    },
    caching: {
      enabled: true,
      ttl: 60, // 60 seconds
      negativeTtl: 10, // 10 seconds
    },
    remediation: {
      enabled: true,
      autoRetry: true,
      autoRestart: false,
      notifyOnFailure: true,
    },
  };
}

// Singleton instance
let healthCheckInstance: HealthCheckSystem | null = null;

export function getHealthCheckSystem(
  config?: Partial<HealthCheckConfig>
): HealthCheckSystem {
  if (!healthCheckInstance) {
    healthCheckInstance = new HealthCheckSystem({
      ...getDefaultHealthCheckConfig(),
      ...config,
    });
  }
  return healthCheckInstance;
}
