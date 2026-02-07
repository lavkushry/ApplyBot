/**
 * Audit Trail Module
 *
 * Implements PRD Section 15.2 - Audit Trail.
 * Persistent JSONL-based audit log recording every "write" action.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { EventEmitter } from 'events';

export type AuditAction =
  | 'file_write'
  | 'file_delete'
  | 'network_request'
  | 'tool_execution'
  | 'config_change'
  | 'session_create'
  | 'session_update'
  | 'session_delete'
  | 'job_submit'
  | 'job_update'
  | 'memory_write'
  | 'browser_action';

export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditEntry {
  id: number;
  timestamp: number;
  action: AuditAction;
  severity: AuditSeverity;
  component: string;
  sessionId?: string;
  jobId?: string;
  userId?: string;
  description: string;
  metadata?: Record<string, unknown>;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditQuery {
  startTime?: number;
  endTime?: number;
  actions?: AuditAction[];
  severity?: AuditSeverity;
  component?: string;
  sessionId?: string;
  jobId?: string;
  limit?: number;
  offset?: number;
}

export interface AuditStats {
  totalEntries: number;
  entriesByAction: Record<AuditAction, number>;
  entriesBySeverity: Record<AuditSeverity, number>;
  entriesLast24h: number;
  entriesLast7d: number;
  entriesLast30d: number;
}

/**
 * Audit Trail implementation following PRD 15.2
 * Uses JSONL format for simplicity and portability
 */
export class AuditTrail extends EventEmitter {
  private logPath: string;
  private indexPath: string;
  private entries: AuditEntry[] = [];
  private nextId: number = 1;
  private static instance: AuditTrail;
  private maxMemoryEntries: number = 1000;

  private constructor(logPath?: string) {
    super();

    const auditDir = join(homedir(), '.applypilot', 'audit');
    this.logPath = logPath || join(auditDir, 'audit.jsonl');
    this.indexPath = join(auditDir, 'audit.index.json');

    this.ensureDirectory();
    this.loadExistingEntries();
  }

  static getInstance(logPath?: string): AuditTrail {
    if (!AuditTrail.instance) {
      AuditTrail.instance = new AuditTrail(logPath);
    }
    return AuditTrail.instance;
  }

  static resetInstance(): void {
    AuditTrail.instance = undefined as unknown as AuditTrail;
  }

  /**
   * Ensure audit directory exists
   */
  private ensureDirectory(): void {
    const dir = join(homedir(), '.applypilot', 'audit');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Load existing entries from file
   */
  private loadExistingEntries(): void {
    if (existsSync(this.logPath)) {
      try {
        const content = readFileSync(this.logPath, 'utf-8');
        const lines = content.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          try {
            const entry = JSON.parse(line) as AuditEntry;
            this.entries.push(entry);
            if (entry.id >= this.nextId) {
              this.nextId = entry.id + 1;
            }
          } catch {
            // Skip invalid lines
          }
        }

        // Keep only recent entries in memory
        if (this.entries.length > this.maxMemoryEntries) {
          this.entries = this.entries.slice(-this.maxMemoryEntries);
        }
      } catch (error) {
        console.warn('Failed to load audit log, starting fresh');
      }
    }

    // Load index if exists
    if (existsSync(this.indexPath)) {
      try {
        const index = JSON.parse(readFileSync(this.indexPath, 'utf-8'));
        if (index.nextId > this.nextId) {
          this.nextId = index.nextId;
        }
      } catch {
        // Ignore index errors
      }
    }
  }

  /**
   * Save index file
   */
  private saveIndex(): void {
    try {
      writeFileSync(
        this.indexPath,
        JSON.stringify({ nextId: this.nextId, lastUpdated: Date.now() })
      );
    } catch (error) {
      console.warn('Failed to save audit index');
    }
  }

  /**
   * Log an audit entry
   */
  log(
    action: AuditAction,
    description: string,
    options: {
      severity?: AuditSeverity;
      component?: string;
      sessionId?: string;
      jobId?: string;
      userId?: string;
      metadata?: Record<string, unknown>;
      beforeState?: Record<string, unknown>;
      afterState?: Record<string, unknown>;
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): number {
    const entry: AuditEntry = {
      id: this.nextId++,
      timestamp: Date.now(),
      action,
      severity: options.severity || 'info',
      component: options.component || 'app',
      sessionId: options.sessionId,
      jobId: options.jobId,
      userId: options.userId,
      description,
      metadata: options.metadata,
      beforeState: options.beforeState,
      afterState: options.afterState,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
    };

    // Add to memory
    this.entries.push(entry);
    if (this.entries.length > this.maxMemoryEntries) {
      this.entries.shift();
    }

    // Append to file
    try {
      const line = JSON.stringify(entry) + '\n';
      appendFileSync(this.logPath, line);
    } catch (error) {
      console.error('Failed to write audit entry:', error);
    }

    // Save index
    this.saveIndex();

    this.emit('audit', entry);

    return entry.id;
  }

  /**
   * Query audit entries
   */
  query(query: AuditQuery = {}): AuditEntry[] {
    let results = [...this.entries];

    // Load more entries from file if needed
    if (existsSync(this.logPath)) {
      try {
        const content = readFileSync(this.logPath, 'utf-8');
        const lines = content.split('\n').filter((line) => line.trim());
        const fileEntries: AuditEntry[] = [];

        for (const line of lines) {
          try {
            const entry = JSON.parse(line) as AuditEntry;
            // Only add entries not in memory
            if (!this.entries.find((e) => e.id === entry.id)) {
              fileEntries.push(entry);
            }
          } catch {
            // Skip invalid lines
          }
        }

        results = [...fileEntries, ...results];
      } catch {
        // Ignore file read errors
      }
    }

    // Apply filters
    if (query.startTime) {
      results = results.filter((e) => e.timestamp >= query.startTime!);
    }

    if (query.endTime) {
      results = results.filter((e) => e.timestamp <= query.endTime!);
    }

    if (query.actions && query.actions.length > 0) {
      results = results.filter((e) => query.actions!.includes(e.action));
    }

    if (query.severity) {
      results = results.filter((e) => e.severity === query.severity);
    }

    if (query.component) {
      results = results.filter((e) => e.component === query.component);
    }

    if (query.sessionId) {
      results = results.filter((e) => e.sessionId === query.sessionId);
    }

    if (query.jobId) {
      results = results.filter((e) => e.jobId === query.jobId);
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || results.length;

    return results.slice(offset, offset + limit);
  }

  /**
   * Get audit statistics
   */
  getStats(): AuditStats {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    // Get all entries
    const allEntries = this.query({ limit: 100000 });

    const totalEntries = allEntries.length;

    const entriesLast24h = allEntries.filter((e) => e.timestamp >= now - dayMs).length;
    const entriesLast7d = allEntries.filter((e) => e.timestamp >= now - 7 * dayMs).length;
    const entriesLast30d = allEntries.filter((e) => e.timestamp >= now - 30 * dayMs).length;

    // Count by action
    const entriesByAction: Record<AuditAction, number> = {
      file_write: 0,
      file_delete: 0,
      network_request: 0,
      tool_execution: 0,
      config_change: 0,
      session_create: 0,
      session_update: 0,
      session_delete: 0,
      job_submit: 0,
      job_update: 0,
      memory_write: 0,
      browser_action: 0,
    };

    for (const entry of allEntries) {
      entriesByAction[entry.action] = (entriesByAction[entry.action] || 0) + 1;
    }

    // Count by severity
    const entriesBySeverity: Record<AuditSeverity, number> = {
      info: 0,
      warning: 0,
      critical: 0,
    };

    for (const entry of allEntries) {
      entriesBySeverity[entry.severity] = (entriesBySeverity[entry.severity] || 0) + 1;
    }

    return {
      totalEntries,
      entriesByAction,
      entriesBySeverity,
      entriesLast24h,
      entriesLast7d,
      entriesLast30d,
    };
  }

  /**
   * Get a single audit entry by ID
   */
  getById(id: number): AuditEntry | undefined {
    // Check memory first
    let entry = this.entries.find((e) => e.id === id);
    if (entry) return entry;

    // Check file
    if (existsSync(this.logPath)) {
      try {
        const content = readFileSync(this.logPath, 'utf-8');
        const lines = content.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          try {
            const e = JSON.parse(line) as AuditEntry;
            if (e.id === id) return e;
          } catch {
            // Skip invalid lines
          }
        }
      } catch {
        // Ignore file read errors
      }
    }

    return undefined;
  }

  /**
   * Export audit log to JSON
   */
  export(query: AuditQuery = {}): string {
    const entries = this.query(query);
    return JSON.stringify(entries, null, 2);
  }

  /**
   * Purge old audit entries
   */
  purge(olderThanDays: number): number {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

    if (!existsSync(this.logPath)) return 0;

    try {
      const content = readFileSync(this.logPath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());
      const kept: string[] = [];
      let removed = 0;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as AuditEntry;
          if (entry.timestamp >= cutoff) {
            kept.push(line);
          } else {
            removed++;
          }
        } catch {
          kept.push(line); // Keep invalid lines
        }
      }

      writeFileSync(this.logPath, kept.join('\n') + '\n');

      // Update memory
      this.entries = this.entries.filter((e) => e.timestamp >= cutoff);

      return removed;
    } catch (error) {
      console.error('Failed to purge audit log:', error);
      return 0;
    }
  }

  /**
   * Get log file path
   */
  getLogPath(): string {
    return this.logPath;
  }
}

/**
 * Convenience function to get audit trail instance
 */
export function getAuditTrail(logPath?: string): AuditTrail {
  return AuditTrail.getInstance(logPath);
}

// Export default audit instance
export const audit = getAuditTrail();
