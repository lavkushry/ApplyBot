/**
 * WebSocket Server Implementation
 * Real WebSocket server for Gateway control plane on port 18789
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server } from 'http';
import { EventEmitter } from 'events';
import type { GatewayConfig } from './types.js';

export interface WebSocketClient {
  id: string;
  socket: WebSocket;
  connectedAt: Date;
  lastActivity: Date;
  authenticated: boolean;
  metadata: Record<string, unknown>;
}

export interface WebSocketMessage {
  type: 'req' | 'res' | 'event' | 'ping' | 'pong';
  id?: string;
  method?: string;
  params?: Record<string, unknown>;
  payload?: unknown;
  ok?: boolean;
  error?: {
    code: string;
    message: string;
  };
}

export class GatewayWebSocketServer extends EventEmitter {
  private httpServer: Server | null = null;
  private wsServer: WebSocketServer | null = null;
  private clients = new Map<string, WebSocketClient>();
  private config: GatewayConfig;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(config: GatewayConfig) {
    super();
    this.config = config;
  }

  /**
   * Start the WebSocket server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create HTTP server
        this.httpServer = createServer((req, res) => {
          // Handle health check endpoint
          if (req.url === '/health' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                status: 'healthy',
                uptime: process.uptime(),
                clients: this.clients.size,
              })
            );
            return;
          }

          // Default response
          res.writeHead(404);
          res.end('Not Found');
        });

        // Create WebSocket server
        this.wsServer = new WebSocketServer({
          server: this.httpServer,
          path: '/ws',
          maxPayload: this.config.protocol?.maxPayload || 10 * 1024 * 1024, // 10MB
        });

        // Handle connections
        this.wsServer.on('connection', (socket, req) => {
          this.handleConnection(socket, req);
        });

        this.wsServer.on('error', (error) => {
          this.emit('error', error);
        });

        // Start listening
        const port = this.config.port || 18789;
        const host = this.config.bind || '127.0.0.1';

        this.httpServer.listen(port, host, () => {
          console.log(`[Gateway] WebSocket server listening on ${host}:${port}`);
          this.startHeartbeat();
          resolve();
        });

        this.httpServer.on('error', (error) => {
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the WebSocket server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      // Stop heartbeat
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      // Close all client connections
      for (const client of this.clients.values()) {
        client.socket.close(1000, 'Server shutting down');
      }
      this.clients.clear();

      // Close WebSocket server
      if (this.wsServer) {
        this.wsServer.close(() => {
          // Close HTTP server
          if (this.httpServer) {
            this.httpServer.close(() => {
              console.log('[Gateway] WebSocket server stopped');
              resolve();
            });
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(socket: WebSocket, req: import('http').IncomingMessage): void {
    const clientId = this.generateClientId();
    const client: WebSocketClient = {
      id: clientId,
      socket,
      connectedAt: new Date(),
      lastActivity: new Date(),
      authenticated: false,
      metadata: {
        ip: req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      },
    };

    this.clients.set(clientId, client);
    console.log(`[Gateway] Client connected: ${clientId}`);

    // Send welcome message
    this.sendMessage(client, {
      type: 'event',
      payload: {
        event: 'connected',
        clientId,
        serverTime: new Date().toISOString(),
      },
    });

    // Handle messages
    socket.on('message', (data) => {
      this.handleMessage(client, data);
    });

    // Handle close
    socket.on('close', (code, reason) => {
      console.log(`[Gateway] Client disconnected: ${clientId} (code: ${code}, reason: ${reason})`);
      this.clients.delete(clientId);
      this.emit('clientDisconnected', clientId, code, reason);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`[Gateway] Client error (${clientId}):`, error);
      this.emit('clientError', clientId, error);
    });

    // Emit connection event
    this.emit('clientConnected', client);
  }

  /**
   * Handle incoming message
   */
  private handleMessage(client: WebSocketClient, data: import('ws').RawData): void {
    try {
      client.lastActivity = new Date();

      const message = JSON.parse(data.toString()) as WebSocketMessage;

      // Validate message
      if (!message.type) {
        this.sendError(client, 'invalid_message', 'Message must have a type');
        return;
      }

      // Handle ping
      if (message.type === 'ping') {
        this.sendMessage(client, { type: 'pong' });
        return;
      }

      // Check authentication for non-connect requests
      if (message.type === 'req' && message.method !== 'connect' && !client.authenticated) {
        this.sendError(client, 'unauthorized', 'Authentication required', message.id);
        return;
      }

      // Emit message for processing
      this.emit('message', client, message);
    } catch (error) {
      console.error('[Gateway] Failed to parse message:', error);
      this.sendError(client, 'parse_error', 'Invalid JSON format');
    }
  }

  /**
   * Send message to client
   */
  sendMessage(client: WebSocketClient, message: WebSocketMessage): void {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(JSON.stringify(message));
    }
  }

  /**
   * Send error response
   */
  sendError(client: WebSocketClient, code: string, message: string, id?: string): void {
    this.sendMessage(client, {
      type: 'res',
      id,
      ok: false,
      error: { code, message },
    });
  }

  /**
   * Send success response
   */
  sendResponse(client: WebSocketClient, id: string, payload: unknown): void {
    this.sendMessage(client, {
      type: 'res',
      id,
      ok: true,
      payload,
    });
  }

  /**
   * Broadcast event to all clients
   */
  broadcast(event: string, payload: unknown): void {
    const message: WebSocketMessage = {
      type: 'event',
      payload: { event, data: payload },
    };

    for (const client of this.clients.values()) {
      this.sendMessage(client, message);
    }
  }

  /**
   * Authenticate client
   */
  authenticateClient(clientId: string, metadata?: Record<string, unknown>): boolean {
    const client = this.clients.get(clientId);
    if (client) {
      client.authenticated = true;
      if (metadata) {
        client.metadata = { ...client.metadata, ...metadata };
      }
      return true;
    }
    return false;
  }

  /**
   * Get client by ID
   */
  getClient(clientId: string): WebSocketClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Get all connected clients
   */
  getClients(): WebSocketClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * Disconnect client
   */
  disconnectClient(clientId: string, code?: number, reason?: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.socket.close(code || 1000, reason || 'Disconnected by server');
      this.clients.delete(clientId);
    }
  }

  /**
   * Start heartbeat interval
   */
  private startHeartbeat(): void {
    const interval = this.config.protocol?.tickIntervalMs || 30000;
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      const timeout = this.config.protocol?.connectTimeoutMs || 10000;

      for (const client of this.clients.values()) {
        const inactive = now.getTime() - client.lastActivity.getTime();
        if (inactive > timeout * 3) {
          console.log(`[Gateway] Client timeout: ${client.id}`);
          client.socket.close(1001, 'Timeout');
          this.clients.delete(client.id);
        }
      }
    }, interval);
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get server statistics
   */
  getStats(): {
    clients: number;
    authenticated: number;
    uptime: number;
  } {
    const clientList = Array.from(this.clients.values());
    return {
      clients: clientList.length,
      authenticated: clientList.filter((c) => c.authenticated).length,
      uptime: process.uptime(),
    };
  }
}
