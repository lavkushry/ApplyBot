import Database from './database-stub.js';
import type { DatabaseStub } from './database-stub.js';
import { readFileSync } from 'fs';
import { join } from 'path';

export class DatabaseManager {
  private db: DatabaseStub;
  private static instance: DatabaseManager;

  private constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec('PRAGMA foreign_keys = ON');
    this.initializeSchema();
  }

  static getInstance(dbPath?: string): DatabaseManager {
    if (!DatabaseManager.instance) {
      const path = dbPath || process.env.APPLYPILOT_DB_PATH || './data/tracker.sqlite';
      DatabaseManager.instance = new DatabaseManager(path);
    }
    return DatabaseManager.instance;
  }

  static resetInstance(): void {
    DatabaseManager.instance = undefined as unknown as DatabaseManager;
  }

  private initializeSchema(): void {
    const schemaPath = join(process.cwd(), 'db', 'schema.sql');
    try {
      const schema = readFileSync(schemaPath, 'utf-8');
      this.db.exec(schema);
    } catch (error) {
      console.warn('Could not load schema from file, using embedded schema');
      this.loadEmbeddedSchema();
    }
  }

  private loadEmbeddedSchema(): void {
    const schema = `
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        source TEXT NOT NULL CHECK (source IN ('paste', 'file', 'url')),
        title TEXT,
        company TEXT,
        portal TEXT CHECK (portal IN ('linkedin', 'naukri', 'indeed', 'workday', 'greenhouse', 'lever', 'other')),
        url TEXT,
        jd_text TEXT NOT NULL,
        requirements_json TEXT NOT NULL DEFAULT '{}',
        fit_score REAL DEFAULT 0 CHECK (fit_score >= 0 AND fit_score <= 100),
        status TEXT DEFAULT 'new' CHECK (status IN ('new', 'analyzed', 'tailored', 'ready', 'applied', 'closed'))
      );

      CREATE TABLE IF NOT EXISTS resume_builds (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        base_resume_hash TEXT NOT NULL,
        tailored_tex_path TEXT NOT NULL,
        tailored_pdf_path TEXT NOT NULL,
        changes_json_path TEXT NOT NULL,
        compile_log_path TEXT NOT NULL,
        pdf_sha256 TEXT NOT NULL,
        build_status TEXT NOT NULL DEFAULT 'pending' CHECK (build_status IN ('pending', 'success', 'failed')),
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        resume_build_id TEXT,
        status TEXT NOT NULL DEFAULT 'drafted' CHECK (status IN ('drafted', 'ready', 'submitted', 'interview', 'rejected', 'offer', 'no_reply', 'withdrawn')),
        applied_at TEXT,
        last_update TEXT NOT NULL DEFAULT (datetime('now')),
        notes TEXT,
        follow_up_date TEXT,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (resume_build_id) REFERENCES resume_builds(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS field_mappings (
        id TEXT PRIMARY KEY,
        portal TEXT NOT NULL,
        domain TEXT,
        mapping_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        usage_count INTEGER DEFAULT 0,
        last_used_at TEXT
      );

      CREATE TABLE IF NOT EXISTS outcomes (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('interview', 'rejected', 'no_reply', 'offer', 'ghosted')),
        outcome_date TEXT NOT NULL DEFAULT (datetime('now')),
        feedback TEXT,
        interview_rounds INTEGER,
        learned_keywords TEXT,
        FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY DEFAULT 'default',
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        profile_json TEXT NOT NULL DEFAULT '{}',
        achievements_json TEXT NOT NULL DEFAULT '[]',
        is_encrypted INTEGER DEFAULT 0 CHECK (is_encrypted IN (0, 1))
      );

      CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        operation TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        details_json TEXT DEFAULT '{}',
        success INTEGER DEFAULT 1 CHECK (success IN (0, 1))
      );
    `;
    this.db.exec(schema);
  }

  getDatabase(): DatabaseStub {
    return this.db;
  }

  close(): void {
    this.db.close();
    DatabaseManager.resetInstance();
  }

  // Utility method for transactions
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // Log activity
  logActivity(
    operation: string,
    entityType: string,
    entityId: string | null,
    details: Record<string, unknown> = {},
    success: boolean = true
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO activity_log (operation, entity_type, entity_id, details_json, success)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(operation, entityType, entityId, JSON.stringify(details), success ? 1 : 0);
  }
}
