/**
 * Context & Compaction Module - OpenClaw-inspired Context Management
 *
 * Context window management, auto-compaction, and system prompt assembly.
 */

export { ContextManager } from './context-manager.js';

export type {
  ContextWindow,
  ContextMetadata,
  CompactionResult,
  CompactionStrategy,
  CompactionConfig,
  SystemPromptSection,
  SystemPromptConfig,
  SystemPromptAssembly,
  ContextStats,
  MessagePriority,
} from './types.js';

export type { ContextManagerOptions } from './context-manager.js';
