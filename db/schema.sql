-- ApplyPilot Database Schema
-- SQLite with foreign key support

PRAGMA foreign_keys = ON;

-- Jobs table: stores job descriptions and extracted requirements
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

-- Resume builds table: stores tailored resume versions
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

-- Applications table: tracks application status
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

-- Field mappings table: stores per-portal field selectors
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

-- Outcomes table: tracks application outcomes for learning loop
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

-- Profile table: stores user profile (optionally encrypted fields)
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY DEFAULT 'default',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  profile_json TEXT NOT NULL DEFAULT '{}',
  achievements_json TEXT NOT NULL DEFAULT '[]',
  is_encrypted INTEGER DEFAULT 0 CHECK (is_encrypted IN (0, 1))
);

-- Activity log table: audit trail for all operations
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  operation TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT DEFAULT '{}',
  success INTEGER DEFAULT 1 CHECK (success IN (0, 1))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);
CREATE INDEX IF NOT EXISTS idx_jobs_portal ON jobs(portal);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_resume_builds_job_id ON resume_builds(job_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_application_id ON outcomes(application_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);

-- Triggers for updated_at
CREATE TRIGGER IF NOT EXISTS update_jobs_timestamp
AFTER UPDATE ON jobs
BEGIN
  UPDATE jobs SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_applications_timestamp
AFTER UPDATE ON applications
BEGIN
  UPDATE applications SET last_update = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_field_mappings_timestamp
AFTER UPDATE ON field_mappings
BEGIN
  UPDATE field_mappings SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_profiles_timestamp
AFTER UPDATE ON profiles
BEGIN
  UPDATE profiles SET updated_at = datetime('now') WHERE id = NEW.id;
END;
