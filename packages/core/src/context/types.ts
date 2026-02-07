/**
 * Context & Compaction Types - OpenClaw-inspired Context Management
 *
 * Context window management, auto-compaction, and system prompt assembly.
 */

import type { LLMMessage } from '../llm/types.js';

export interface ContextWindow {
  id: string;
  sessionId: string;
  messages: LLMMessage[];
  tokenCount: number;
  maxTokens: number;
  createdAt: Date;
  updatedAt: Date;
  metadata: ContextMetadata;
}

export interface ContextMetadata {
  source: string;
  priority: number;
  compressible: boolean;
  summary?: string;
}

export interface CompactionResult {
  originalTokens: number;
  compactedTokens: number;
  removedMessages: number;
  summaryAdded: boolean;
  strategy: CompactionStrategy;
}

export type CompactionStrategy =
  | 'summarize'
  | 'truncate'
  | 'remove_oldest'
  | 'compress'
  | 'hybrid';

export interface CompactionConfig {
  maxTokens: number;
  warningThreshold: number;
  criticalThreshold: number;
  strategy: CompactionStrategy;
  preserveRecentMessages: number;
  enableAutoCompaction: boolean;
}

export interface SystemPromptSection {
  id: string;
  name: string;
  content: string;
  priority: number;
  condition?: (context: unknown) => boolean;
  tokens: number;
}

export interface SystemPromptConfig {
  sections: SystemPromptSection[];
  maxTokens: number;
  dynamicVariables: Record<string, string>;
}

export interface SystemPromptAssembly {
  prompt: string;
  sections: string[];
  tokenCount: number;
  truncated: boolean;
}

export interface ContextStats {
  totalWindows: number;
  totalTokens: number;
  compactionEvents: number;
  averageWindowSize: number;
  largestWindow: number;
}

export interface MessagePriority {
  messageId: string;
  priority: number;
  reason: string;
}
