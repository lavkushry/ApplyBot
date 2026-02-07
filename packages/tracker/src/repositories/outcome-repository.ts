import type { DatabaseStub } from '../database-stub.js';
import type { Outcome } from '../types.js';

export class OutcomeRepository {
  constructor(private db: DatabaseStub) {}

  create(outcome: Omit<Outcome, 'outcomeDate'>): Outcome {
    const stmt = this.db.prepare(`
      INSERT INTO outcomes (id, application_id, outcome, feedback, interview_rounds, learned_keywords)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      outcome.id,
      outcome.applicationId,
      outcome.outcome,
      outcome.feedback,
      outcome.interviewRounds,
      outcome.learnedKeywords
    );

    return this.findById(outcome.id)!;
  }

  findById(id: string): Outcome | null {
    const row = this.db.query('SELECT * FROM outcomes WHERE id = ?').get(id) as Record<
      string,
      unknown
    > | null;
    return row ? this.mapRowToOutcome(row) : null;
  }

  findByApplicationId(applicationId: string): Outcome | null {
    const row = this.db
      .query('SELECT * FROM outcomes WHERE application_id = ?')
      .get(applicationId) as Record<string, unknown> | null;
    return row ? this.mapRowToOutcome(row) : null;
  }

  findAll(): Outcome[] {
    const rows = this.db.query('SELECT * FROM outcomes ORDER BY outcome_date DESC').all() as Record<
      string,
      unknown
    >[];
    return rows.map((row) => this.mapRowToOutcome(row));
  }

  getStats(): Record<string, number> {
    const rows = this.db
      .query('SELECT outcome, COUNT(*) as count FROM outcomes GROUP BY outcome')
      .all() as {
      outcome: string;
      count: number;
    }[];

    const stats: Record<string, number> = {
      interview: 0,
      rejected: 0,
      no_reply: 0,
      offer: 0,
      ghosted: 0,
      total: 0,
    };

    for (const row of rows) {
      stats[row.outcome] = row.count;
      stats.total += row.count;
    }

    return stats;
  }

  update(
    id: string,
    updates: Partial<Omit<Outcome, 'id' | 'applicationId' | 'outcomeDate'>>
  ): Outcome | null {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (updates.outcome !== undefined) {
      sets.push('outcome = ?');
      params.push(updates.outcome);
    }
    if (updates.feedback !== undefined) {
      sets.push('feedback = ?');
      params.push(updates.feedback);
    }
    if (updates.interviewRounds !== undefined) {
      sets.push('interview_rounds = ?');
      params.push(updates.interviewRounds);
    }
    if (updates.learnedKeywords !== undefined) {
      sets.push('learned_keywords = ?');
      params.push(updates.learnedKeywords);
    }

    if (sets.length === 0) return this.findById(id);

    params.push(id);
    const sql = `UPDATE outcomes SET ${sets.join(', ')} WHERE id = ?`;
    this.db.run(sql, params);

    return this.findById(id);
  }

  delete(id: string): boolean {
    const result = this.db.run('DELETE FROM outcomes WHERE id = ?', [id]);
    return result.changes > 0;
  }

  private mapRowToOutcome(row: Record<string, unknown>): Outcome {
    return {
      id: row.id as string,
      applicationId: row.application_id as string,
      outcome: row.outcome as 'interview' | 'rejected' | 'no_reply' | 'offer' | 'ghosted',
      outcomeDate: row.outcome_date as string,
      feedback: row.feedback as string | null,
      interviewRounds: row.interview_rounds as number | null,
      learnedKeywords: row.learned_keywords as string | null,
    };
  }
}
