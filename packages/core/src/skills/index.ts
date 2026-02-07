/**
 * Skills System Module - OpenClaw-inspired AgentSkills-compatible Architecture
 *
 * Skills are discoverable, composable capabilities that agents can use.
 */

export { SkillRegistryImpl } from './skill-registry.js';
export {
  parseJobDescriptionSkill,
  analyzeCompanySkill,
  calculateMatchScoreSkill,
} from './built-in/job-analysis.js';

export type {
  Skill,
  SkillCategory,
  SkillParameter,
  ParameterValidation,
  SkillReturn,
  SkillExample,
  SkillHandler,
  SkillContext,
  SkillResult,
  SkillError,
  SkillExecutionMetadata,
  SkillMetadata,
  SkillManifest,
  SkillDefinition,
  SkillSearchOptions,
  SkillRegistry,
} from './types.js';

export type { SkillRegistryConfig } from './skill-registry.js';
