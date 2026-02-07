import Database from '../database-stub.js';
import type { DatabaseStub } from '../database-stub.js';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import type { LLMProvider } from '../config/index.js';

export interface UsageRecord {
  id: string;
  timestamp: string;
  provider: LLMProvider;
  model: string;
  operation: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  jobId?: string;
}

export interface CostSummary {
  totalCost: number;
  totalTokens: number;
  totalRequests: number;
  byProvider: Record<string, { cost: number; tokens: number; requests: number }>;
  byModel: Record<string, { cost: number; tokens: number; requests: number }>;
  byDay: Record<string, { cost: number; tokens: number; requests: number }>;
}

export class CostTracker {
  private db: DatabaseStub;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || join(process.cwd(), 'data', 'usage.sqlite');
    this.ensureDirectory();
    this.db = new Database(this.dbPath);
    this.initializeSchema();
  }

  private ensureDirectory(): void {
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS llm_usage (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        operation TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        cost REAL NOT NULL DEFAULT 0,
        job_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON llm_usage(timestamp);
      CREATE INDEX IF NOT EXISTS idx_usage_provider ON llm_usage(provider);
      CREATE INDEX IF NOT EXISTS idx_usage_model ON llm_usage(model);
      CREATE INDEX IF NOT EXISTS idx_usage_job_id ON llm_usage(job_id);
    `);
  }

  /**
   * Record a usage entry
   */
  recordUsage(record: Omit<UsageRecord, 'id' | 'timestamp'>): UsageRecord {
    const id = `usage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO llm_usage 
      (id, timestamp, provider, model, operation, prompt_tokens, completion_tokens, total_tokens, cost, job_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      timestamp,
      record.provider,
      record.model,
      record.operation,
      record.promptTokens,
      record.completionTokens,
      record.totalTokens,
      record.cost,
      record.jobId || null
    );

    return {
      ...record,
      id,
      timestamp,
    };
  }

  /**
   * Get cost summary for a time period
   */
  getSummary(options?: {
    startDate?: Date;
    endDate?: Date;
    provider?: string;
    jobId?: string;
  }): CostSummary {
    let sql = 'SELECT * FROM llm_usage WHERE 1=1';
    const params: (string | number)[] = [];

    if (options?.startDate) {
      sql += ' AND timestamp >= ?';
      params.push(options.startDate.toISOString());
    }

    if (options?.endDate) {
      sql += ' AND timestamp <= ?';
      params.push(options.endDate.toISOString());
    }

    if (options?.provider) {
      sql += ' AND provider = ?';
      params.push(options.provider);
    }

    if (options?.jobId) {
      sql += ' AND job_id = ?';
      params.push(options.jobId);
    }

    sql += ' ORDER BY timestamp DESC';

    const records = this.db.query(sql).all(...params) as Array<{
      provider: string;
      model: string;
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      cost: number;
      timestamp: string;
    }>;

    const summary: CostSummary = {
      totalCost: 0,
      totalTokens: 0,
      totalRequests: records.length,
      byProvider: {},
      byModel: {},
      byDay: {},
    };

    for (const record of records) {
      summary.totalCost += record.cost;
      summary.totalTokens += record.total_tokens;

      // By provider
      if (!summary.byProvider[record.provider]) {
        summary.byProvider[record.provider] = { cost: 0, tokens: 0, requests: 0 };
      }
      summary.byProvider[record.provider].cost += record.cost;
      summary.byProvider[record.provider].tokens += record.total_tokens;
      summary.byProvider[record.provider].requests++;

      // By model
      if (!summary.byModel[record.model]) {
        summary.byModel[record.model] = { cost: 0, tokens: 0, requests: 0 };
      }
      summary.byModel[record.model].cost += record.cost;
      summary.byModel[record.model].tokens += record.total_tokens;
      summary.byModel[record.model].requests++;

      // By day
      const day = record.timestamp.split('T')[0];
      if (!summary.byDay[day]) {
        summary.byDay[day] = { cost: 0, tokens: 0, requests: 0 };
      }
      summary.byDay[day].cost += record.cost;
      summary.byDay[day].tokens += record.total_tokens;
      summary.byDay[day].requests++;
    }

    // Round costs to 4 decimal places
    summary.totalCost = Math.round(summary.totalCost * 10000) / 10000;
    for (const key of Object.keys(summary.byProvider)) {
      summary.byProvider[key].cost = Math.round(summary.byProvider[key].cost * 10000) / 10000;
    }
    for (const key of Object.keys(summary.byModel)) {
      summary.byModel[key].cost = Math.round(summary.byModel[key].cost * 10000) / 10000;
    }
    for (const key of Object.keys(summary.byDay)) {
      summary.byDay[key].cost = Math.round(summary.byDay[key].cost * 10000) / 10000;
    }

    return summary;
  }

  /**
   * Get current month's cost
   */
  getCurrentMonthCost(): number {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const summary = this.getSummary({
      startDate: startOfMonth,
      endDate: now,
    });

    return summary.totalCost;
  }

  /**
   * Check if approaching budget limit
   */
  checkBudget(budgetLimit: number): {
    withinBudget: boolean;
    currentCost: number;
    remaining: number;
    percentageUsed: number;
  } {
    const currentCost = this.getCurrentMonthCost();
    const remaining = Math.max(0, budgetLimit - currentCost);
    const percentageUsed = (currentCost / budgetLimit) * 100;

    return {
      withinBudget: currentCost < budgetLimit,
      currentCost,
      remaining,
      percentageUsed: Math.round(percentageUsed * 100) / 100,
    };
  }

  /**
   * Get recent usage records
   */
  getRecentUsage(limit: number = 50): UsageRecord[] {
    const records = this.db.query(
      'SELECT * FROM llm_usage ORDER BY timestamp DESC LIMIT ?'
    ).all(limit) as Array<{
      id: string;
      timestamp: string;
      provider: LLMProvider;
      model: string;
      operation: string;
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      cost: number;
      job_id: string | null;
    }>;

    return records.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      provider: r.provider,
      model: r.model,
      operation: r.operation,
      promptTokens: r.prompt_tokens,
      completionTokens: r.completion_tokens,
      totalTokens: r.total_tokens,
      cost: r.cost,
      jobId: r.job_id || undefined,
    }));
  }

  /**
   * Get usage for a specific job
   */
  getJobUsage(jobId: string): CostSummary {
    return this.getSummary({ jobId });
  }

  /**
   * Delete old records (for cleanup)
   */
  cleanupOldRecords(olderThanDays: number): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = this.db.run(
      'DELETE FROM llm_usage WHERE timestamp < ?',
      [cutoffDate.toISOString()]
    );

    return result.changes;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

// Singleton instance
let costTrackerInstance: CostTracker | null = null;

export function getCostTracker(dbPath?: string): CostTracker {
  if (!costTrackerInstance) {
    costTrackerInstance = new CostTracker(dbPath);
  }
  return costTrackerInstance;
}

export function resetCostTracker(): void {
  if (costTrackerInstance) {
    costTrackerInstance.close();
    costTrackerInstance = null;
  }
}
