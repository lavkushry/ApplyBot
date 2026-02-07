import Database from '../database-stub.js';
import type { DatabaseStub } from '../database-stub.js';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

export type ApplicationOutcome =
  | 'submitted'
  | 'phone_screen'
  | 'technical_interview'
  | 'onsite'
  | 'offer'
  | 'rejected'
  | 'ghosted'
  | 'withdrawn';

export interface OutcomeRecord {
  id: string;
  jobId: string;
  timestamp: string;
  outcome: ApplicationOutcome;
  tailoringVersion: string;
  llmProvider: string;
  llmModel: string;
  fitScore: number;
  confidenceScore: number;
  timeToOutcome?: number; // days from submission
  notes?: string;
}

export interface SuccessMetrics {
  totalApplications: number;
  byOutcome: Record<ApplicationOutcome, number>;
  conversionRates: {
    submissionToPhone: number;
    phoneToTechnical: number;
    technicalToOnsite: number;
    onsiteToOffer: number;
    overall: number;
  };
  byProvider: Record<string, { applications: number; offers: number; rate: number }>;
  byModel: Record<string, { applications: number; offers: number; rate: number }>;
  byFitScore: Array<{ range: string; applications: number; offers: number; rate: number }>;
}

export class OutcomeTracker {
  private db: DatabaseStub;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || join(process.cwd(), 'data', 'outcomes.sqlite');
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
      CREATE TABLE IF NOT EXISTS application_outcomes (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        outcome TEXT NOT NULL,
        tailoring_version TEXT,
        llm_provider TEXT,
        llm_model TEXT,
        fit_score REAL,
        confidence_score REAL,
        time_to_outcome INTEGER,
        notes TEXT,
        FOREIGN KEY (job_id) REFERENCES jobs(id)
      );

      CREATE INDEX IF NOT EXISTS idx_outcomes_job_id ON application_outcomes(job_id);
      CREATE INDEX IF NOT EXISTS idx_outcomes_outcome ON application_outcomes(outcome);
      CREATE INDEX IF NOT EXISTS idx_outcomes_provider ON application_outcomes(llm_provider);
      CREATE INDEX IF NOT EXISTS idx_outcomes_model ON application_outcomes(llm_model);

      -- Table to track which resume version was used
      CREATE TABLE IF NOT EXISTS tailoring_versions (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        version_hash TEXT NOT NULL,
        summary TEXT,
        skills TEXT,
        experience TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (job_id) REFERENCES jobs(id)
      );
    `);
  }

  /**
   * Record an application outcome
   */
  recordOutcome(record: Omit<OutcomeRecord, 'id' | 'timestamp'>): OutcomeRecord {
    const id = `outcome_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO application_outcomes
      (id, job_id, timestamp, outcome, tailoring_version, llm_provider, llm_model, fit_score, confidence_score, time_to_outcome, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      record.jobId,
      timestamp,
      record.outcome,
      record.tailoringVersion,
      record.llmProvider,
      record.llmModel,
      record.fitScore,
      record.confidenceScore,
      record.timeToOutcome || null,
      record.notes || null
    );

    return {
      ...record,
      id,
      timestamp,
    };
  }

  /**
   * Update an existing outcome
   */
  updateOutcome(jobId: string, outcome: ApplicationOutcome, notes?: string): void {
    const stmt = this.db.prepare(`
      UPDATE application_outcomes
      SET outcome = ?, notes = ?
      WHERE job_id = ?
    `);

    stmt.run(outcome, notes || null, jobId);
  }

  /**
   * Get success metrics
   */
  getSuccessMetrics(timeRange?: { start: Date; end: Date }): SuccessMetrics {
    let whereClause = '';
    const params: (string | number)[] = [];

    if (timeRange) {
      whereClause = 'WHERE timestamp >= ? AND timestamp <= ?';
      params.push(timeRange.start.toISOString(), timeRange.end.toISOString());
    }

    // Get total counts by outcome
    const outcomeCounts = this.db
      .query(
        `
      SELECT outcome, COUNT(*) as count
      FROM application_outcomes
      ${whereClause}
      GROUP BY outcome
    `
      )
      .all(...params) as Array<{ outcome: ApplicationOutcome; count: number }>;

    const byOutcome: Record<ApplicationOutcome, number> = {
      submitted: 0,
      phone_screen: 0,
      technical_interview: 0,
      onsite: 0,
      offer: 0,
      rejected: 0,
      ghosted: 0,
      withdrawn: 0,
    };

    for (const row of outcomeCounts) {
      byOutcome[row.outcome] = row.count;
    }

    const totalApplications = Object.values(byOutcome).reduce((a, b) => a + b, 0);

    // Calculate conversion rates
    const submitted = byOutcome.submitted || totalApplications;
    const phoneScreens = byOutcome.phone_screen;
    const technicals = byOutcome.technical_interview;
    const onsites = byOutcome.onsite;
    const offers = byOutcome.offer;

    const conversionRates = {
      submissionToPhone: submitted > 0 ? Math.round((phoneScreens / submitted) * 100) : 0,
      phoneToTechnical: phoneScreens > 0 ? Math.round((technicals / phoneScreens) * 100) : 0,
      technicalToOnsite: technicals > 0 ? Math.round((onsites / technicals) * 100) : 0,
      onsiteToOffer: onsites > 0 ? Math.round((offers / onsites) * 100) : 0,
      overall: submitted > 0 ? Math.round((offers / submitted) * 100) : 0,
    };

    // By provider
    const providerStats = this.db
      .query(
        `
      SELECT llm_provider,
             COUNT(*) as applications,
             SUM(CASE WHEN outcome = 'offer' THEN 1 ELSE 0 END) as offers
      FROM application_outcomes
      ${whereClause}
      GROUP BY llm_provider
    `
      )
      .all(...params) as Array<{ llm_provider: string; applications: number; offers: number }>;

    const byProvider: Record<string, { applications: number; offers: number; rate: number }> = {};
    for (const row of providerStats) {
      byProvider[row.llm_provider] = {
        applications: row.applications,
        offers: row.offers,
        rate: row.applications > 0 ? Math.round((row.offers / row.applications) * 100) : 0,
      };
    }

    // By model
    const modelStats = this.db
      .query(
        `
      SELECT llm_model,
             COUNT(*) as applications,
             SUM(CASE WHEN outcome = 'offer' THEN 1 ELSE 0 END) as offers
      FROM application_outcomes
      ${whereClause}
      GROUP BY llm_model
    `
      )
      .all(...params) as Array<{ llm_model: string; applications: number; offers: number }>;

    const byModel: Record<string, { applications: number; offers: number; rate: number }> = {};
    for (const row of modelStats) {
      byModel[row.llm_model] = {
        applications: row.applications,
        offers: row.offers,
        rate: row.applications > 0 ? Math.round((row.offers / row.applications) * 100) : 0,
      };
    }

    // By fit score ranges
    const fitScoreStats = this.db
      .query(
        `
      SELECT
        CASE
          WHEN fit_score >= 90 THEN '90-100'
          WHEN fit_score >= 80 THEN '80-89'
          WHEN fit_score >= 70 THEN '70-79'
          WHEN fit_score >= 60 THEN '60-69'
          ELSE 'Below 60'
        END as range,
        COUNT(*) as applications,
        SUM(CASE WHEN outcome = 'offer' THEN 1 ELSE 0 END) as offers
      FROM application_outcomes
      ${whereClause}
      GROUP BY range
      ORDER BY fit_score DESC
    `
      )
      .all(...params) as Array<{ range: string; applications: number; offers: number }>;

    const byFitScore = fitScoreStats.map((row) => ({
      range: row.range,
      applications: row.applications,
      offers: row.offers,
      rate: row.applications > 0 ? Math.round((row.offers / row.applications) * 100) : 0,
    }));

    return {
      totalApplications,
      byOutcome,
      conversionRates,
      byProvider,
      byModel,
      byFitScore,
    };
  }

  /**
   * Get insights for improving applications
   */
  getInsights(): Array<{
    insight: string;
    metric: string;
    recommendation: string;
  }> {
    const metrics = this.getSuccessMetrics();
    const insights: Array<{ insight: string; metric: string; recommendation: string }> = [];

    // Provider comparison
    const providers = Object.entries(metrics.byProvider);
    if (providers.length > 1) {
      const bestProvider = providers.sort((a, b) => b[1].rate - a[1].rate)[0];
      insights.push({
        insight: `${bestProvider[0]} has the highest success rate`,
        metric: `${bestProvider[1].rate}% offer rate`,
        recommendation: `Consider using ${bestProvider[0]} for high-priority applications`,
      });
    }

    // Fit score correlation
    const highFitScores = metrics.byFitScore.filter(
      (f) => f.range.startsWith('8') || f.range.startsWith('9')
    );
    const lowFitScores = metrics.byFitScore.filter(
      (f) => f.range.startsWith('Below') || f.range.startsWith('6')
    );

    if (highFitScores.length > 0 && lowFitScores.length > 0) {
      const highAvg = highFitScores.reduce((sum, f) => sum + f.rate, 0) / highFitScores.length;
      const lowAvg = lowFitScores.reduce((sum, f) => sum + f.rate, 0) / lowFitScores.length;

      if (highAvg > lowAvg * 1.5) {
        insights.push({
          insight: 'Higher fit scores correlate with better outcomes',
          metric: `${Math.round(highAvg)}% vs ${Math.round(lowAvg)}% offer rate`,
          recommendation: 'Focus on jobs with fit scores above 80',
        });
      }
    }

    // Conversion funnel
    if (metrics.conversionRates.submissionToPhone < 20) {
      insights.push({
        insight: 'Low response rate to applications',
        metric: `${metrics.conversionRates.submissionToPhone}% phone screen rate`,
        recommendation: 'Review resume tailoring quality and target better-fit roles',
      });
    }

    return insights;
  }

  /**
   * Save tailoring version for A/B testing
   */
  saveTailoringVersion(
    jobId: string,
    versionHash: string,
    content: { summary: string; skills: string[]; experience: unknown[] }
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO tailoring_versions (id, job_id, version_hash, summary, skills, experience)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      `version_${Date.now()}`,
      jobId,
      versionHash,
      content.summary,
      JSON.stringify(content.skills),
      JSON.stringify(content.experience)
    );
  }

  /**
   * Get outcomes for a specific job
   */
  getJobOutcomes(jobId: string): OutcomeRecord[] {
    const records = this.db
      .query(
        `
      SELECT * FROM application_outcomes WHERE job_id = ? ORDER BY timestamp DESC
    `
      )
      .all(jobId) as Array<{
      id: string;
      job_id: string;
      timestamp: string;
      outcome: ApplicationOutcome;
      tailoring_version: string;
      llm_provider: string;
      llm_model: string;
      fit_score: number;
      confidence_score: number;
      time_to_outcome: number;
      notes: string;
    }>;

    return records.map((r) => ({
      id: r.id,
      jobId: r.job_id,
      timestamp: r.timestamp,
      outcome: r.outcome,
      tailoringVersion: r.tailoring_version,
      llmProvider: r.llm_provider,
      llmModel: r.llm_model,
      fitScore: r.fit_score,
      confidenceScore: r.confidence_score,
      timeToOutcome: r.time_to_outcome,
      notes: r.notes,
    }));
  }

  close(): void {
    this.db.close();
  }
}

// Singleton instance
let outcomeTrackerInstance: OutcomeTracker | null = null;

export function getOutcomeTracker(dbPath?: string): OutcomeTracker {
  if (!outcomeTrackerInstance) {
    outcomeTrackerInstance = new OutcomeTracker(dbPath);
  }
  return outcomeTrackerInstance;
}
