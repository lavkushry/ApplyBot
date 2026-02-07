/**
 * Gateway Server - OpenClaw-inspired WebSocket Control Plane
 * 
 * The Gateway is the single control plane that owns all job processing.
 * Provides typed API over WebSocket with session management and real-time streaming.
 */

import { EventEmitter } from 'events';
import type {
  GatewayConfig,
  GatewayMessage,
  GatewayRequest,
  GatewayResponse,
  GatewayEvent,
  GatewayStats,
  StreamChunk,
  GatewayEventHandler,
  GatewayMessageHandler,
  Session,
  JobStage,
} from './types.js';
import { SessionManager } from './session-manager.js';

export interface GatewayOptions {
  config?: Partial<GatewayConfig>;
  sessionManager?: SessionManager;
}

export class Gateway extends EventEmitter {
  private config: GatewayConfig;
  private sessionManager: SessionManager;
  private messageHandlers = new Map<string, GatewayMessageHandler>();
  private eventHandlers = new Map<string, GatewayEventHandler[]>();
  private clients = new Map<string, WebSocket>();
  private stats: GatewayStats;
  private startTime: Date;
  private heartbeatInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(options: GatewayOptions = {}) {
    super();
    
    this.config = {
      port: 8081,
      host: 'localhost',
      maxSessions: 100,
      sessionTimeoutMs: 30 * 60 * 1000,
      heartbeatIntervalMs: 30000,
      enableCompression: true,
      auth: { type: 'none' },
      ...options.config,
    };

    this.sessionManager = options.sessionManager || new SessionManager({
      maxSessions: this.config.maxSessions,
      sessionTimeoutMs: this.config.sessionTimeoutMs,
    });

    this.stats = {
      activeSessions: 0,
      totalSessions: 0,
      messagesProcessed: 0,
      averageResponseTimeMs: 0,
      uptimeSeconds: 0,
    };

    this.startTime = new Date();
    this.setupDefaultHandlers();
  }

  /**
   * Start the Gateway server
   */
  async start(): Promise<void> {
    // Note: In a real implementation, this would create a WebSocket server
    // For now, we simulate the gateway behavior
    
    this.startHeartbeat();
    this.startCleanupTimer();
    
    this.emit('started', { config: this.config });
    console.log(`[Gateway] Started on ${this.config.host}:${this.config.port}`);
  }

  /**
   * Stop the Gateway server
   */
  async stop(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Close all client connections
    for (const [clientId, ws] of this.clients.entries()) {
      ws.close();
      this.clients.delete(clientId);
    }

    this.emit('stopped');
    console.log('[Gateway] Stopped');
  }

  /**
   * Register a message handler for a specific path
   */
  registerHandler(path: string, handler: GatewayMessageHandler): void {
    this.messageHandlers.set(path, handler);
  }

  /**
   * Unregister a message handler
   */
  unregisterHandler(path: string): void {
    this.messageHandlers.delete(path);
  }

  /**
   * Subscribe to gateway events
   */
  onEvent(event: string, handler: GatewayEventHandler): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }

  /**
   * Unsubscribe from gateway events
   */
  offEvent(event: string, handler: GatewayEventHandler): void {
    const handlers = this.eventHandlers.get(event) || [];
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
      this.eventHandlers.set(event, handlers);
    }
  }

  /**
   * Emit a gateway event
   */
  async emitEvent(event: GatewayEvent): Promise<void> {
    const handlers = this.eventHandlers.get(event.event) || [];
    
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error(`[Gateway] Event handler error for ${event.event}:`, error);
      }
    }

    // Broadcast to connected clients
    this.broadcast({
      id: this.generateMessageId(),
      type: 'event',
      sessionId: event.sessionId,
      payload: event,
      timestamp: new Date(),
    });
  }

  /**
   * Process a gateway message
   */
  async processMessage(message: GatewayMessage): Promise<GatewayResponse> {
    const startTime = Date.now();
    
    try {
      this.stats.messagesProcessed++;

      switch (message.type) {
        case 'connect':
          return this.handleConnect(message);
        
        case 'disconnect':
          return this.handleDisconnect(message);
        
        case 'request':
          return this.handleRequest(message);
        
        case 'stream':
          return this.handleStream(message);
        
        default:
          return {
            status: 400,
            body: { error: `Unknown message type: ${message.type}` },
          };
      }
    } finally {
      const duration = Date.now() - startTime;
      this.updateAverageResponseTime(duration);
    }
  }

  /**
   * Create a new job session
   */
  async createSession(jobId: string, stage: JobStage): Promise<Session> {
    const session = await this.sessionManager.createSession(jobId, stage);
    this.stats.totalSessions++;
    this.stats.activeSessions = this.sessionManager.getActiveSessions().length;

    this.emitEvent({
      event: 'session.created',
      data: { sessionId: session.id, key: session.key },
      sessionId: session.id,
    });

    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessionManager.getSession(sessionId);
  }

  /**
   * Update session status
   */
  updateSessionStatus(sessionId: string, status: Session['status']): Session | undefined {
    const session = this.sessionManager.updateStatus(sessionId, status);
    if (session) {
      this.stats.activeSessions = this.sessionManager.getActiveSessions().length;
      
      this.emitEvent({
        event: 'session.status_changed',
        data: { sessionId, status, previousStatus: session.status },
        sessionId,
      });
    }
    return session;
  }

  /**
   * Stream chunks to a session
   */
  async streamChunks(sessionId: string, chunks: StreamChunk[]): Promise<void> {
    for (const chunk of chunks) {
      await this.broadcast({
        id: this.generateMessageId(),
        type: 'stream',
        sessionId,
        payload: chunk,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Get gateway statistics
   */
  getStats(): GatewayStats {
    const now = new Date();
    return {
      ...this.stats,
      activeSessions: this.sessionManager.getActiveSessions().length,
      uptimeSeconds: Math.floor((now.getTime() - this.startTime.getTime()) / 1000),
    };
  }

  /**
   * Get the session manager
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * Get the gateway configuration
   */
  getConfig(): GatewayConfig {
    return { ...this.config };
  }

  // Private handlers

  private handleConnect(message: GatewayMessage): GatewayResponse {
    const clientId = message.payload as string;
    // In real implementation, this would track WebSocket connection
    console.log(`[Gateway] Client connected: ${clientId}`);
    
    return {
      status: 200,
      body: { message: 'Connected', clientId },
    };
  }

  private handleDisconnect(message: GatewayMessage): GatewayResponse {
    const clientId = message.payload as string;
    this.clients.delete(clientId);
    console.log(`[Gateway] Client disconnected: ${clientId}`);
    
    return {
      status: 200,
      body: { message: 'Disconnected' },
    };
  }

  private async handleRequest(message: GatewayMessage): Promise<GatewayResponse> {
    const request = message.payload as GatewayRequest;
    const handler = this.messageHandlers.get(request.path);

    if (!handler) {
      return {
        status: 404,
        body: { error: `No handler for path: ${request.path}` },
      };
    }

    try {
      const response = await handler(message);
      return response;
    } catch (error) {
      console.error(`[Gateway] Handler error for ${request.path}:`, error);
      return {
        status: 500,
        body: { error: 'Internal server error' },
      };
    }
  }

  private async handleStream(message: GatewayMessage): Promise<GatewayResponse> {
    // Stream handling is done via emitEvent
    return {
      status: 200,
      body: { message: 'Stream acknowledged' },
    };
  }

  private setupDefaultHandlers(): void {
    // Health check handler
    this.registerHandler('/health', () => ({
      status: 200,
      body: { status: 'healthy', stats: this.getStats() },
    }));

    // Stats handler
    this.registerHandler('/stats', () => ({
      status: 200,
      body: this.getStats(),
    }));

    // Sessions handler
    this.registerHandler('/sessions', () => ({
      status: 200,
      body: {
        stats: this.sessionManager.getStats(),
        active: this.sessionManager.getActiveSessions().map(s => ({
          id: s.id,
          key: s.key,
          status: s.status,
          stage: s.stage,
        })),
      },
    }));
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.emitEvent({
        event: 'gateway.heartbeat',
        data: { timestamp: new Date(), stats: this.getStats() },
      });
    }, this.config.heartbeatIntervalMs);
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(async () => {
      const cleaned = await this.sessionManager.cleanupTimedOutSessions();
      if (cleaned > 0) {
        console.log(`[Gateway] Cleaned up ${cleaned} timed out sessions`);
        this.stats.activeSessions = this.sessionManager.getActiveSessions().length;
      }
    }, this.config.sessionTimeoutMs / 2);
  }

  private async broadcast(message: GatewayMessage): Promise<void> {
    // In real implementation, this would broadcast to all connected WebSocket clients
    this.emit('message', message);
  }

  private updateAverageResponseTime(durationMs: number): void {
    const total = this.stats.messagesProcessed;
    const current = this.stats.averageResponseTimeMs;
    this.stats.averageResponseTimeMs = 
      (current * (total - 1) + durationMs) / total;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
