import Database from '../database-stub.js';
import type { DatabaseStub } from '../database-stub.js';
import { createHash } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

export interface ABTestVariant {
  id: string;
  name: string;
  promptTemplate: string;
  parameters: Record<string, unknown>;
}

export interface ABTest {
  id: string;
  name: string;
  description: string;
  variants: ABTestVariant[];
  startDate: string;
  endDate?: string;
  status: 'running' | 'paused' | 'completed';
  winner?: string;
}

export interface ABTestResult {
  testId: string;
  variantId: string;
  jobId: string;
  outcome: 'success' | 'failure' | 'interview' | 'offer';
  metrics: {
    qualityScore: number;
    userRating?: number;
    timeToComplete?: number;
  };
  timestamp: string;
}

export class ABTester {
  private db: DatabaseStub;
  private dbPath: string;
  private activeTests: Map<string, ABTest> = new Map();

  constructor(dbPath?: string) {
    this.dbPath = dbPath || join(process.cwd(), 'data', 'ab_tests.sqlite');
    this.ensureDirectory();
    this.db = new Database(this.dbPath);
    this.initializeSchema();
    this.loadActiveTests();
  }

  private ensureDirectory(): void {
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ab_tests (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        variants TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT,
        status TEXT NOT NULL DEFAULT 'running',
        winner TEXT
      );

      CREATE TABLE IF NOT EXISTS ab_test_results (
        id TEXT PRIMARY KEY,
        test_id TEXT NOT NULL,
        variant_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        outcome TEXT NOT NULL,
        quality_score REAL,
        user_rating INTEGER,
        time_to_complete INTEGER,
        timestamp TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (test_id) REFERENCES ab_tests(id)
      );

      CREATE INDEX IF NOT EXISTS idx_ab_results_test ON ab_test_results(test_id);
      CREATE INDEX IF NOT EXISTS idx_ab_results_variant ON ab_test_results(variant_id);
    `);
  }

  private loadActiveTests(): void {
    const tests = this.db
      .query(
        `
      SELECT * FROM ab_tests WHERE status = 'running'
    `
      )
      .all() as Array<{
      id: string;
      name: string;
      description: string;
      variants: string;
      start_date: string;
      end_date: string | null;
      status: string;
      winner: string | null;
    }>;

    for (const test of tests) {
      this.activeTests.set(test.id, {
        id: test.id,
        name: test.name,
        description: test.description,
        variants: JSON.parse(test.variants),
        startDate: test.start_date,
        endDate: test.end_date || undefined,
        status: test.status as ABTest['status'],
        winner: test.winner || undefined,
      });
    }
  }

  /**
   * Create a new A/B test
   */
  createTest(test: Omit<ABTest, 'id' | 'startDate' | 'status'>): ABTest {
    const id = `abtest_${Date.now()}`;
    const startDate = new Date().toISOString();

    const newTest: ABTest = {
      ...test,
      id,
      startDate,
      status: 'running',
    };

    const stmt = this.db.prepare(`
      INSERT INTO ab_tests (id, name, description, variants, start_date, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, test.name, test.description, JSON.stringify(test.variants), startDate, 'running');

    this.activeTests.set(id, newTest);

    return newTest;
  }

  /**
   * Get variant for a job (round-robin assignment)
   */
  getVariantForJob(testId: string, jobId: string): ABTestVariant | null {
    const test = this.activeTests.get(testId);
    if (!test || test.status !== 'running') {
      return null;
    }

    // Use hash of jobId to deterministically assign variant
    const hash = createHash('md5').update(jobId).digest('hex');
    const variantIndex = parseInt(hash.substring(0, 8), 16) % test.variants.length;

    return test.variants[variantIndex];
  }

  /**
   * Record a result for an A/B test
   */
  recordResult(result: Omit<ABTestResult, 'timestamp'>): void {
    const id = `abresult_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO ab_test_results
      (id, test_id, variant_id, job_id, outcome, quality_score, user_rating, time_to_complete, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      result.testId,
      result.variantId,
      result.jobId,
      result.outcome,
      result.metrics.qualityScore,
      result.metrics.userRating || null,
      result.metrics.timeToComplete || null,
      timestamp
    );
  }

  /**
   * Get test results and statistics
   */
  getTestResults(testId: string): {
    test: ABTest;
    variantStats: Array<{
      variant: ABTestVariant;
      total: number;
      successes: number;
      interviews: number;
      offers: number;
      avgQuality: number;
      avgUserRating: number;
    }>;
    recommendation: string;
  } | null {
    const test = this.db.query(`SELECT * FROM ab_tests WHERE id = ?`).get(testId) as {
      id: string;
      name: string;
      description: string;
      variants: string;
      start_date: string;
      end_date: string | null;
      status: string;
      winner: string | null;
    } | null;

    if (!test) return null;

    const parsedTest: ABTest = {
      id: test.id,
      name: test.name,
      description: test.description,
      variants: JSON.parse(test.variants),
      startDate: test.start_date,
      endDate: test.end_date || undefined,
      status: test.status as ABTest['status'],
      winner: test.winner || undefined,
    };

    const results = this.db
      .query(
        `
      SELECT
        variant_id,
        COUNT(*) as total,
        SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as successes,
        SUM(CASE WHEN outcome = 'interview' THEN 1 ELSE 0 END) as interviews,
        SUM(CASE WHEN outcome = 'offer' THEN 1 ELSE 0 END) as offers,
        AVG(quality_score) as avg_quality,
        AVG(user_rating) as avg_rating
      FROM ab_test_results
      WHERE test_id = ?
      GROUP BY variant_id
    `
      )
      .all(testId) as Array<{
      variant_id: string;
      total: number;
      successes: number;
      interviews: number;
      offers: number;
      avg_quality: number;
      avg_rating: number;
    }>;

    const variantStats = parsedTest.variants.map((variant) => {
      const stats = results.find((r) => r.variant_id === variant.id);
      return {
        variant,
        total: stats?.total || 0,
        successes: stats?.successes || 0,
        interviews: stats?.interviews || 0,
        offers: stats?.offers || 0,
        avgQuality: stats?.avg_quality || 0,
        avgUserRating: stats?.avg_rating || 0,
      };
    });

    // Generate recommendation
    const recommendation = this.generateRecommendation(variantStats);

    return {
      test: parsedTest,
      variantStats,
      recommendation,
    };
  }

  /**
   * End a test and declare winner
   */
  endTest(testId: string, winnerVariantId?: string): void {
    const endDate = new Date().toISOString();

    const stmt = this.db.prepare(`
      UPDATE ab_tests
      SET status = 'completed', end_date = ?, winner = ?
      WHERE id = ?
    `);

    stmt.run(endDate, winnerVariantId || null, testId);

    // Update in-memory
    const test = this.activeTests.get(testId);
    if (test) {
      test.status = 'completed';
      test.endDate = endDate;
      test.winner = winnerVariantId;
    }
  }

  /**
   * Get active tests
   */
  getActiveTests(): ABTest[] {
    return Array.from(this.activeTests.values()).filter((t) => t.status === 'running');
  }

  /**
   * Generate recommendation based on variant stats
   */
  private generateRecommendation(
    stats: Array<{
      total: number;
      offers: number;
      avgQuality: number;
      avgUserRating: number;
    }>
  ): string {
    if (stats.length < 2 || stats.every((s) => s.total === 0)) {
      return 'Not enough data to make a recommendation yet.';
    }

    // Find best performing variant
    const bestVariant = stats.reduce((best, current) => {
      const currentScore = current.offers * 10 + current.avgQuality + current.avgUserRating;
      const bestScore = best.offers * 10 + best.avgQuality + best.avgUserRating;
      return currentScore > bestScore ? current : best;
    });

    const bestIndex = stats.indexOf(bestVariant);

    return `Variant ${bestIndex + 1} is performing best with ${bestVariant.offers} offers and ${Math.round(bestVariant.avgQuality * 10) / 10} average quality score.`;
  }

  close(): void {
    this.db.close();
  }
}

// Singleton instance
let abTesterInstance: ABTester | null = null;

export function getABTester(dbPath?: string): ABTester {
  if (!abTesterInstance) {
    abTesterInstance = new ABTester(dbPath);
  }
  return abTesterInstance;
}
