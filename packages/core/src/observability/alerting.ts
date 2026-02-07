/**
 * Alerting System Implementation
 *
 * Implements PRD Section 15.5.5 - Alerting Rules.
 * Comprehensive alerting with severity levels, routing, and suppression.
 */

import { EventEmitter } from 'events';

export type AlertSeverity = 'P0' | 'P1' | 'P2' | 'P3';
export type AlertStatus = 'firing' | 'resolved' | 'suppressed';

export interface AlertRule {
  name: string;
  severity: AlertSeverity;
  condition: string;
  evaluationInterval: number;
  cooldown: number;
  channels: string[];
  enabled: boolean;
}

export interface Alert {
  id: string;
  rule: string;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  timestamp: number;
  resolvedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface AlertingConfig {
  enabled: boolean;
  channels: {
    email?: {
      enabled: boolean;
      recipients: string[];
      templates: Record<AlertSeverity, string>;
    };
    slack?: {
      enabled: boolean;
      webhookUrl?: string;
      channels: Record<AlertSeverity, string>;
    };
    pagerduty?: {
      enabled: boolean;
      integrationKey?: string;
      escalationPolicy?: string;
    };
    webhook?: {
      enabled: boolean;
      url?: string;
      headers?: Record<string, string>;
    };
    sms?: {
      enabled: boolean;
      phoneNumbers?: string[];
    };
  };
  rules: AlertRule[];
  suppression: {
    maintenanceWindows: {
      name: string;
      schedule: string;
      suppress: AlertSeverity[];
    }[];
    rateLimiting: {
      maxAlertsPerHour: number;
      maxAlertsPerRulePerHour: number;
    };
    deduplicationWindow: number;
  };
}

export interface AlertNotification {
  alert: Alert;
  channel: string;
  sentAt: number;
  status: 'sent' | 'failed' | 'pending';
}

/**
 * Alerting system implementation
 */
export class AlertingSystem extends EventEmitter {
  private config: AlertingConfig;
  private alerts: Map<string, Alert> = new Map();
  private notifications: AlertNotification[] = [];
  private evaluationTimers: Map<string, NodeJS.Timeout> = new Map();
  private lastFired: Map<string, number> = new Map();
  private alertsThisHour: number = 0;
  private alertsPerRuleThisHour: Map<string, number> = new Map();
  private hourResetTimer?: NodeJS.Timeout;

  constructor(config: AlertingConfig) {
    super();
    this.config = config;

    if (config.enabled) {
      this.start();
    }
  }

  /**
   * Start alerting system
   */
  start(): void {
    // Start evaluation timers for each rule
    for (const rule of this.config.rules) {
      if (rule.enabled) {
        this.startRuleEvaluation(rule);
      }
    }

    // Start hour reset timer
    this.hourResetTimer = setInterval(() => {
      this.alertsThisHour = 0;
      this.alertsPerRuleThisHour.clear();
    }, 3600000); // Reset every hour

    this.emit('started');
  }

  /**
   * Stop alerting system
   */
  stop(): void {
    // Clear all evaluation timers
    for (const timer of this.evaluationTimers.values()) {
      clearInterval(timer);
    }
    this.evaluationTimers.clear();

    if (this.hourResetTimer) {
      clearInterval(this.hourResetTimer);
      this.hourResetTimer = undefined;
    }

    this.emit('stopped');
  }

  /**
   * Add a new alert rule
   */
  addRule(rule: AlertRule): void {
    this.config.rules.push(rule);
    if (rule.enabled && this.config.enabled) {
      this.startRuleEvaluation(rule);
    }
  }

  /**
   * Remove an alert rule
   */
  removeRule(name: string): boolean {
    const index = this.config.rules.findIndex((r) => r.name === name);
    if (index === -1) return false;

    // Stop evaluation timer
    const timer = this.evaluationTimers.get(name);
    if (timer) {
      clearInterval(timer);
      this.evaluationTimers.delete(name);
    }

    this.config.rules.splice(index, 1);
    return true;
  }

  /**
   * Trigger an alert manually
   */
  triggerAlert(
    ruleName: string,
    message: string,
    metadata?: Record<string, unknown>
  ): Alert | undefined {
    const rule = this.config.rules.find((r) => r.name === ruleName);
    if (!rule) return undefined;

    return this.fireAlert(rule, message, metadata);
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): Alert | undefined {
    const alert = this.alerts.get(alertId);
    if (!alert) return undefined;

    alert.status = 'resolved';
    alert.resolvedAt = Date.now();

    this.emit('alertResolved', alert);
    return alert;
  }

  /**
   * Get all active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter(
      (a) => a.status === 'firing'
    );
  }

  /**
   * Get alerts by severity
   */
  getAlertsBySeverity(severity: AlertSeverity): Alert[] {
    return Array.from(this.alerts.values()).filter(
      (a) => a.severity === severity
    );
  }

  /**
   * Get all alerts
   */
  getAllAlerts(): Alert[] {
    return Array.from(this.alerts.values());
  }

  /**
   * Check if in maintenance window
   */
  private isInMaintenanceWindow(severity: AlertSeverity): boolean {
    const now = new Date();

    for (const window of this.config.suppression.maintenanceWindows) {
      // Simple schedule parsing (e.g., "Sunday 2:00-4:00 UTC")
      // In production, use a proper cron parser
      if (window.suppress.includes(severity)) {
        // For now, always return false (no maintenance window)
        // TODO: Implement proper schedule parsing
        return false;
      }
    }

    return false;
  }

  /**
   * Check rate limiting
   */
  private isRateLimited(ruleName: string): boolean {
    const { rateLimiting } = this.config.suppression;

    // Check global rate limit
    if (this.alertsThisHour >= rateLimiting.maxAlertsPerHour) {
      return true;
    }

    // Check per-rule rate limit
    const ruleCount = this.alertsPerRuleThisHour.get(ruleName) || 0;
    if (ruleCount >= rateLimiting.maxAlertsPerRulePerHour) {
      return true;
    }

    return false;
  }

  /**
   * Check deduplication
   */
  private isDuplicate(ruleName: string): boolean {
    const lastFiredTime = this.lastFired.get(ruleName);
    if (!lastFiredTime) return false;

    const window = this.config.suppression.deduplicationWindow;
    return Date.now() - lastFiredTime < window;
  }

  /**
   * Start rule evaluation
   */
  private startRuleEvaluation(rule: AlertRule): void {
    const timer = setInterval(() => {
      this.evaluateRule(rule);
    }, rule.evaluationInterval);

    this.evaluationTimers.set(rule.name, timer);
  }

  /**
   * Evaluate a rule
   */
  private evaluateRule(rule: AlertRule): void {
    // Check if rule should fire based on condition
    // In a real implementation, this would evaluate the condition
    // For now, we'll emit an event for external evaluation
    this.emit('evaluateRule', rule);
  }

  /**
   * Fire an alert
   */
  private fireAlert(
    rule: AlertRule,
    message: string,
    metadata?: Record<string, unknown>
  ): Alert | undefined {
    // Check maintenance window
    if (this.isInMaintenanceWindow(rule.severity)) {
      return undefined;
    }

    // Check rate limiting
    if (this.isRateLimited(rule.name)) {
      return undefined;
    }

    // Check deduplication
    if (this.isDuplicate(rule.name)) {
      return undefined;
    }

    // Check cooldown
    const lastFiredTime = this.lastFired.get(rule.name);
    if (lastFiredTime && Date.now() - lastFiredTime < rule.cooldown) {
      return undefined;
    }

    const alert: Alert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      rule: rule.name,
      severity: rule.severity,
      status: 'firing',
      message,
      timestamp: Date.now(),
      metadata,
    };

    this.alerts.set(alert.id, alert);
    this.lastFired.set(rule.name, Date.now());

    // Update rate limiting counters
    this.alertsThisHour++;
    const ruleCount = this.alertsPerRuleThisHour.get(rule.name) || 0;
    this.alertsPerRuleThisHour.set(rule.name, ruleCount + 1);

    this.emit('alertFired', alert);

    // Send notifications
    this.sendNotifications(alert, rule.channels);

    return alert;
  }

  /**
   * Send notifications to configured channels
   */
  private sendNotifications(alert: Alert, channels: string[]): void {
    for (const channel of channels) {
      this.sendNotification(alert, channel);
    }
  }

  /**
   * Send notification to a specific channel
   */
  private sendNotification(alert: Alert, channel: string): void {
    const notification: AlertNotification = {
      alert,
      channel,
      sentAt: Date.now(),
      status: 'pending',
    };

    switch (channel) {
      case 'email':
        this.sendEmailNotification(alert);
        break;
      case 'slack':
        this.sendSlackNotification(alert);
        break;
      case 'pagerduty':
        this.sendPagerDutyNotification(alert);
        break;
      case 'webhook':
        this.sendWebhookNotification(alert);
        break;
      case 'sms':
        this.sendSMSNotification(alert);
        break;
    }

    notification.status = 'sent';
    this.notifications.push(notification);
    this.emit('notificationSent', notification);
  }

  /**
   * Send email notification
   */
  private sendEmailNotification(alert: Alert): void {
    if (!this.config.channels.email?.enabled) return;
    // Implementation would send actual email
    this.emit('emailNotification', alert);
  }

  /**
   * Send Slack notification
   */
  private sendSlackNotification(alert: Alert): void {
    if (!this.config.channels.slack?.enabled) return;
    // Implementation would send actual Slack message
    this.emit('slackNotification', alert);
  }

  /**
   * Send PagerDuty notification
   */
  private sendPagerDutyNotification(alert: Alert): void {
    if (!this.config.channels.pagerduty?.enabled) return;
    // Implementation would create PagerDuty incident
    this.emit('pagerdutyNotification', alert);
  }

  /**
   * Send webhook notification
   */
  private sendWebhookNotification(alert: Alert): void {
    if (!this.config.channels.webhook?.enabled) return;
    // Implementation would POST to webhook
    this.emit('webhookNotification', alert);
  }

  /**
   * Send SMS notification
   */
  private sendSMSNotification(alert: Alert): void {
    if (!this.config.channels.sms?.enabled) return;
    // Implementation would send actual SMS
    this.emit('smsNotification', alert);
  }
}

/**
 * Predefined alert rules based on PRD
 */
export const DefaultAlertRules: AlertRule[] = [
  // P0 - Critical
  {
    name: 'allCircuitsOpen',
    severity: 'P0',
    condition: 'all_circuits_open == true',
    evaluationInterval: 30000,
    cooldown: 300000,
    channels: ['email', 'slack', 'pagerduty'],
    enabled: true,
  },
  {
    name: 'databaseInaccessible',
    severity: 'P0',
    condition: "database_health == 'down'",
    evaluationInterval: 30000,
    cooldown: 300000,
    channels: ['email', 'slack', 'pagerduty'],
    enabled: true,
  },

  // P1 - High
  {
    name: 'majorityCircuitsOpen',
    severity: 'P1',
    condition: 'circuits_open_percent > 50',
    evaluationInterval: 60000,
    cooldown: 600000,
    channels: ['email', 'slack'],
    enabled: true,
  },
  {
    name: 'highErrorRate',
    severity: 'P1',
    condition: 'error_rate > 0.20 for 5m',
    evaluationInterval: 60000,
    cooldown: 600000,
    channels: ['email', 'slack'],
    enabled: true,
  },
  {
    name: 'dlqOverflow',
    severity: 'P1',
    condition: 'dlq_size > 5000',
    evaluationInterval: 60000,
    cooldown: 600000,
    channels: ['email', 'slack'],
    enabled: true,
  },

  // P2 - Medium
  {
    name: 'lowSuccessRate',
    severity: 'P2',
    condition: 'application_success_rate < 0.80 for 15m',
    evaluationInterval: 300000,
    cooldown: 1800000,
    channels: ['email'],
    enabled: true,
  },
  {
    name: 'highMemory',
    severity: 'P2',
    condition: 'memory_usage_percent > 90 for 5m',
    evaluationInterval: 120000,
    cooldown: 1800000,
    channels: ['email'],
    enabled: true,
  },

  // P3 - Low
  {
    name: 'diskUsage',
    severity: 'P3',
    condition: 'disk_usage_percent > 80',
    evaluationInterval: 600000,
    cooldown: 86400000,
    channels: ['email'],
    enabled: true,
  },
];

/**
 * Default alerting configuration
 */
export function getDefaultAlertingConfig(): AlertingConfig {
  return {
    enabled: true,
    channels: {
      email: {
        enabled: false,
        recipients: [],
        templates: {
          P0: 'critical-alert',
          P1: 'high-alert',
          P2: 'medium-alert',
          P3: 'low-alert',
        },
      },
      slack: {
        enabled: false,
        channels: {
          P0: '#alerts-critical',
          P1: '#alerts-high',
          P2: '#alerts-medium',
          P3: '#alerts-low',
        },
      },
      pagerduty: {
        enabled: false,
      },
      webhook: {
        enabled: false,
      },
      sms: {
        enabled: false,
      },
    },
    rules: DefaultAlertRules,
    suppression: {
      maintenanceWindows: [],
      rateLimiting: {
        maxAlertsPerHour: 10,
        maxAlertsPerRulePerHour: 3,
      },
      deduplicationWindow: 900000, // 15 minutes
    },
  };
}

// Singleton instance
let alertingInstance: AlertingSystem | null = null;

export function getAlertingSystem(config?: Partial<AlertingConfig>): AlertingSystem {
  if (!alertingInstance) {
    alertingInstance = new AlertingSystem({
      ...getDefaultAlertingConfig(),
      ...config,
    });
  }
  return alertingInstance;
}
