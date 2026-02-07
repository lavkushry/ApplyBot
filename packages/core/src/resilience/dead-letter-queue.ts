/**
 * Dead Letter Queue (DLQ) Implementation
 *
 * Implements PRD Section 12.5.5 - Dead Letter Queue.
 * Failed operations are queued for later processing instead of being lost.
 */

import { EventEmitter } from 'events';

export type DLQPriority = 'critical' | 'high' | 'normal' | 'low';

export interface DLQItem {
  id: string;
  operation: string;
  payload: unknown;
  error: string;
  errorType: string;
  priority: DLQPriority;
  createdAt: number;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: number;
  processedAt?: number;
  status: 'pending' | 'processing' | 'failed' | 'completed';
}

export interface DLQConfig {
  enabled: boolean;
  storage: string;
  maxSize: number;
  retentionDays: number;
  processing: {
    interval: number;
    batchSize: number;
    maxRetries: number;
    retryDelayMs: number;
  };
  priorities: {
    critical: {
      enabled: boolean;
      maxAgeMs: number;
      maxRetries: number;
    };
    high: {
      enabled: boolean;
      maxAgeMs: number;
      maxRetries: number;
    };
    normal: {
      enabled: boolean;
      maxAgeMs: number;
      maxRetries: number;
    };
    low: {
      enabled: boolean;
      maxAgeMs: number;
      maxRetries: number;
    };
  };
  notifications: {
    queueSizeWarning: number;
    queueSizeCritical: number;
    ageWarningHours: number;
    ageCriticalHours: number;
  };
}

export interface DLQStats {
  totalItems: number;
  pendingItems: number;
  processingItems: number;
  failedItems: number;
  completedItems: number;
  byPriority: Record<DLQPriority, number>;
  oldestItemAge: number;
  averageAge: number;
}

export interface DLQNotification {
  type: 'warning' | 'critical';
  message: string;
  timestamp: number;
  stats: DLQStats;
}

/**
 * Dead Letter Queue implementation following PRD 12.5.5
 */
export class DeadLetterQueue extends EventEmitter {
  private config: DLQConfig;
  private items: Map<string, DLQItem> = new Map();
  private processingTimer?: NodeJS.Timeout;
  private notificationTimer?: NodeJS.Timeout;

  constructor(config: DLQConfig) {
    super();
    this.config = config;

    if (config.enabled) {
      this.startProcessing();
      this.startNotifications();
    }
  }

  /**
   * Add an item to the DLQ
   */
  add(
    operation: string,
    payload: unknown,
    error: Error,
    priority: DLQPriority = 'normal'
  ): DLQItem {
    const priorityConfig = this.config.priorities[priority];

    const item: DLQItem = {
      id: this.generateId(),
      operation,
      payload,
      error: error.message,
      errorType: error.name,
      priority,
      createdAt: Date.now(),
      retryCount: 0,
      maxRetries: priorityConfig.maxRetries,
      nextRetryAt: Date.now(),
      status: 'pending',
    };

    // Check if queue is full
    if (this.items.size >= this.config.maxSize) {
      // Remove oldest low priority item
      this.removeOldestLowPriorityItem();
    }

    this.items.set(item.id, item);

    this.emit('itemAdded', item);

    return item;
  }

  /**
   * Get an item by ID
   */
  get(id: string): DLQItem | undefined {
    return this.items.get(id);
  }

  /**
   * Get all items
   */
  getAll(): DLQItem[] {
    return Array.from(this.items.values());
  }

  /**
   * Get items by priority
   */
  getByPriority(priority: DLQPriority): DLQItem[] {
    return this.getAll().filter((item) => item.priority === priority);
  }

  /**
   * Get items by status
   */
  getByStatus(status: DLQItem['status']): DLQItem[] {
    return this.getAll().filter((item) => item.status === status);
  }

  /**
   * Get items ready for processing
   */
  getReadyForProcessing(): DLQItem[] {
    const now = Date.now();
    return this.getAll()
      .filter(
        (item) =>
          item.status === 'pending' &&
          item.nextRetryAt <= now &&
          item.retryCount < item.maxRetries
      )
      .sort((a, b) => {
        // Sort by priority (critical > high > normal > low)
        const priorityOrder: Record<DLQPriority, number> = {
          critical: 0,
          high: 1,
          normal: 2,
          low: 3,
        };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
  }

  /**
   * Update item status
   */
  updateStatus(
    id: string,
    status: DLQItem['status'],
    error?: string
  ): DLQItem | undefined {
    const item = this.items.get(id);
    if (!item) return undefined;

    item.status = status;

    if (status === 'failed' && error) {
      item.error = error;
      item.retryCount++;
      item.nextRetryAt =
        Date.now() + this.config.processing.retryDelayMs * Math.pow(2, item.retryCount);
    } else if (status === 'completed') {
      item.processedAt = Date.now();
    }

    this.items.set(id, item);
    this.emit('itemUpdated', item);

    return item;
  }

  /**
   * Remove an item
   */
  remove(id: string): boolean {
    const removed = this.items.delete(id);
    if (removed) {
      this.emit('itemRemoved', id);
    }
    return removed;
  }

  /**
   * Get DLQ statistics
   */
  getStats(): DLQStats {
    const all = this.getAll();
    const now = Date.now();

    const byPriority: Record<DLQPriority, number> = {
      critical: 0,
      high: 0,
      normal: 0,
      low: 0,
    };

    let totalAge = 0;
    let oldestAge = 0;

    for (const item of all) {
      byPriority[item.priority]++;
      const age = now - item.createdAt;
      totalAge += age;
      oldestAge = Math.max(oldestAge, age);
    }

    return {
      totalItems: all.length,
      pendingItems: all.filter((i) => i.status === 'pending').length,
      processingItems: all.filter((i) => i.status === 'processing').length,
      failedItems: all.filter((i) => i.status === 'failed').length,
      completedItems: all.filter((i) => i.status === 'completed').length,
      byPriority,
      oldestItemAge: oldestAge,
      averageAge: all.length > 0 ? totalAge / all.length : 0,
    };
  }

  /**
   * Process items in the queue
   */
  async process(
    processor: (item: DLQItem) => Promise<boolean>,
    priority?: DLQPriority
  ): Promise<{ processed: number; succeeded: number; failed: number }> {
    let items = this.getReadyForProcessing();

    if (priority) {
      items = items.filter((item) => item.priority === priority);
    }

    // Limit batch size
    items = items.slice(0, this.config.processing.batchSize);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const item of items) {
      this.updateStatus(item.id, 'processing');

      try {
        const success = await processor(item);
        processed++;

        if (success) {
          this.updateStatus(item.id, 'completed');
          succeeded++;
        } else {
          this.updateStatus(item.id, 'failed', 'Processor returned false');
          failed++;
        }
      } catch (error) {
        processed++;
        this.updateStatus(
          item.id,
          'failed',
          error instanceof Error ? error.message : String(error)
        );
        failed++;
      }
    }

    this.emit('batchProcessed', { processed, succeeded, failed });

    return { processed, succeeded, failed };
  }

  /**
   * Clean up old items
   */
  cleanup(): number {
    const now = Date.now();
    const maxAgeMs = this.config.retentionDays * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const [id, item] of this.items) {
      if (now - item.createdAt > maxAgeMs) {
        this.items.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      this.emit('cleanup', { removed });
    }

    return removed;
  }

  /**
   * Clear all items
   */
  clear(): void {
    this.items.clear();
    this.emit('cleared');
  }

  /**
   * Stop processing
   */
  stop(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = undefined;
    }
    if (this.notificationTimer) {
      clearInterval(this.notificationTimer);
      this.notificationTimer = undefined;
    }
  }

  /**
   * Start automatic processing
   */
  private startProcessing(): void {
    this.processingTimer = setInterval(() => {
      this.emit('processingInterval');
    }, this.config.processing.interval);
  }

  /**
   * Start notification checks
   */
  private startNotifications(): void {
    this.notificationTimer = setInterval(() => {
      this.checkNotifications();
    }, 60000); // Check every minute
  }

  /**
   * Check and emit notifications
   */
  private checkNotifications(): void {
    const stats = this.getStats();
    const { notifications } = this.config;

    // Check queue size
    if (stats.totalItems >= notifications.queueSizeCritical) {
      this.emit('notification', {
        type: 'critical',
        message: `DLQ size critical: ${stats.totalItems} items`,
        timestamp: Date.now(),
        stats,
      });
    } else if (stats.totalItems >= notifications.queueSizeWarning) {
      this.emit('notification', {
        type: 'warning',
        message: `DLQ size warning: ${stats.totalItems} items`,
        timestamp: Date.now(),
        stats,
      });
    }

    // Check item age
    const oldestHours = stats.oldestItemAge / (60 * 60 * 1000);
    if (oldestHours >= notifications.ageCriticalHours) {
      this.emit('notification', {
        type: 'critical',
        message: `DLQ has items older than ${notifications.ageCriticalHours} hours`,
        timestamp: Date.now(),
        stats,
      });
    } else if (oldestHours >= notifications.ageWarningHours) {
      this.emit('notification', {
        type: 'warning',
        message: `DLQ has items older than ${notifications.ageWarningHours} hours`,
        timestamp: Date.now(),
        stats,
      });
    }
  }

  /**
   * Remove oldest low priority item when queue is full
   */
  private removeOldestLowPriorityItem(): void {
    const lowPriorityItems = this.getByPriority('low');
    if (lowPriorityItems.length === 0) return;

    const oldest = lowPriorityItems.sort((a, b) => a.createdAt - b.createdAt)[0];
    this.remove(oldest.id);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `dlq-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

/**
 * Default DLQ configuration
 */
export function getDefaultDLQConfig(): DLQConfig {
  return {
    enabled: true,
    storage: '~/.applypilot/dead-letter-queue.db',
    maxSize: 10000,
    retentionDays: 30,
    processing: {
      interval: 300000, // 5 minutes
      batchSize: 100,
      maxRetries: 3,
      retryDelayMs: 60000, // 1 minute
    },
    priorities: {
      critical: {
        enabled: true,
        maxAgeMs: 300000, // 5 minutes
        maxRetries: 5,
      },
      high: {
        enabled: true,
        maxAgeMs: 900000, // 15 minutes
        maxRetries: 3,
      },
      normal: {
        enabled: true,
        maxAgeMs: 3600000, // 1 hour
        maxRetries: 1,
      },
      low: {
        enabled: true,
        maxAgeMs: 86400000, // 24 hours
        maxRetries: 1,
      },
    },
    notifications: {
      queueSizeWarning: 1000,
      queueSizeCritical: 5000,
      ageWarningHours: 12,
      ageCriticalHours: 24,
    },
  };
}

// Singleton instance
let dlqInstance: DeadLetterQueue | null = null;

export function getDeadLetterQueue(config?: Partial<DLQConfig>): DeadLetterQueue {
  if (!dlqInstance) {
    dlqInstance = new DeadLetterQueue({
      ...getDefaultDLQConfig(),
      ...config,
    });
  }
  return dlqInstance;
}
