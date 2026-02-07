/**
 * Agent Runtime - OpenClaw-inspired Agent Loop Implementation
 *
 * The Agent Loop: intake → context assembly → model inference → tool execution → streaming
 */

import { EventEmitter } from 'events';
import { SessionManager } from '../gateway/session-manager.js';
import type { Session, StreamChunk, ToolCall, ToolResult } from '../gateway/types.js';
import { LLMAdapter } from '../llm/adapter.js';
import type { LLMMessage, LLMRequest } from '../llm/types.js';
import type {
    AgentConfig,
    AgentContext,
    AgentHooks,
    AgentIteration,
    AgentResult,
    AgentState,
    ToolApprovalRequest,
    ToolApprovalResponse,
    ToolDefinition,
} from './types.js';
import { createCircuitBreaker, CircuitBreaker } from '../resilience/circuit-breaker.js';
import { getRetryPolicy, RetryPolicy } from '../resilience/retry-policy.js';
import { getDeadLetterQueue } from '../resilience/dead-letter-queue.js';
import { getMetricsCollector, TechnicalMetrics } from '../observability/metrics.js';

export interface AgentRuntimeOptions {
  llmAdapter: LLMAdapter;
  sessionManager: SessionManager;
  config?: Partial<AgentConfig>;
  hooks?: AgentHooks;
}

export class AgentRuntime extends EventEmitter {
  private llmAdapter: LLMAdapter;
  private sessionManager: SessionManager;
  private config: AgentConfig;
  private hooks: AgentHooks;
  private tools = new Map<string, ToolDefinition>();
  private state: AgentState;
  private pendingApprovals = new Map<string, ToolApprovalRequest>();
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private retryPolicies = new Map<string, RetryPolicy>();
  private metrics = getMetricsCollector();
  private dlq = getDeadLetterQueue();

  constructor(options: AgentRuntimeOptions) {
    super();

    this.llmAdapter = options.llmAdapter;
    this.sessionManager = options.sessionManager;

    this.config = {
      maxIterations: 10,
      maxToolCallsPerIteration: 5,
      contextWindowSize: 8000,
      enableStreaming: true,
      enableThinking: true,
      temperature: 0.7,
      maxTokens: 4000,
      ...options.config,
    };

    this.hooks = options.hooks || {};

    this.state = {
      status: 'idle',
      currentIteration: 0,
    };

    this.initializeResilience();
    this.registerDefaultTools();
  }

  /**
   * Initialize circuit breakers and retry policies for tools
   */
  private initializeResilience(): void {
    // Initialize circuit breakers for critical tools
    const criticalTools = ['analyze_jd', 'tailor_resume', 'compile_pdf', 'portal_autofill'];
    for (const tool of criticalTools) {
      this.circuitBreakers.set(
        tool,
        createCircuitBreaker(tool, {
          failureThreshold: 5,
          successThreshold: 2,
          openTimeout: 60000,
        })
      );
    }

    // Initialize retry policies
    this.retryPolicies.set('llm', getRetryPolicy('llm'));
    this.retryPolicies.set('network', getRetryPolicy('network'));
    this.retryPolicies.set('portal', getRetryPolicy('portal'));
    this.retryPolicies.set('pdf', getRetryPolicy('pdf'));
  }

  /**
   * Register a tool for the agent to use
   */
  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool
   */
  unregisterTool(name: string): void {
    this.tools.delete(name);
  }

  /**
   * Get all registered tools
   */
  getTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Execute the agent loop for a session
   *
   * The Agent Loop:
   * 1. Intake - Receive user input and session context
   * 2. Context Assembly - Build messages with memory and tools
   * 3. Model Inference - Call LLM with assembled context
   * 4. Tool Execution - Execute any tool calls from the model
   * 5. Streaming - Stream results back to the client
   */
  async execute(
    sessionId: string,
    userInput: string,
    options: { streaming?: boolean } = {}
  ): Promise<AgentResult> {
    const startTime = Date.now();
    const session = this.sessionManager.getSession(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    this.state = {
      status: 'thinking',
      currentIteration: 0,
      currentSession: session,
    };

    this.emit('status_changed', this.state);

    const iterations: AgentIteration[] = [];
    let totalTokensUsed = 0;

    try {
      // Update session status
      this.sessionManager.updateStatus(sessionId, 'running');

      // Add user input to session memory
      this.sessionManager.addMemory(sessionId, `User: ${userInput}`);

      // Agent Loop
      for (let iteration = 1; iteration <= this.config.maxIterations; iteration++) {
        this.state.currentIteration = iteration;
        this.emit('iteration_start', { iteration, sessionId });

        const iterationStartTime = Date.now();

        // 1. Context Assembly
        const context = this.assembleContext(session, userInput);

        if (this.hooks.onIterationStart) {
          await this.hooks.onIterationStart(context);
        }

        // 2. Model Inference
        this.state.status = 'thinking';
        this.emit('status_changed', this.state);

        const request: LLMRequest = {
          messages: context.messages,
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens,
        };

        // Execute LLM call with retry policy
        const llmRetryPolicy = this.retryPolicies.get('llm');
        let response;

        if (llmRetryPolicy) {
          const llmStartTime = Date.now();
          const retryResult = await llmRetryPolicy.execute(async () => {
            return await this.llmAdapter.complete(request);
          }, { operation: 'llm_completion' });

          if (retryResult.success && retryResult.result) {
            response = retryResult.result;
          } else {
            throw new Error(retryResult.error?.message || 'LLM call failed after retries');
          }

          // Record LLM metrics
          this.metrics.record('operation_latency_ms', Date.now() - llmStartTime, {
            operation: 'llm_completion',
            tool: 'llm',
            status: 'success',
          });
        } else {
          response = await this.llmAdapter.complete(request);
        }

        totalTokensUsed += response.usage?.totalTokens || 0;
        this.sessionManager.updateMetrics(sessionId, {
          tokensUsed: totalTokensUsed,
          apiCalls: iteration,
        });

        // Stream thinking if enabled
        if (options.streaming !== false && this.config.enableStreaming) {
          await this.streamThinking(response.content);
        }

        // 3. Tool Execution
        const toolCalls = this.extractToolCalls(response);
        const toolResults: ToolResult[] = [];

        if (toolCalls.length > 0) {
          this.state.status = 'calling_tools';
          this.emit('status_changed', this.state);

          for (const toolCall of toolCalls) {
            // Check for approval if required
            const tool = this.tools.get(toolCall.name);
            if (tool?.requiresApproval) {
              const approved = await this.requestApproval(sessionId, toolCall);
              if (!approved) {
                toolResults.push({
                  toolCallId: toolCall.id,
                  status: 'error',
                  result: { error: 'Tool execution was not approved' },
                  executionTimeMs: 0,
                });
                continue;
              }
            }

            if (this.hooks.onToolCall) {
              await this.hooks.onToolCall(toolCall);
            }

            const toolStartTime = Date.now();
            const result = await this.executeTool(toolCall);
            result.executionTimeMs = Date.now() - toolStartTime;

            toolResults.push(result);

            if (this.hooks.onToolResult) {
              await this.hooks.onToolResult(result);
            }

            // Stream tool result
            if (options.streaming !== false && this.config.enableStreaming) {
              await this.streamToolResult(toolCall, result);
            }

            this.sessionManager.updateMetrics(sessionId, {
              toolsExecuted: (session.metrics.toolsExecuted || 0) + 1,
            });
          }
        }

        // 4. Record iteration
        const iterationData: AgentIteration = {
          iteration,
          input: context.messages,
          response,
          toolCalls,
          toolResults,
          durationMs: Date.now() - iterationStartTime,
        };
        iterations.push(iterationData);

        if (this.hooks.onIterationEnd) {
          await this.hooks.onIterationEnd(iterationData);
        }

        this.emit('iteration_end', iterationData);

        // Add to session memory
        this.sessionManager.addMemory(sessionId, `Assistant: ${response.content}`);

        // Check if we should continue
        if (toolCalls.length === 0 || this.shouldStop(iteration, response)) {
          break;
        }
      }

      // 5. Complete
      this.state.status = 'completed';
      this.sessionManager.updateStatus(sessionId, 'completed');
      this.emit('status_changed', this.state);

      const finalOutput = iterations[iterations.length - 1]?.response.content || '';

      const result: AgentResult = {
        success: true,
        session,
        iterations,
        finalOutput,
        totalDurationMs: Date.now() - startTime,
        totalTokensUsed,
      };

      if (this.hooks.onComplete) {
        await this.hooks.onComplete(result);
      }

      this.emit('complete', result);
      return result;
    } catch (error) {
      this.state.status = 'failed';
      this.state.lastError = error instanceof Error ? error.message : String(error);
      this.sessionManager.updateStatus(sessionId, 'failed');
      this.emit('status_changed', this.state);
      this.emit('error', error);

      if (this.hooks.onError) {
        await this.hooks.onError(error instanceof Error ? error : new Error(String(error)));
      }

      return {
        success: false,
        session,
        iterations,
        finalOutput: '',
        totalDurationMs: Date.now() - startTime,
        totalTokensUsed,
        error: this.state.lastError,
      };
    } finally {
      this.state = {
        status: 'idle',
        currentIteration: 0,
      };
    }
  }

  /**
   * Get current agent state
   */
  getState(): AgentState {
    return { ...this.state };
  }

  /**
   * Cancel the current execution
   */
  cancel(): void {
    if (this.state.currentSession) {
      this.sessionManager.updateStatus(this.state.currentSession.id, 'cancelled');
    }
    this.state.status = 'idle';
    this.emit('cancelled');
  }

  /**
   * Approve a pending tool execution
   */
  approveTool(toolCallId: string, response: ToolApprovalResponse): void {
    const request = this.pendingApprovals.get(toolCallId);
    if (request) {
      this.emit(`approval_${toolCallId}`, response);
      this.pendingApprovals.delete(toolCallId);
    }
  }

  // Private methods

  private assembleContext(session: Session, userInput: string): AgentContext {
    const messages: LLMMessage[] = [];

    // System prompt
    if (this.config.systemPrompt) {
      messages.push({
        role: 'system',
        content: this.config.systemPrompt,
      });
    }

    // Session memory
    for (const memory of session.context.memory) {
      const [role, ...contentParts] = memory.split(': ');
      messages.push({
        role: role.toLowerCase() as 'user' | 'assistant',
        content: contentParts.join(': '),
      });
    }

    // Current user input
    messages.push({
      role: 'user',
      content: userInput,
    });

    return {
      session,
      messages,
      tools: this.getTools(),
      memory: session.context.memory,
      iteration: this.state.currentIteration,
      toolCallsThisIteration: 0,
    };
  }

  private extractToolCalls(response: { content: string; toolCalls?: ToolCall[] }): ToolCall[] {
    // If the LLM provider already extracted tool calls, use those
    if (response.toolCalls && response.toolCalls.length > 0) {
      return response.toolCalls;
    }

    // Otherwise, try to parse from content (fallback for providers that don't support native tool calling)
    const toolCallRegex = /<tool>(\w+)<\/tool>\s*<args>([\s\S]*?)<\/args>/g;
    const calls: ToolCall[] = [];
    let match;

    while ((match = toolCallRegex.exec(response.content)) !== null) {
      try {
        calls.push({
          id: `call_${Date.now()}_${calls.length}`,
          name: match[1],
          arguments: JSON.parse(match[2]),
        });
      } catch {
        // Invalid JSON in tool arguments, skip
      }
    }

    return calls;
  }

  private async executeTool(toolCall: ToolCall): Promise<ToolResult> {
    const tool = this.tools.get(toolCall.name);
    const startTime = Date.now();

    if (!tool) {
      return {
        toolCallId: toolCall.id,
        status: 'error',
        result: { error: `Tool not found: ${toolCall.name}` },
        executionTimeMs: 0,
      };
    }

    // Get circuit breaker for this tool
    const circuitBreaker = this.circuitBreakers.get(toolCall.name);

    // Get retry policy based on tool type
    let retryPolicy: RetryPolicy | undefined;
    if (toolCall.name.includes('portal')) {
      retryPolicy = this.retryPolicies.get('portal');
    } else if (toolCall.name.includes('pdf')) {
      retryPolicy = this.retryPolicies.get('pdf');
    } else {
      retryPolicy = this.retryPolicies.get('network');
    }

    // Execute with circuit breaker
    const executeWithResilience = async (): Promise<ToolResult> => {
      try {
        let result: ToolResult;

        if (retryPolicy) {
          // Execute with retry policy
          const retryResult = await retryPolicy.execute(async () => {
            return await tool.handler(toolCall.arguments);
          }, { operation: toolCall.name });

          if (retryResult.success && retryResult.result) {
            result = retryResult.result as ToolResult;
          } else {
            result = {
              toolCallId: toolCall.id,
              status: 'error',
              result: { error: retryResult.error?.message || 'Tool execution failed after retries' },
              executionTimeMs: Date.now() - startTime,
            };
          }
        } else {
          // Execute without retry
          result = await tool.handler(toolCall.arguments);
        }

        // Record metrics
        const duration = Date.now() - startTime;
        this.metrics.record('operation_latency_ms', duration, {
          operation: 'tool_execution',
          tool: toolCall.name,
          status: result.status,
        });

        if (result.status === 'error') {
          this.metrics.increment('operation_errors_total', {
            operation: 'tool_execution',
            tool: toolCall.name,
            error_type: 'execution_error',
          });
        }

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Add to DLQ for critical failures
        if (circuitBreaker) {
          this.dlq.add(
            toolCall.name,
            toolCall.arguments,
            error instanceof Error ? error : new Error(errorMessage),
            'high'
          );
        }

        // Record error metrics
        this.metrics.increment('operation_errors_total', {
          operation: 'tool_execution',
          tool: toolCall.name,
          error_type: error instanceof Error ? error.name : 'unknown',
        });

        return {
          toolCallId: toolCall.id,
          status: 'error',
          result: { error: errorMessage },
          executionTimeMs: Date.now() - startTime,
        };
      }
    };

    // Execute with circuit breaker if available
    if (circuitBreaker) {
      try {
        return await circuitBreaker.execute(() => executeWithResilience());
      } catch (error) {
        // Circuit breaker is open
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Record circuit breaker metrics
        this.metrics.record('circuit_breaker_state', 1, {
          tool: toolCall.name,
          state: circuitBreaker.getState(),
        });

        return {
          toolCallId: toolCall.id,
          status: 'error',
          result: {
            error: `Circuit breaker is open: ${errorMessage}`,
            circuitBreakerState: circuitBreaker.getState(),
          },
          executionTimeMs: Date.now() - startTime,
        };
      }
    } else {
      return await executeWithResilience();
    }
  }

  private async requestApproval(sessionId: string, toolCall: ToolCall): Promise<boolean> {
    const request: ToolApprovalRequest = {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      arguments: toolCall.arguments,
      sessionId,
      requestedAt: new Date(),
    };

    this.pendingApprovals.set(toolCall.id, request);
    this.state.status = 'waiting_for_approval';
    this.emit('status_changed', this.state);
    this.emit('approval_requested', request);

    // Wait for approval (with timeout)
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, 60000); // 60 second timeout

      this.once(`approval_${toolCall.id}`, (response: ToolApprovalResponse) => {
        clearTimeout(timeout);
        resolve(response.approved);
      });
    });
  }

  private async streamThinking(content: string): Promise<void> {
    const chunks: StreamChunk[] = [];
    const words = content.split(' ');

    for (let i = 0; i < words.length; i++) {
      chunks.push({
        index: i,
        content: words[i] + (i < words.length - 1 ? ' ' : ''),
        type: 'thinking',
      });
    }

    for (const chunk of chunks) {
      this.emit('stream_chunk', chunk);
      if (this.hooks.onStreamChunk) {
        await this.hooks.onStreamChunk(chunk);
      }
      // Small delay for streaming effect
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  private async streamToolResult(toolCall: ToolCall, result: ToolResult): Promise<void> {
    const chunk: StreamChunk = {
      index: 0,
      content: `[${toolCall.name}] ${result.status === 'success' ? '✓' : '✗'}`,
      type: 'tool_result',
      toolCall,
    };

    this.emit('stream_chunk', chunk);
    if (this.hooks.onStreamChunk) {
      await this.hooks.onStreamChunk(chunk);
    }
  }

  private shouldStop(iteration: number, response: { content: string }): boolean {
    // Stop if we've reached max iterations
    if (iteration >= this.config.maxIterations) {
      return true;
    }

    // Stop if response contains a completion marker
    const completionMarkers = ['<complete>', '<done>', '<finished>'];
    if (completionMarkers.some((marker) => response.content.includes(marker))) {
      return true;
    }

    return false;
  }

  private registerDefaultTools(): void {
    // Register built-in tools
    this.registerTool({
      name: 'noop',
      description: 'A no-op tool that does nothing. Use this to test the tool system.',
      parameters: {
        type: 'object',
        properties: {},
      },
      handler: async () => ({
        toolCallId: 'noop',
        status: 'success' as const,
        result: { message: 'No-op executed successfully' },
        executionTimeMs: 0,
      }),
    });
  }
}
