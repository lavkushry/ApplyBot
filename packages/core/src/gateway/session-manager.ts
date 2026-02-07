/**
 * Session Manager - OpenClaw-inspired Session Lifecycle Management
 * 
 * Manages session lifecycle with session keys (job:<jobId>:<stage>)
 * Handles creation, retrieval, updates, and cleanup of sessions.
 */

import { EventEmitter } from 'events';
import type {
  Session,
  SessionKey,
  JobStage,
  SessionStatus,
  SessionContext,
  SessionMetrics,
  Checkpoint,
} from './types.js';
import { SessionPersistence, createSessionPersistence, TranscriptEntry } from './session-persistence.js';

export interface SessionManagerConfig {
  maxSessions: number;
  sessionTimeoutMs: number;
  autoCompactionThreshold: number;
  checkpointsEnabled: boolean;
  persistence?: {
    enabled: boolean;
    basePath?: string;
    retentionDays?: number;
  };
}

export class SessionManager extends EventEmitter {
  private sessions = new Map<string, Session>();
  private checkpoints = new Map<string, Checkpoint[]>();
  private config: SessionManagerConfig;
  private persistence?: SessionPersistence;

  constructor(config: Partial<SessionManagerConfig> = {}) {
    super();
    this.config = {
      maxSessions: 100,
      sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
      autoCompactionThreshold: 4000, // tokens
      checkpointsEnabled: true,
      ...config,
    };

    // Initialize persistence if enabled
    if (this.config.persistence?.enabled) {
      this.persistence = createSessionPersistence({
        basePath: this.config.persistence.basePath,
        retentionDays: this.config.persistence.retentionDays,
      });

      // Forward persistence events
      this.persistence.on('session:initialized', (data) => this.emit('persistence:initialized', data));
      this.persistence.on('entry:appended', (data) => this.emit('persistence:entry', data));
      this.persistence.on('state:snapshot', (data) => this.emit('persistence:snapshot', data));
      this.persistence.on('session:closed', (data) => this.emit('persistence:closed', data));
    }
  }

  /**
   * Create a new session with the OpenClaw session key format: job:<jobId>:<stage>
   */
  async createSession(jobId: string, stage: JobStage): Promise<Session> {
    const key: SessionKey = `job:${jobId}:${stage}`;
    const id = this.generateSessionId();

    // Check if session already exists
    const existing = this.findSessionByKey(key);
    if (existing) {
      throw new Error(`Session already exists for key: ${key}`);
    }

    // Enforce max sessions limit
    if (this.sessions.size >= this.config.maxSessions) {
      this.pruneOldestSessions(1);
    }

    const now = new Date();
    const session: Session = {
      id,
      key,
      jobId,
      stage,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      context: {
        memory: [],
        tokenCount: 0,
      },
      metrics: {
        tokensUsed: 0,
        apiCalls: 0,
        toolsExecuted: 0,
      },
    };

    this.sessions.set(id, session);

    // Initialize persistence for this session
    if (this.persistence) {
      await this.persistence.initSession(jobId, id);
    }

    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  /**
   * Find session by its key (job:<jobId>:<stage>)
   */
  findSessionByKey(key: SessionKey): Session | undefined {
    for (const session of this.sessions.values()) {
      if (session.key === key) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Find all sessions for a job
   */
  findSessionsByJobId(jobId: string): Session[] {
    const results: Session[] = [];
    for (const session of this.sessions.values()) {
      if (session.jobId === jobId) {
        results.push(session);
      }
    }
    return results.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  /**
   * Update session status
   */
  updateStatus(id: string, status: SessionStatus): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;

    session.status = status;
    session.updatedAt = new Date();

    if (status === 'running' && !session.metrics.startTime) {
      session.metrics.startTime = new Date();
    }

    if (['completed', 'failed', 'cancelled'].includes(status)) {
      session.metrics.endTime = new Date();
      if (session.metrics.startTime) {
        session.metrics.durationMs = 
          session.metrics.endTime.getTime() - session.metrics.startTime.getTime();
      }
    }

    return session;
  }

  /**
   * Update session context
   */
  updateContext(id: string, contextUpdate: Partial<SessionContext>): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;

    session.context = { ...session.context, ...contextUpdate };
    session.updatedAt = new Date();

    // Auto-compaction check
    if (session.context.tokenCount > this.config.autoCompactionThreshold) {
      this.triggerCompaction(id);
    }

    return session;
  }

  /**
   * Add memory to session
   */
  addMemory(id: string, memory: string): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;

    session.context.memory.push(memory);
    session.updatedAt = new Date();

    // Estimate token count (rough approximation: 1 token ≈ 4 characters)
    session.context.tokenCount += Math.ceil(memory.length / 4);

    return session;
  }

  /**
   * Update session metrics
   */
  updateMetrics(id: string, metricsUpdate: Partial<SessionMetrics>): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;

    session.metrics = { ...session.metrics, ...metricsUpdate };
    session.updatedAt = new Date();

    return session;
  }

  /**
   * Create a checkpoint for rollback capability
   */
  createCheckpoint(
    sessionId: string,
    type: Checkpoint['type'],
    contextSnapshot: SessionContext
  ): Checkpoint | undefined {
    if (!this.config.checkpointsEnabled) return undefined;

    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    const checkpoint: Checkpoint = {
      id: this.generateCheckpointId(),
      sessionId,
      type,
      contextSnapshot: JSON.parse(JSON.stringify(contextSnapshot)), // Deep clone
      createdAt: new Date(),
    };

    const sessionCheckpoints = this.checkpoints.get(sessionId) || [];
    sessionCheckpoints.push(checkpoint);
    
    // Keep only last 10 checkpoints per session
    if (sessionCheckpoints.length > 10) {
      sessionCheckpoints.shift();
    }
    
    this.checkpoints.set(sessionId, sessionCheckpoints);
    return checkpoint;
  }

  /**
   * Get checkpoints for a session
   */
  getCheckpoints(sessionId: string): Checkpoint[] {
    return this.checkpoints.get(sessionId) || [];
  }

  /**
   * Restore session to a checkpoint
   */
  restoreCheckpoint(sessionId: string, checkpointId: string): Session | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    const sessionCheckpoints = this.checkpoints.get(sessionId) || [];
    const checkpoint = sessionCheckpoints.find(cp => cp.id === checkpointId);
    if (!checkpoint) return undefined;

    session.context = JSON.parse(JSON.stringify(checkpoint.contextSnapshot));
    session.updatedAt = new Date();

    return session;
  }

  /**
   * Trigger compaction to reduce context size
   */
  private triggerCompaction(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Create checkpoint before compaction
    this.createCheckpoint(sessionId, 'auto', session.context);

    // Simple compaction: keep only last 20 memories and summarize older ones
    if (session.context.memory.length > 20) {
      const olderMemories = session.context.memory.slice(0, -20);
      const recentMemories = session.context.memory.slice(-20);
      
      // Create summary of older memories (in real implementation, use LLM)
      const summary = `[Compacted ${olderMemories.length} older memories]`;
      
      session.context.memory = [summary, ...recentMemories];
      session.context.tokenCount = session.context.memory.reduce(
        (acc, mem) => acc + Math.ceil(mem.length / 4),
        0
      );
      session.context.lastCompactionAt = new Date();
    }
  }

  /**
   * Delete a session
   */
  async closeSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.status = 'completed';
    session.updatedAt = new Date();

    // Close persistence for this session
    if (this.persistence) {
      await this.persistence.closeSession(sessionId);
    }

    this.checkpoints.delete(sessionId);
    this.sessions.delete(sessionId);
    this.emit('sessionClosed', session);

    return true;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values()).filter(
      s => s.status === 'running' || s.status === 'pending'
    );
  }

  /**
   * Get session statistics
   */
  getStats(): {
    total: number;
    active: number;
    byStatus: Record<SessionStatus, number>;
  } {
    const byStatus: Record<SessionStatus, number> = {
      pending: 0,
      running: 0,
      paused: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const session of this.sessions.values()) {
      byStatus[session.status]++;
    }

    return {
      total: this.sessions.size,
      active: this.getActiveSessions().length,
      byStatus,
    };
  }

  /**
   * Prune old sessions
   */
  private async pruneOldestSessions(count: number): Promise<void> {
    const sorted = Array.from(this.sessions.entries())
      .sort((a, b) => a[1].updatedAt.getTime() - b[1].updatedAt.getTime());

    for (let i = 0; i < Math.min(count, sorted.length); i++) {
      const [id] = sorted[i];
      await this.closeSession(id);
    }
  }

  /**
   * Clean up timed out sessions
   */
  async cleanupTimedOutSessions(): Promise<number> {
    const now = Date.now();
    const timedOut: string[] = [];

    for (const [id, session] of this.sessions.entries()) {
      if (now - session.updatedAt.getTime() > this.config.sessionTimeoutMs) {
        timedOut.push(id);
      }
    }

    for (const id of timedOut) {
      await this.closeSession(id);
    }

    return timedOut.length;
  }

  /**
   * Append entry to session transcript
   */
  async appendTranscriptEntry(
    sessionId: string,
    entry: TranscriptEntry
  ): Promise<void> {
    if (!this.persistence) return;

    await this.persistence.appendTranscriptEntry(sessionId, entry);
  }

  /**
   * Save session state snapshot
   */
  async saveStateSnapshot(
    sessionId: string,
    checkpoint?: string
  ): Promise<void> {
    if (!this.persistence) return;

    await this.persistence.saveStateSnapshotWithCheckpoint(sessionId, checkpoint);
  }

  /**
   * Update session state
   */
  async updateSessionState(
    sessionId: string,
    stateUpdate: Record<string, unknown>,
    checkpoint?: string
  ): Promise<void> {
    if (!this.persistence) return;

    await this.persistence.updateState(sessionId, stateUpdate, checkpoint);
  }

  /**
   * Get session transcript
   */
  async getTranscript(
    agentId: string,
    sessionId: string
  ): Promise<TranscriptEntry[]> {
    if (!this.persistence) return [];

    return this.persistence.getTranscript(agentId, sessionId);
  }

  /**
   * List sessions for an agent
   */
  async listSessions(agentId: string) {
    if (!this.persistence) return [];

    return this.persistence.listSessions(agentId);
  }

  /**
   * Prune old sessions
   */
  async pruneOldSessions(agentId: string): Promise<number> {
    if (!this.persistence) return 0;

    return this.persistence.pruneOldSessions(agentId);
  }

  /**
   * Clear all sessions
   */
  clear(): void {
    this.sessions.clear();
    this.checkpoints.clear();
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateCheckpointId(): string {
    return `cp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
