/**
 * Resume Package - LaTeX-based Resume Tailoring System
 *
 * Provides resume management, LaTeX patching, achievement banking, and PDF compilation.
 */

export { LatexPatcher } from './latex-patcher.js';
export { AchievementBankManager } from './achievement-bank.js';
export { PdfCompiler } from './pdf-compiler.js';
export { ResumeTemplate } from './template.js';
export { LLMResumeTailor } from './llm-tailor.js';
export { CoverLetterGenerator } from './cover-letter.js';
export { AnswersPackGenerator } from './answers-pack.js';

export type {
  Resume,
  ResumeMetadata,
  Achievement,
  AchievementCategory,
  AchievementBank,
  LatexPatch,
  LatexSection,
  ResumeTailoringResult,
  PdfCompilationResult,
  PdfError,
  PdfWarning,
  ResumeVersion,
  VersionChange,
  ResumeDiff,
  DiffSection,
  TailoringConfig,
  ResumeStats,
} from './types.js';

export type { LatexPatcherOptions } from './latex-patcher.js';
export type { AchievementBankOptions } from './achievement-bank.js';
export type { PdfCompilerOptions } from './pdf-compiler.js';
export type { TemplateMarkers, MarkerValidation } from './template.js';
export type { LLMTailorResult } from './llm-tailor.js';
export type { CoverLetterResult } from './cover-letter.js';
export type { AnswersPack } from './answers-pack.js';
