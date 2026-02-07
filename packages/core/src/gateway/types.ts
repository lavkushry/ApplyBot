/**
 * Gateway Types - OpenClaw-inspired WebSocket Control Plane
 *
 * The Gateway is the single control plane that owns all job processing.
 * It provides a typed API over WebSocket for real-time bidirectional communication.
 */

export type SessionKey = `job:${string}:${JobStage}`;
export type JobStage = 'analyze' | 'match' | 'generate' | 'apply' | 'followup';

export interface Session {
  id: string;
  key: SessionKey;
  jobId: string;
  stage: JobStage;
  status: SessionStatus;
  createdAt: Date;
  updatedAt: Date;
  context: SessionContext;
  metrics: SessionMetrics;
}

export type SessionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface SessionContext {
  jobDescription?: string;
  resumeContent?: string;
  coverLetterDraft?: string;
  applicationData?: Record<string, unknown>;
  memory: string[];
  tokenCount: number;
  lastCompactionAt?: Date;
}

export interface SessionMetrics {
  tokensUsed: number;
  apiCalls: number;
  toolsExecuted: number;
  startTime?: Date;
  endTime?: Date;
  durationMs?: number;
}

export interface GatewayMessage {
  id: string;
  type: MessageType;
  sessionId?: string;
  payload: unknown;
  timestamp: Date;
}

export type MessageType =
  | 'connect'
  | 'disconnect'
  | 'request'
  | 'response'
  | 'event'
  | 'error'
  | 'stream'
  | 'tool_call'
  | 'tool_result'
  | 'status_update'
  | 'checkpoint'
  | 'compact';

export interface GatewayRequest {
  method: RequestMethod;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'STREAM';

export interface GatewayResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export interface GatewayEvent {
  event: string;
  data: unknown;
  sessionId?: string;
}

export interface StreamChunk {
  index: number;
  content: string;
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking';
  toolCall?: ToolCall;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  status: 'success' | 'error';
  result: unknown;
  executionTimeMs: number;
}

export interface Checkpoint {
  id: string;
  sessionId: string;
  type: 'auto' | 'manual' | 'pre_tool' | 'post_tool';
  contextSnapshot: SessionContext;
  createdAt: Date;
}

export interface GatewayConfig {
  port: number;
  host: string;
  bind?: string;
  maxSessions: number;
  sessionTimeoutMs: number;
  heartbeatIntervalMs: number;
  enableCompression: boolean;
  auth: {
    type: 'token' | 'pairing' | 'none';
    token?: string;
  };
  protocol?: {
    maxPayload?: number;
    tickIntervalMs?: number;
    connectTimeoutMs?: number;
  };
}

export interface GatewayStats {
  activeSessions: number;
  totalSessions: number;
  messagesProcessed: number;
  averageResponseTimeMs: number;
  uptimeSeconds: number;
}

export type GatewayEventHandler = (event: GatewayEvent) => void | Promise<void>;
export type GatewayMessageHandler = (message: GatewayMessage) => GatewayResponse | Promise<GatewayResponse>;
