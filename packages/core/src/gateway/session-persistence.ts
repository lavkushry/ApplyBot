/**
 * Session Persistence Module
 *
 * Handles persistence of sessions to disk in JSONL format.
 * Implements PRD section 16.4 - Session Persistence.
 */

import { writeFile, readFile, mkdir, appendFile, access, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import type { SessionKey, JobStage } from './types.js';

export interface SessionMetadata {
  id: string;
  key: SessionKey;
  agentId: string;
  createdAt: string;
  updatedAt: string;
  stage: JobStage;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  compactionCount: number;
  contextWindowUsage: number;
  status: string;
}

export interface SessionIndex {
  sessions: Record<string, SessionMetadata>;
  lastPrune: string;
}

export interface TranscriptEntry {
  turn: number;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  ts: string;
  tools?: Array<{
    name: string;
    status: 'success' | 'error';
    error?: string;
  }>;
}

export interface SessionPersistenceConfig {
  basePath: string;
  enableTranscript: boolean;
  enableStateSnapshots: boolean;
  transcriptMaxEntries: number;
  retentionDays?: number;
}

export class SessionPersistence extends EventEmitter {
  private config: SessionPersistenceConfig;
  private sessionsPath: string;
  private indexPath: string;

  constructor(config: Partial<SessionPersistenceConfig> = {}) {
    super();
    this.config = {
      basePath: '~/.applypilot/agents/default/sessions',
      enableTranscript: true,
      enableStateSnapshots: true,
      transcriptMaxEntries: 10000,
      retentionDays: 30,
      ...config,
    };

    // Expand home directory
    this.sessionsPath = this.config.basePath.replace(/^~/, process.env.HOME || process.env.USERPROFILE || '');
    this.indexPath = path.join(this.sessionsPath, 'sessions.json');
  }

  /**
   * Initialize the persistence directory
   */
  async initialize(): Promise<void> {
    if (!existsSync(this.sessionsPath)) {
      await mkdir(this.sessionsPath, { recursive: true });
    }

    // Initialize index if it doesn't exist
    if (!existsSync(this.indexPath)) {
      await this.saveIndex({ sessions: {}, lastPrune: new Date().toISOString() });
    }
  }

  /**
   * Initialize a new session
   */
  async initSession(jobId: string, sessionId: string): Promise<void> {
    await this.initialize();

    this.emit('session:initialized', { jobId, sessionId, timestamp: new Date().toISOString() });
  }

  /**
   * Close a session
   */
  async closeSession(sessionId: string): Promise<void> {
    const index = await this.loadIndex();
    if (index.sessions[sessionId]) {
      index.sessions[sessionId].status = 'closed';
      index.sessions[sessionId].updatedAt = new Date().toISOString();
      await this.saveIndex(index);
    }

    this.emit('session:closed', { sessionId, timestamp: new Date().toISOString() });
  }

  /**
   * Save session metadata to index
   */
  async saveSession(session: {
    id: string;
    key: SessionKey;
    createdAt: Date;
    updatedAt: Date;
    stage: JobStage;
    status: string;
    context: { tokenCount: number };
    metrics: { tokensUsed: number };
  }): Promise<void> {
    const index = await this.loadIndex();

    index.sessions[session.id] = {
      id: session.id,
      key: session.key,
      agentId: 'default',
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      stage: session.stage,
      tokens: {
        input: session.metrics.tokensUsed,
        output: 0,
        total: session.metrics.tokensUsed,
      },
      compactionCount: 0,
      contextWindowUsage: session.context.tokenCount / 8000, // Assuming 8k context
      status: session.status,
    };

    await this.saveIndex(index);
  }

  /**
   * Load session metadata from index
   */
  async loadSessionMetadata(sessionId: string): Promise<SessionMetadata | null> {
    const index = await this.loadIndex();
    return index.sessions[sessionId] || null;
  }

  /**
   * List all sessions from index
   */
  async listSessions(agentId?: string): Promise<SessionMetadata[]> {
    const index = await this.loadIndex();
    const sessions = Object.values(index.sessions);

    if (agentId) {
      return sessions.filter(s => s.agentId === agentId);
    }

    return sessions;
  }

  /**
   * Delete session from index
   */
  async deleteSession(sessionId: string): Promise<void> {
    const index = await this.loadIndex();
    delete index.sessions[sessionId];
    await this.saveIndex(index);

    // Delete transcript file
    const transcriptPath = path.join(this.sessionsPath, `${sessionId}.jsonl`);
    try {
      await access(transcriptPath);
      await unlink(transcriptPath);
    } catch {
      // File doesn't exist
    }

    // Delete state file
    const statePath = path.join(this.sessionsPath, `${sessionId}.state`);
    try {
      await access(statePath);
      await unlink(statePath);
    } catch {
      // File doesn't exist
    }
  }

  /**
   * Append entry to session transcript
   */
  async appendTranscript(sessionId: string, entry: TranscriptEntry): Promise<void> {
    if (!this.config.enableTranscript) return;

    const transcriptPath = path.join(this.sessionsPath, `${sessionId}.jsonl`);
    const line = JSON.stringify(entry) + '\n';
    await appendFile(transcriptPath, line, 'utf-8');

    this.emit('entry:appended', { sessionId, entry, timestamp: new Date().toISOString() });
  }

  /**
   * Alias for appendTranscript (used by session-manager)
   */
  async appendTranscriptEntry(sessionId: string, entry: TranscriptEntry): Promise<void> {
    return this.appendTranscript(sessionId, entry);
  }

  /**
   * Load session transcript
   */
  async loadTranscript(sessionId: string, limit?: number): Promise<TranscriptEntry[]> {
    const transcriptPath = path.join(this.sessionsPath, `${sessionId}.jsonl`);

    try {
      const content = await readFile(transcriptPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());

      const entries = lines.map(line => JSON.parse(line) as TranscriptEntry);

      if (limit && limit > 0) {
        return entries.slice(-limit);
      }

      return entries;
    } catch {
      return [];
    }
  }

  /**
   * Get transcript for an agent and session
   */
  async getTranscript(agentId: string, sessionId: string): Promise<TranscriptEntry[]> {
    return this.loadTranscript(sessionId);
  }

  /**
   * Save session state snapshot
   */
  async saveStateSnapshot(sessionId: string, state: unknown): Promise<void> {
    if (!this.config.enableStateSnapshots) return;

    const statePath = path.join(this.sessionsPath, `${sessionId}.state`);
    await writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');

    this.emit('state:snapshot', { sessionId, timestamp: new Date().toISOString() });
  }

  /**
   * Alias for saveStateSnapshot (used by session-manager)
   */
  async saveStateSnapshotWithCheckpoint(sessionId: string, checkpoint?: string): Promise<void> {
    const state = { checkpoint, timestamp: new Date().toISOString() };
    return this.saveStateSnapshot(sessionId, state);
  }

  /**
   * Load session state snapshot
   */
  async loadStateSnapshot<T>(sessionId: string): Promise<T | null> {
    const statePath = path.join(this.sessionsPath, `${sessionId}.state`);

    try {
      const content = await readFile(statePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  /**
   * Update session state
   */
  async updateState(
    sessionId: string,
    stateUpdate: Record<string, unknown>,
    checkpoint?: string
  ): Promise<void> {
    const currentState = (await this.loadStateSnapshot<Record<string, unknown>>(sessionId)) || {};
    const newState = { ...currentState, ...stateUpdate, checkpoint, updatedAt: new Date().toISOString() };
    await this.saveStateSnapshot(sessionId, newState);
  }

  /**
   * Load the session index
   */
  private async loadIndex(): Promise<SessionIndex> {
    try {
      const content = await readFile(this.indexPath, 'utf-8');
      return JSON.parse(content) as SessionIndex;
    } catch {
      return { sessions: {}, lastPrune: new Date().toISOString() };
    }
  }

  /**
   * Save the session index
   */
  private async saveIndex(index: SessionIndex): Promise<void> {
    await writeFile(this.indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  /**
   * Prune old sessions based on retention policy
   */
  async pruneSessions(retentionDays: number = 30): Promise<number> {
    const index = await this.loadIndex();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let prunedCount = 0;
    const now = new Date();

    for (const [sessionId, metadata] of Object.entries(index.sessions)) {
      const updatedAt = new Date(metadata.updatedAt);

      // Prune if older than retention days and status is closed
      if (updatedAt < cutoffDate && metadata.status === 'closed') {
        delete index.sessions[sessionId];
        prunedCount++;

        // Delete associated files
        await this.deleteSessionFiles(sessionId);
      }
    }

    index.lastPrune = now.toISOString();
    await this.saveIndex(index);

    return prunedCount;
  }

  /**
   * Alias for pruneSessions (used by session-manager)
   */
  async pruneOldSessions(agentId?: string): Promise<number> {
    return this.pruneSessions(this.config.retentionDays);
  }

  /**
   * Delete session files (transcript and state)
   */
  private async deleteSessionFiles(sessionId: string): Promise<void> {
    const transcriptPath = path.join(this.sessionsPath, `${sessionId}.jsonl`);
    const statePath = path.join(this.sessionsPath, `${sessionId}.state`);

    try {
      await access(transcriptPath);
      await unlink(transcriptPath);
    } catch {
      // File doesn't exist
    }

    try {
      await access(statePath);
      await unlink(statePath);
    } catch {
      // File doesn't exist
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    closedSessions: number;
    lastPrune: string;
  }> {
    const index = await this.loadIndex();
    const sessions = Object.values(index.sessions);

    return {
      totalSessions: sessions.length,
      activeSessions: sessions.filter(s => s.status !== 'closed').length,
      closedSessions: sessions.filter(s => s.status === 'closed').length,
      lastPrune: index.lastPrune,
    };
  }
}

// Factory function for creating instances
export function createSessionPersistence(config?: Partial<SessionPersistenceConfig>): SessionPersistence {
  return new SessionPersistence(config);
}

// Singleton instance
let persistenceInstance: SessionPersistence | null = null;

export function getSessionPersistence(config?: Partial<SessionPersistenceConfig>): SessionPersistence {
  if (!persistenceInstance) {
    persistenceInstance = new SessionPersistence(config);
  }
  return persistenceInstance;
}
