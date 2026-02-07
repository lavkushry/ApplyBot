/**
 * Context Manager - OpenClaw-inspired Context Management
 *
 * Manages context windows, auto-compaction, and system prompt assembly.
 */

import type { LLMMessage } from '../llm/types.js';
import type {
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

export interface ContextManagerOptions {
  config?: Partial<CompactionConfig>;
}

export class ContextManager {
  private config: CompactionConfig;
  private windows = new Map<string, ContextWindow>();
  private systemPromptConfig: SystemPromptConfig;
  private compactionEvents = 0;

  constructor(options: ContextManagerOptions = {}) {
    this.config = {
      maxTokens: 8000,
      warningThreshold: 6000,
      criticalThreshold: 7500,
      strategy: 'hybrid',
      preserveRecentMessages: 4,
      enableAutoCompaction: true,
      ...options.config,
    };

    this.systemPromptConfig = {
      sections: [],
      maxTokens: 2000,
      dynamicVariables: {},
    };
  }

  /**
   * Create a new context window
   */
  createWindow(sessionId: string, maxTokens?: number): ContextWindow {
    const window: ContextWindow = {
      id: this.generateId('ctx'),
      sessionId,
      messages: [],
      tokenCount: 0,
      maxTokens: maxTokens || this.config.maxTokens,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        source: 'user',
        priority: 1,
        compressible: true,
      },
    };

    this.windows.set(window.id, window);
    return window;
  }

  /**
   * Get a context window by ID
   */
  getWindow(windowId: string): ContextWindow | undefined {
    return this.windows.get(windowId);
  }

  /**
   * Get window by session ID
   */
  getWindowBySession(sessionId: string): ContextWindow | undefined {
    for (const window of this.windows.values()) {
      if (window.sessionId === sessionId) {
        return window;
      }
    }
    return undefined;
  }

  /**
   * Add messages to a context window
   */
  addMessages(windowId: string, messages: LLMMessage[]): ContextWindow | null {
    const window = this.windows.get(windowId);
    if (!window) return null;

    for (const message of messages) {
      window.messages.push(message);
      window.tokenCount += this.estimateTokens(message.content);
    }

    window.updatedAt = new Date();

    // Auto-compaction check
    if (this.config.enableAutoCompaction && window.tokenCount > this.config.warningThreshold) {
      this.compact(windowId);
    }

    return window;
  }

  /**
   * Compact a context window to reduce token count
   */
  compact(windowId: string, strategy?: CompactionStrategy): CompactionResult | null {
    const window = this.windows.get(windowId);
    if (!window) return null;

    const originalTokens = window.tokenCount;
    const useStrategy = strategy || this.config.strategy;

    let result: CompactionResult;

    switch (useStrategy) {
      case 'summarize':
        result = this.compactBySummarizing(window);
        break;
      case 'truncate':
        result = this.compactByTruncating(window);
        break;
      case 'remove_oldest':
        result = this.compactByRemovingOldest(window);
        break;
      case 'compress':
        result = this.compactByCompressing(window);
        break;
      case 'hybrid':
      default:
        result = this.compactHybrid(window);
        break;
    }

    this.compactionEvents++;
    window.updatedAt = new Date();

    return result;
  }

  /**
   * Assemble system prompt from sections
   */
  assembleSystemPrompt(context?: Record<string, unknown>): SystemPromptAssembly {
    const sections: string[] = [];
    let tokenCount = 0;
    let truncated = false;

    // Sort sections by priority (highest first)
    const sortedSections = [...this.systemPromptConfig.sections].sort(
      (a, b) => b.priority - a.priority
    );

    for (const section of sortedSections) {
      // Check condition if present
      if (section.condition && !section.condition(context)) {
        continue;
      }

      // Check if adding this section would exceed limit
      if (tokenCount + section.tokens > this.systemPromptConfig.maxTokens) {
        truncated = true;
        break;
      }

      // Replace dynamic variables
      let content = section.content;
      for (const [key, value] of Object.entries(this.systemPromptConfig.dynamicVariables)) {
        content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }

      sections.push(content);
      tokenCount += section.tokens;
    }

    return {
      prompt: sections.join('\n\n'),
      sections,
      tokenCount,
      truncated,
    };
  }

  /**
   * Configure system prompt sections
   */
  configureSystemPrompt(config: Partial<SystemPromptConfig>): void {
    this.systemPromptConfig = {
      ...this.systemPromptConfig,
      ...config,
    };
  }

  /**
   * Add a system prompt section
   */
  addSystemPromptSection(section: SystemPromptSection): void {
    this.systemPromptConfig.sections.push(section);
  }

  /**
   * Remove a system prompt section
   */
  removeSystemPromptSection(sectionId: string): boolean {
    const index = this.systemPromptConfig.sections.findIndex((s) => s.id === sectionId);
    if (index === -1) return false;
    this.systemPromptConfig.sections.splice(index, 1);
    return true;
  }

  /**
   * Calculate message priorities
   */
  calculatePriorities(windowId: string): MessagePriority[] {
    const window = this.windows.get(windowId);
    if (!window) return [];

    const priorities: MessagePriority[] = [];

    for (let i = 0; i < window.messages.length; i++) {
      const message = window.messages[i];
      let priority = 50; // Base priority

      // Recent messages have higher priority
      if (i >= window.messages.length - this.config.preserveRecentMessages) {
        priority += 30;
      }

      // System messages have higher priority
      if (message.role === 'system') {
        priority += 20;
      }

      // User messages have higher priority than assistant
      if (message.role === 'user') {
        priority += 10;
      }

      // Longer messages might be more important
      if (message.content.length > 500) {
        priority += 5;
      }

      priorities.push({
        messageId: `${windowId}_${i}`,
        priority,
        reason: this.getPriorityReason(priority),
      });
    }

    return priorities;
  }

  /**
   * Get context statistics
   */
  getStats(): ContextStats {
    const windows = Array.from(this.windows.values());
    const totalTokens = windows.reduce((sum, w) => sum + w.tokenCount, 0);

    return {
      totalWindows: windows.length,
      totalTokens,
      compactionEvents: this.compactionEvents,
      averageWindowSize: windows.length > 0 ? totalTokens / windows.length : 0,
      largestWindow: windows.length > 0 ? Math.max(...windows.map((w) => w.tokenCount)) : 0,
    };
  }

  /**
   * Clear all context windows
   */
  clear(): void {
    this.windows.clear();
    this.compactionEvents = 0;
  }

  // Private methods

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private estimateTokens(content: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(content.length / 4);
  }

  private compactBySummarizing(window: ContextWindow): CompactionResult {
    const originalTokens = window.tokenCount;
    const messagesToSummarize = window.messages.slice(0, -this.config.preserveRecentMessages);

    if (messagesToSummarize.length === 0) {
      return {
        originalTokens,
        compactedTokens: originalTokens,
        removedMessages: 0,
        summaryAdded: false,
        strategy: 'summarize',
      };
    }

    // Create summary (simplified - in production, use LLM)
    const summary = `[Summary of ${messagesToSummarize.length} earlier messages]`;
    const summaryTokens = this.estimateTokens(summary);

    // Replace old messages with summary
    window.messages = [
      { role: 'system', content: summary },
      ...window.messages.slice(-this.config.preserveRecentMessages),
    ];

    window.tokenCount = window.messages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);

    return {
      originalTokens,
      compactedTokens: window.tokenCount,
      removedMessages: messagesToSummarize.length,
      summaryAdded: true,
      strategy: 'summarize',
    };
  }

  private compactByTruncating(window: ContextWindow): CompactionResult {
    const originalTokens = window.tokenCount;
    const targetTokens = this.config.maxTokens * 0.8;

    let currentTokens = 0;
    const preservedMessages: LLMMessage[] = [];

    // Keep messages from the end until we reach target
    for (let i = window.messages.length - 1; i >= 0; i--) {
      const message = window.messages[i];
      const messageTokens = this.estimateTokens(message.content);

      if (currentTokens + messageTokens > targetTokens && preservedMessages.length > 0) {
        break;
      }

      preservedMessages.unshift(message);
      currentTokens += messageTokens;
    }

    const removedCount = window.messages.length - preservedMessages.length;
    window.messages = preservedMessages;
    window.tokenCount = currentTokens;

    return {
      originalTokens,
      compactedTokens: window.tokenCount,
      removedMessages: removedCount,
      summaryAdded: false,
      strategy: 'truncate',
    };
  }

  private compactByRemovingOldest(window: ContextWindow): CompactionResult {
    const originalTokens = window.tokenCount;
    const messagesToRemove = Math.max(
      0,
      window.messages.length - this.config.preserveRecentMessages * 2
    );

    const removedMessages = window.messages.splice(0, messagesToRemove);
    window.tokenCount = window.messages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);

    return {
      originalTokens,
      compactedTokens: window.tokenCount,
      removedMessages: removedMessages.length,
      summaryAdded: false,
      strategy: 'remove_oldest',
    };
  }

  private compactByCompressing(window: ContextWindow): CompactionResult {
    // Simplified compression - remove redundant whitespace and formatting
    const originalTokens = window.tokenCount;

    for (const message of window.messages) {
      message.content = message.content
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();
    }

    window.tokenCount = window.messages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);

    return {
      originalTokens,
      compactedTokens: window.tokenCount,
      removedMessages: 0,
      summaryAdded: false,
      strategy: 'compress',
    };
  }

  private compactHybrid(window: ContextWindow): CompactionResult {
    // Try compression first
    let result = this.compactByCompressing(window);

    // If still over threshold, remove oldest
    if (window.tokenCount > this.config.criticalThreshold) {
      result = this.compactByRemovingOldest(window);
    }

    // If still over threshold, summarize
    if (window.tokenCount > this.config.criticalThreshold) {
      result = this.compactBySummarizing(window);
    }

    result.strategy = 'hybrid';
    return result;
  }

  private getPriorityReason(priority: number): string {
    if (priority >= 90) return 'Critical: System + Recent';
    if (priority >= 80) return 'High: Recent message';
    if (priority >= 70) return 'High: System message';
    if (priority >= 60) return 'Medium: User message';
    if (priority >= 55) return 'Medium: Long content';
    return 'Standard priority';
  }
}
