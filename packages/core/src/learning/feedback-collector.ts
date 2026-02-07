import Database from '../database-stub.js';
import type { DatabaseStub } from '../database-stub.js';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

export interface FeedbackRecord {
  id: string;
  jobId: string;
  timestamp: string;
  type: 'resume' | 'cover_letter' | 'answers' | 'overall';
  rating: number; // 1-5
  comments?: string;
  editedContent?: string;
  wouldUseAgain: boolean;
}

export interface FeedbackMetrics {
  averageRating: number;
  byType: Record<string, { count: number; avgRating: number }>;
  wouldUseAgainRate: number;
  commonIssues: string[];
}

export class FeedbackCollector {
  private db: DatabaseStub;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || join(process.cwd(), 'data', 'feedback.sqlite');
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
      CREATE TABLE IF NOT EXISTS user_feedback (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        type TEXT NOT NULL,
        rating INTEGER NOT NULL,
        comments TEXT,
        edited_content TEXT,
        would_use_again BOOLEAN NOT NULL,
        FOREIGN KEY (job_id) REFERENCES jobs(id)
      );

      CREATE INDEX IF NOT EXISTS idx_feedback_job_id ON user_feedback(job_id);
      CREATE INDEX IF NOT EXISTS idx_feedback_type ON user_feedback(type);
      CREATE INDEX IF NOT EXISTS idx_feedback_rating ON user_feedback(rating);
    `);
  }

  /**
   * Collect user feedback
   */
  collectFeedback(feedback: Omit<FeedbackRecord, 'id' | 'timestamp'>): FeedbackRecord {
    const id = `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO user_feedback 
      (id, job_id, timestamp, type, rating, comments, edited_content, would_use_again)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      feedback.jobId,
      timestamp,
      feedback.type,
      feedback.rating,
      feedback.comments || null,
      feedback.editedContent || null,
      feedback.wouldUseAgain ? 1 : 0
    );

    return {
      ...feedback,
      id,
      timestamp,
    };
  }

  /**
   * Quick rating collection
   */
  quickRate(jobId: string, type: FeedbackRecord['type'], rating: number): void {
    this.collectFeedback({
      jobId,
      type,
      rating,
      wouldUseAgain: rating >= 4,
    });
  }

  /**
   * Get feedback metrics
   */
  getMetrics(timeRange?: { start: Date; end: Date }): FeedbackMetrics {
    let whereClause = '';
    const params: (string | number)[] = [];

    if (timeRange) {
      whereClause = 'WHERE timestamp >= ? AND timestamp <= ?';
      params.push(timeRange.start.toISOString(), timeRange.end.toISOString());
    }

    // Average rating
    const avgResult = this.db.query(`
      SELECT AVG(rating) as avg_rating, COUNT(*) as count
      FROM user_feedback
      ${whereClause}
    `).get(...params) as { avg_rating: number; count: number };

    // By type
    const typeResults = this.db.query(`
      SELECT type, COUNT(*) as count, AVG(rating) as avg_rating
      FROM user_feedback
      ${whereClause}
      GROUP BY type
    `).all(...params) as Array<{ type: string; count: number; avg_rating: number }>;

    const byType: Record<string, { count: number; avgRating: number }> = {};
    for (const row of typeResults) {
      byType[row.type] = {
        count: row.count,
        avgRating: Math.round(row.avg_rating * 10) / 10,
      };
    }

    // Would use again rate
    const useAgainResult = this.db.query(`
      SELECT 
        SUM(CASE WHEN would_use_again = 1 THEN 1 ELSE 0 END) as would_use,
        COUNT(*) as total
      FROM user_feedback
      ${whereClause}
    `).get(...params) as { would_use: number; total: number };

    const wouldUseAgainRate = useAgainResult.total > 0 
      ? Math.round((useAgainResult.would_use / useAgainResult.total) * 100)
      : 0;

    // Common issues from comments
    const comments = this.db.query(`
      SELECT comments
      FROM user_feedback
      ${whereClause}
      AND rating <= 3
      AND comments IS NOT NULL
    `).all(...params) as Array<{ comments: string }>;

    const commonIssues = this.extractCommonIssues(comments.map(c => c.comments));

    return {
      averageRating: Math.round(avgResult.avg_rating * 10) / 10,
      byType,
      wouldUseAgainRate,
      commonIssues,
    };
  }

  /**
   * Extract common issues from comments
   */
  private extractCommonIssues(comments: string[]): string[] {
    const issuePatterns: Record<string, string[]> = {
      'Too generic': ['generic', 'vague', 'not specific', 'template'],
      'Missing skills': ['missing skill', 'did not include', 'forgot'],
      'Wrong tone': ['tone', 'too formal', 'too casual', 'not professional'],
      'Too long': ['too long', 'verbose', 'wordy', 'lengthy'],
      'Too short': ['too short', 'brief', 'not enough'],
      'Formatting issues': ['format', 'layout', 'spacing'],
    };

    const issueCounts: Record<string, number> = {};

    for (const comment of comments) {
      const lowerComment = comment.toLowerCase();
      for (const [issue, patterns] of Object.entries(issuePatterns)) {
        if (patterns.some(p => lowerComment.includes(p))) {
          issueCounts[issue] = (issueCounts[issue] || 0) + 1;
        }
      }
    }

    // Return top 5 issues
    return Object.entries(issueCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([issue]) => issue);
  }

  /**
   * Get low-rated feedback for improvement
   */
  getLowRatedFeedback(limit: number = 20): FeedbackRecord[] {
    const records = this.db.query(`
      SELECT * FROM user_feedback 
      WHERE rating <= 3
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit) as Array<{
      id: string;
      job_id: string;
      timestamp: string;
      type: string;
      rating: number;
      comments: string;
      edited_content: string;
      would_use_again: number;
    }>;

    return records.map(r => ({
      id: r.id,
      jobId: r.job_id,
      timestamp: r.timestamp,
      type: r.type as FeedbackRecord['type'],
      rating: r.rating,
      comments: r.comments,
      editedContent: r.edited_content,
      wouldUseAgain: r.would_use_again === 1,
    }));
  }

  /**
   * Get feedback for a specific job
   */
  getJobFeedback(jobId: string): FeedbackRecord[] {
    const records = this.db.query(`
      SELECT * FROM user_feedback WHERE job_id = ? ORDER BY timestamp DESC
    `).all(jobId) as Array<{
      id: string;
      job_id: string;
      timestamp: string;
      type: string;
      rating: number;
      comments: string;
      edited_content: string;
      would_use_again: number;
    }>;

    return records.map(r => ({
      id: r.id,
      jobId: r.job_id,
      timestamp: r.timestamp,
      type: r.type as FeedbackRecord['type'],
      rating: r.rating,
      comments: r.comments,
      editedContent: r.edited_content,
      wouldUseAgain: r.would_use_again === 1,
    }));
  }

  close(): void {
    this.db.close();
  }
}

// Singleton instance
let feedbackCollectorInstance: FeedbackCollector | null = null;

export function getFeedbackCollector(dbPath?: string): FeedbackCollector {
  if (!feedbackCollectorInstance) {
    feedbackCollectorInstance = new FeedbackCollector(dbPath);
  }
  return feedbackCollectorInstance;
}
