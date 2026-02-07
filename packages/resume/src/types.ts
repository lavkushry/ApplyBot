/**
 * Resume Types - LaTeX-based Resume Tailoring System
 *
 * Types for resume management, LaTeX patching, and PDF compilation.
 */

export interface Resume {
  id: string;
  name: string;
  basePath: string;
  latexPath: string;
  pdfPath?: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  metadata: ResumeMetadata;
}

export interface ResumeMetadata {
  targetRole?: string;
  targetCompany?: string;
  jobId?: string;
  tailoringScore?: number;
  keywordsMatched: string[];
  keywordsAdded: string[];
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  impact: string;
  metrics: string[];
  skills: string[];
  category: AchievementCategory;
  date: Date;
  priority: number;
}

export type AchievementCategory =
  | 'technical'
  | 'leadership'
  | 'project'
  | 'award'
  | 'publication'
  | 'certification';

export interface AchievementBank {
  achievements: Achievement[];
  categories: Record<AchievementCategory, string[]>;
  lastUpdated: Date;
}

export interface LatexPatch {
  id: string;
  marker: string;
  originalContent: string;
  newContent: string;
  reason: string;
  section: string;
}

export interface LatexSection {
  name: string;
  marker: string;
  content: string;
  patches: LatexPatch[];
}

export interface ResumeTailoringResult {
  resume: Resume;
  patches: LatexPatch[];
  keywordsAdded: string[];
  keywordsRemoved: string[];
  tailoringScore: number;
  diff: string;
}

export interface PdfCompilationResult {
  success: boolean;
  pdfPath?: string;
  logPath?: string;
  errors: PdfError[];
  warnings: PdfWarning[];
  compilationTimeMs: number;
}

export interface PdfError {
  line?: number;
  message: string;
  context?: string;
}

export interface PdfWarning {
  line?: number;
  message: string;
  context?: string;
}

export interface ResumeVersion {
  id: string;
  resumeId: string;
  version: number;
  latexContent: string;
  pdfPath?: string;
  jobId?: string;
  company?: string;
  role?: string;
  createdAt: Date;
  changes: VersionChange[];
}

export interface VersionChange {
  type: 'add' | 'remove' | 'modify';
  section: string;
  description: string;
}

export interface ResumeDiff {
  fromVersion: number;
  toVersion: number;
  sections: DiffSection[];
}

export interface DiffSection {
  name: string;
  changes: {
    type: 'added' | 'removed' | 'modified';
    oldContent?: string;
    newContent?: string;
    lineNumber?: number;
  }[];
}

export interface TailoringConfig {
  preserveFormatting: boolean;
  maxKeywordsToAdd: number;
  minKeywordDensity: number;
  sectionsToTailor: string[];
  achievementSelectionStrategy: 'relevance' | 'recency' | 'impact';
}

export interface ResumeStats {
  totalResumes: number;
  totalVersions: number;
  totalAchievements: number;
  averageTailoringScore: number;
  successfulCompilations: number;
  failedCompilations: number;
}
