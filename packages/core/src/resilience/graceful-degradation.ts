/**
 * Graceful Degradation System
 *
 * Implements PRD Section 12.5.7 - Graceful Degradation.
 * When system is under pressure, gracefully degrade non-critical functionality.
 */

import { EventEmitter } from 'events';

export type DegradationLevel = 'full' | 'degraded' | 'minimal' | 'emergency';
export type OperationPriority = 'critical' | 'high' | 'normal' | 'low';

export interface GracefulDegradationConfig {
  enabled: boolean;
  defaultLevel: DegradationLevel;
  autoRecovery: boolean;
  thresholds: {
    cpu: { warning: number; critical: number; duration: number };
    memory: { warning: number; critical: number; duration: number };
    disk: { warning: number; critical: number };
    errorRate: { warning: number; critical: number };
    circuitBreakerOpen: { warning: number; critical: number };
  };
  levels: {
    full: {
      enabledTools: string[];
      timeoutMultiplier: number;
      maxRetries: number;
      concurrentOperations: number;
    };
    degraded: {
      enabledTools: string[];
      timeoutMultiplier: number;
      maxRetries: number;
      concurrentOperations: number;
    };
    minimal: {
      enabledTools: string[];
      timeoutMultiplier: number;
      maxRetries: number;
      concurrentOperations: number;
    };
    emergency: {
      enabledTools: string[];
      timeoutMultiplier: number;
      maxRetries: number;
      concurrentOperations: number;
    };
  };
  userCommunication: {
    enabled: boolean;
    showInStatus: boolean;
    explainFeatures: boolean;
    estimateRecovery: boolean;
  };
}

export interface DegradationState {
  level: DegradationLevel;
  previousLevel: DegradationLevel;
  triggeredAt: number;
  triggeredBy: string;
  metrics: {
    cpu: number;
    memory: number;
    disk: number;
    errorRate: number;
    openCircuits: number;
  };
  canProcess: (priority: OperationPriority) => boolean;
}

export interface DegradationEvent {
  from: DegradationLevel;
  to: DegradationLevel;
  reason: string;
  timestamp: number;
  metrics: DegradationState['metrics'];
}

/**
 * Graceful Degradation implementation following PRD 12.5.7
 */
export class GracefulDegradation extends EventEmitter {
  private config: GracefulDegradationConfig;
  private currentLevel: DegradationLevel = 'full';
  private previousLevel: DegradationLevel = 'full';
  private triggeredAt: number = 0;
  private triggeredBy: string = '';
  private metrics: DegradationState['metrics'] = {
    cpu: 0,
    memory: 0,
    disk: 0,
    errorRate: 0,
    openCircuits: 0,
  };
  private monitoringTimer?: NodeJS.Timeout;
  private isMonitoring = false;

  constructor(config: GracefulDegradationConfig) {
    super();
    this.config = config;
    this.currentLevel = config.defaultLevel;
  }

  /**
   * Start monitoring system metrics
   */
  start(): void {
    if (this.isMonitoring || !this.config.enabled) return;

    this.isMonitoring = true;
    this.monitoringTimer = setInterval(() => {
      this.evaluateDegradation();
    }, 10000); // Check every 10 seconds

    this.emit('started');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.isMonitoring = false;
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined;
    }
    this.emit('stopped');
  }

  /**
   * Get current degradation state
   */
  getState(): DegradationState {
    return {
      level: this.currentLevel,
      previousLevel: this.previousLevel,
      triggeredAt: this.triggeredAt,
      triggeredBy: this.triggeredBy,
      metrics: { ...this.metrics },
      canProcess: (priority: OperationPriority) => this.canProcess(priority),
    };
  }

  /**
   * Manually set degradation level
   */
  setLevel(level: DegradationLevel, reason: string): void {
    if (level === this.currentLevel) return;

    this.previousLevel = this.currentLevel;
    this.currentLevel = level;
    this.triggeredAt = Date.now();
    this.triggeredBy = reason;

    const event: DegradationEvent = {
      from: this.previousLevel,
      to: level,
      reason,
      timestamp: Date.now(),
      metrics: { ...this.metrics },
    };

    this.emit('levelChanged', event);

    if (this.config.userCommunication.enabled) {
      this.notifyUser(event);
    }
  }

  /**
   * Check if an operation can be processed based on priority
   */
  canProcess(priority: OperationPriority): boolean {
    const priorityRules: Record<DegradationLevel, OperationPriority[]> = {
      full: ['critical', 'high', 'normal', 'low'],
      degraded: ['critical', 'high', 'normal'],
      minimal: ['critical', 'high'],
      emergency: ['critical'],
    };

    return priorityRules[this.currentLevel].includes(priority);
  }

  /**
   * Get configuration for current level
   */
  getCurrentConfig(): GracefulDegradationConfig['levels'][DegradationLevel] {
    return this.config.levels[this.currentLevel];
  }

  /**
   * Check if a tool is enabled in current level
   */
  isToolEnabled(toolName: string): boolean {
    const config = this.getCurrentConfig();
    return config.enabledTools.includes(toolName) || config.enabledTools.includes('*');
  }

  /**
   * Update system metrics
   */
  updateMetrics(metrics: Partial<DegradationState['metrics']>): void {
    this.metrics = { ...this.metrics, ...metrics };
  }

  /**
   * Evaluate if degradation level should change
   */
  private evaluateDegradation(): void {
    const { thresholds } = this.config;

    // Check emergency conditions first
    if (
      this.metrics.cpu >= thresholds.cpu.critical ||
      this.metrics.memory >= thresholds.memory.critical ||
      this.metrics.disk <= thresholds.disk.critical ||
      this.metrics.errorRate >= thresholds.errorRate.critical ||
      this.metrics.openCircuits >= thresholds.circuitBreakerOpen.critical
    ) {
      if (this.currentLevel !== 'emergency') {
        this.setLevel('emergency', 'Critical system metrics exceeded');
      }
      return;
    }

    // Check minimal conditions
    if (
      this.metrics.cpu >= thresholds.cpu.warning ||
      this.metrics.memory >= thresholds.memory.warning ||
      this.metrics.disk <= thresholds.disk.warning ||
      this.metrics.errorRate >= thresholds.errorRate.warning ||
      this.metrics.openCircuits >= thresholds.circuitBreakerOpen.warning
    ) {
      if (this.currentLevel !== 'minimal' && this.currentLevel !== 'emergency') {
        this.setLevel('minimal', 'System metrics in warning range');
      }
      return;
    }

    // Auto-recovery if conditions improve
    if (this.config.autoRecovery && this.currentLevel !== 'full') {
      this.setLevel('full', 'System metrics normalized');
    }
  }

  /**
   * Notify user of degradation
   */
  private notifyUser(event: DegradationEvent): void {
    const levelDescriptions: Record<DegradationLevel, string> = {
      full: 'All features operational (100%)',
      degraded: 'Reduced functionality (70-90%)',
      minimal: 'Core features only (40-70%)',
      emergency: 'Fail-safe mode (0-40%)',
    };

    const message =
      event.to === 'full'
        ? `System recovered to ${event.to} capacity`
        : `System degraded to ${event.to} capacity: ${levelDescriptions[event.to]}`;

    this.emit('userNotification', {
      type: event.to === 'full' ? 'info' : 'warning',
      message,
      level: event.to,
      reason: event.reason,
      timestamp: event.timestamp,
    });
  }
}

/**
 * Default graceful degradation configuration
 */
export function getDefaultDegradationConfig(): GracefulDegradationConfig {
  return {
    enabled: true,
    defaultLevel: 'full',
    autoRecovery: true,
    thresholds: {
      cpu: {
        warning: 80,
        critical: 95,
        duration: 120000, // 2 minutes
      },
      memory: {
        warning: 85,
        critical: 95,
        duration: 120000,
      },
      disk: {
        warning: 10,
        critical: 5,
      },
      errorRate: {
        warning: 10,
        critical: 25,
      },
      circuitBreakerOpen: {
        warning: 50, // 50% of circuits
        critical: 75, // 75% of circuits
      },
    },
    levels: {
      full: {
        enabledTools: ['*'], // All tools
        timeoutMultiplier: 1.0,
        maxRetries: 3,
        concurrentOperations: 10,
      },
      degraded: {
        enabledTools: [
          'analyze_jd',
          'tailor_resume',
          'compile_pdf',
          'bundle_export',
          'memory_search',
          'memory_get',
        ],
        timeoutMultiplier: 1.5,
        maxRetries: 2,
        concurrentOperations: 5,
      },
      minimal: {
        enabledTools: ['analyze_jd', 'tailor_resume', 'memory_search', 'memory_get'],
        timeoutMultiplier: 2.0,
        maxRetries: 1,
        concurrentOperations: 2,
      },
      emergency: {
        enabledTools: ['memory_search', 'memory_get', 'status'],
        timeoutMultiplier: 3.0,
        maxRetries: 0,
        concurrentOperations: 1,
      },
    },
    userCommunication: {
      enabled: true,
      showInStatus: true,
      explainFeatures: true,
      estimateRecovery: true,
    },
  };
}

// Singleton instance
let degradationInstance: GracefulDegradation | null = null;

export function getGracefulDegradation(
  config?: Partial<GracefulDegradationConfig>
): GracefulDegradation {
  if (!degradationInstance) {
    degradationInstance = new GracefulDegradation({
      ...getDefaultDegradationConfig(),
      ...config,
    });
  }
  return degradationInstance;
}
