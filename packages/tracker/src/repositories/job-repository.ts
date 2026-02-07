import type { DatabaseStub } from '../database-stub.js';
import type { Job } from '../types.js';

export class JobRepository {
  constructor(private db: DatabaseStub) {}

  create(job: Omit<Job, 'createdAt' | 'updatedAt'>): Job {
    const stmt = this.db.prepare(`
      INSERT INTO jobs (id, source, title, company, portal, url, jd_text, requirements_json, fit_score, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      job.id,
      job.source,
      job.title,
      job.company,
      job.portal,
      job.url,
      job.jdText,
      JSON.stringify(job.requirementsJson),
      job.fitScore,
      job.status
    );

    return this.findById(job.id)!;
  }

  findById(id: string): Job | null {
    const row = this.db.query('SELECT * FROM jobs WHERE id = ?').get(id) as Record<
      string,
      unknown
    > | null;
    return row ? this.mapRowToJob(row) : null;
  }

  findAll(filters?: { status?: string; portal?: string; company?: string }): Job[] {
    let sql = 'SELECT * FROM jobs';
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    if (filters?.portal) {
      conditions.push('portal = ?');
      params.push(filters.portal);
    }
    if (filters?.company) {
      conditions.push('company LIKE ?');
      params.push(`%${filters.company}%`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY created_at DESC';

    const rows = this.db.query(sql).all(...params) as Record<string, unknown>[];
    return rows.map((row) => this.mapRowToJob(row));
  }

  update(id: string, updates: Partial<Omit<Job, 'id' | 'createdAt' | 'updatedAt'>>): Job | null {
    const sets: string[] = [];
    const params: unknown[] = [];

    if (updates.source !== undefined) {
      sets.push('source = ?');
      params.push(updates.source);
    }
    if (updates.title !== undefined) {
      sets.push('title = ?');
      params.push(updates.title);
    }
    if (updates.company !== undefined) {
      sets.push('company = ?');
      params.push(updates.company);
    }
    if (updates.portal !== undefined) {
      sets.push('portal = ?');
      params.push(updates.portal);
    }
    if (updates.url !== undefined) {
      sets.push('url = ?');
      params.push(updates.url);
    }
    if (updates.jdText !== undefined) {
      sets.push('jd_text = ?');
      params.push(updates.jdText);
    }
    if (updates.requirementsJson !== undefined) {
      sets.push('requirements_json = ?');
      params.push(JSON.stringify(updates.requirementsJson));
    }
    if (updates.fitScore !== undefined) {
      sets.push('fit_score = ?');
      params.push(updates.fitScore);
    }
    if (updates.status !== undefined) {
      sets.push('status = ?');
      params.push(updates.status);
    }

    if (sets.length === 0) return this.findById(id);

    params.push(id);
    const sql = `UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`;
    this.db.run(sql, params);

    return this.findById(id);
  }

  delete(id: string): boolean {
    const result = this.db.run('DELETE FROM jobs WHERE id = ?', [id]);
    return result.changes > 0;
  }

  private mapRowToJob(row: Record<string, unknown>): Job {
    return {
      id: row.id as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      source: row.source as 'paste' | 'file' | 'url',
      title: row.title as string | null,
      company: row.company as string | null,
      portal: row.portal as
        | 'linkedin'
        | 'naukri'
        | 'indeed'
        | 'workday'
        | 'greenhouse'
        | 'lever'
        | 'other'
        | null,
      url: row.url as string | null,
      jdText: row.jd_text as string,
      requirementsJson: JSON.parse(row.requirements_json as string),
      fitScore: row.fit_score as number,
      status: row.status as 'new' | 'analyzed' | 'tailored' | 'ready' | 'applied' | 'closed',
    };
  }
}
