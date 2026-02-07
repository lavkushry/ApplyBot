/**
 * Gateway Module - OpenClaw-inspired WebSocket Control Plane
 *
 * The Gateway is the single control plane that owns all job processing.
 * Provides typed API over WebSocket with session management and real-time streaming.
 */

export { Gateway } from './gateway.js';
export type { GatewayOptions } from './gateway.js';
export { SessionManager } from './session-manager.js';
export type { SessionManagerConfig } from './session-manager.js';
export { GatewayWebSocketServer } from './websocket-server.js';
export type {
  Session,
  SessionKey,
  JobStage,
  SessionStatus,
  SessionContext,
  SessionMetrics,
  GatewayMessage,
  MessageType,
  GatewayRequest,
  RequestMethod,
  GatewayResponse,
  GatewayEvent,
  StreamChunk,
  ToolCall,
  ToolResult,
  Checkpoint,
  GatewayConfig,
  GatewayStats,
  GatewayEventHandler,
  GatewayMessageHandler,
} from './types.js';
export type { WebSocketClient, WebSocketMessage } from './websocket-server.js';
export { SessionPersistence, getSessionPersistence, createSessionPersistence } from './session-persistence.js';
export type {
  SessionMetadata,
  SessionIndex,
  TranscriptEntry,
  SessionPersistenceConfig,
} from './session-persistence.js';
