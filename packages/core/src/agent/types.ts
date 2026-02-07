/**
 * Agent Runtime Types - OpenClaw-inspired Agent Loop
 *
 * The Agent Loop: intake → context assembly → model inference → tool execution → streaming
 */

import type { Session, StreamChunk, ToolCall, ToolResult } from '../gateway/types.js';
import type { LLMMessage, LLMResponse } from '../llm/types.js';

export interface AgentConfig {
  maxIterations: number;
  maxToolCallsPerIteration: number;
  contextWindowSize: number;
  enableStreaming: boolean;
  enableThinking: boolean;
  systemPrompt?: string;
  temperature: number;
  maxTokens: number;
}

export interface AgentContext {
  session: Session;
  messages: LLMMessage[];
  tools: ToolDefinition[];
  memory: string[];
  iteration: number;
  toolCallsThisIteration: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameters;
  handler: ToolHandler;
  requiresApproval?: boolean;
}

export interface ToolParameters {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

export interface ToolParameterProperty {
  type: string;
  description: string;
  enum?: string[];
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

export interface AgentIteration {
  iteration: number;
  input: LLMMessage[];
  response: LLMResponse;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  durationMs: number;
}

export interface AgentResult {
  success: boolean;
  session: Session;
  iterations: AgentIteration[];
  finalOutput: string;
  totalDurationMs: number;
  totalTokensUsed: number;
  error?: string;
}

export interface AgentHooks {
  onIterationStart?: (context: AgentContext) => void | Promise<void>;
  onIterationEnd?: (iteration: AgentIteration) => void | Promise<void>;
  onToolCall?: (toolCall: ToolCall) => void | Promise<void>;
  onToolResult?: (result: ToolResult) => void | Promise<void>;
  onStreamChunk?: (chunk: StreamChunk) => void | Promise<void>;
  onComplete?: (result: AgentResult) => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
}

export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'calling_tools'
  | 'waiting_for_approval'
  | 'streaming'
  | 'completed'
  | 'failed';

export interface AgentState {
  status: AgentStatus;
  currentIteration: number;
  currentSession?: Session;
  lastError?: string;
}

export interface ToolApprovalRequest {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  sessionId: string;
  requestedAt: Date;
}

export interface ToolApprovalResponse {
  approved: boolean;
  reason?: string;
  modifiedArgs?: Record<string, unknown>;
}
