import type { DatabaseStub } from '../database-stub.js';
import type { Application } from '../types.js';

export class ApplicationRepository {
  constructor(private db: DatabaseStub) {}

  create(app: Omit<Application, 'lastUpdate'>): Application {
    const stmt = this.db.prepare(`
      INSERT INTO applications (id, job_id, resume_build_id, status, applied_at, notes, follow_up_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(app.id, app.jobId, app.resumeBuildId, app.status, app.appliedAt, app.notes, app.followUpDate);

    return this.findById(app.id)!;
  }

  findById(id: string): Application | null {
    const row = this.db.query('SELECT * FROM applications WHERE id = ?').get(id) as Record<
      string,
      unknown
    > | null;
    return row ? this.mapRowToApplication(row) : null;
  }

  findByJobId(jobId: string): Application | null {
    const row = this.db.query('SELECT * FROM applications WHERE job_id = ?').get(jobId) as Record<
      string,
      unknown
    > | null;
    return row ? this.mapRowToApplication(row) : null;
  }

  findAll(filters?: { status?: string }): Application[] {
    let sql = 'SELECT * FROM applications';
    const params: unknown[] = [];

    if (filters?.status) {
      sql += ' WHERE status = ?';
      params.push(filters.status);
    }

    sql += ' ORDER BY last_update DESC';

    const rows = this.db.query(sql).all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.mapRowToApplication(row));
  }

  update(id: string, updates: Partial<Omit<Application, 'id' | 'jobId' | 'lastUpdate'>>): Application | null {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (updates.resumeBuildId !== undefined) {
      sets.push('resume_build_id = ?');
      params.push(updates.resumeBuildId);
    }
    if (updates.status !== undefined) {
      sets.push('status = ?');
      params.push(updates.status);
    }
    if (updates.appliedAt !== undefined) {
      sets.push('applied_at = ?');
      params.push(updates.appliedAt);
    }
    if (updates.notes !== undefined) {
      sets.push('notes = ?');
      params.push(updates.notes);
    }
    if (updates.followUpDate !== undefined) {
      sets.push('follow_up_date = ?');
      params.push(updates.followUpDate);
    }

    if (sets.length === 0) return this.findById(id);

    params.push(id);
    const sql = `UPDATE applications SET ${sets.join(', ')} WHERE id = ?`;
    this.db.run(sql, params);

    return this.findById(id);
  }

  getStats(): Record<string, number> {
    const rows = this.db.query('SELECT status, COUNT(*) as count FROM applications GROUP BY status').all() as {
      status: string;
      count: number;
    }[];

    const stats: Record<string, number> = {
      drafted: 0,
      ready: 0,
      submitted: 0,
      interview: 0,
      rejected: 0,
      offer: 0,
      no_reply: 0,
      withdrawn: 0,
      total: 0,
    };

    for (const row of rows) {
      stats[row.status] = row.count;
      stats.total += row.count;
    }

    return stats;
  }

  delete(id: string): boolean {
    const result = this.db.run('DELETE FROM applications WHERE id = ?', [id]);
    return result.changes > 0;
  }

  private mapRowToApplication(row: Record<string, unknown>): Application {
    return {
      id: row.id as string,
      jobId: row.job_id as string,
      resumeBuildId: row.resume_build_id as string | null,
      status: row.status as
        | 'drafted'
        | 'ready'
        | 'submitted'
        | 'interview'
        | 'rejected'
        | 'offer'
        | 'no_reply'
        | 'withdrawn',
      appliedAt: row.applied_at as string | null,
      lastUpdate: row.last_update as string,
      notes: row.notes as string | null,
      followUpDate: row.follow_up_date as string | null,
    };
  }
}