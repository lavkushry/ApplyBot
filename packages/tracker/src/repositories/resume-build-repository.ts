import type { DatabaseStub } from '../database-stub.js';
import type { ResumeBuild } from '../types.js';

export class ResumeBuildRepository {
  constructor(private db: DatabaseStub) {}

  create(build: Omit<ResumeBuild, 'createdAt'>): ResumeBuild {
    const stmt = this.db.prepare(`
      INSERT INTO resume_builds
      (id, job_id, base_resume_hash, tailored_tex_path, tailored_pdf_path, changes_json_path, compile_log_path, pdf_sha256, build_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      build.id,
      build.jobId,
      build.baseResumeHash,
      build.tailoredTexPath,
      build.tailoredPdfPath,
      build.changesJsonPath,
      build.compileLogPath,
      build.pdfSha256,
      build.buildStatus
    );

    return this.findById(build.id)!;
  }

  findById(id: string): ResumeBuild | null {
    const row = this.db.query('SELECT * FROM resume_builds WHERE id = ?').get(id) as Record<
      string,
      unknown
    > | null;
    return row ? this.mapRowToBuild(row) : null;
  }

  findByJobId(jobId: string): ResumeBuild[] {
    const rows = this.db
      .query('SELECT * FROM resume_builds WHERE job_id = ? ORDER BY created_at DESC')
      .all(jobId) as Record<string, unknown>[];
    return rows.map((row) => this.mapRowToBuild(row));
  }

  findLatestByJobId(jobId: string): ResumeBuild | null {
    const row = this.db
      .query('SELECT * FROM resume_builds WHERE job_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(jobId) as Record<string, unknown> | null;
    return row ? this.mapRowToBuild(row) : null;
  }

  updateStatus(id: string, status: ResumeBuild['buildStatus']): ResumeBuild | null {
    this.db.run('UPDATE resume_builds SET build_status = ? WHERE id = ?', [status, id]);
    return this.findById(id);
  }

  delete(id: string): boolean {
    const result = this.db.run('DELETE FROM resume_builds WHERE id = ?', [id]);
    return result.changes > 0;
  }

  private mapRowToBuild(row: Record<string, unknown>): ResumeBuild {
    return {
      id: row.id as string,
      jobId: row.job_id as string,
      createdAt: row.created_at as string,
      baseResumeHash: row.base_resume_hash as string,
      tailoredTexPath: row.tailored_tex_path as string,
      tailoredPdfPath: row.tailored_pdf_path as string,
      changesJsonPath: row.changes_json_path as string,
      compileLogPath: row.compile_log_path as string,
      pdfSha256: row.pdf_sha256 as string,
      buildStatus: row.build_status as 'pending' | 'success' | 'failed',
    };
  }
}
