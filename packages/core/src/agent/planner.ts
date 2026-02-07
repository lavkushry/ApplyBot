/**
 * Planner Component
 *
 * Orchestrates the job processing workflow using the state machine.
 * Implements step selection, error recovery, and retry logic.
 */

import { JobStateMachine, JobState, JobEvent, JobContext } from './job-state-machine.js';
import type { AgentRuntime } from './agent-runtime.js';
import type { Session } from '../gateway/types.js';

export interface PlannerConfig {
  maxRetries: number;
  retryDelayMs: number;
  enableAutoRetry: boolean;
}

export interface StepResult {
  success: boolean;
  nextEvent: JobEvent;
  data?: Partial<JobContext['data']>;
  error?: string;
}

export interface PlanStep {
  state: JobState;
  action: string;
  description: string;
}

export const JOB_PLAN: PlanStep[] = [
  { state: 'new', action: 'start', description: 'Initialize job processing' },
  { state: 'analyzing', action: 'analyze_jd', description: 'Analyze job description' },
  { state: 'tailoring', action: 'tailor_resume', description: 'Tailor resume for job' },
  { state: 'compiling', action: 'compile_pdf', description: 'Compile PDF' },
  { state: 'ready', action: 'review', description: 'Wait for user review' },
  { state: 'applying', action: 'portal_autofill', description: 'Fill portal application' },
  { state: 'applied', action: 'complete', description: 'Mark as applied' },
  { state: 'closed', action: 'finish', description: 'Close job' },
];

export class Planner {
  private stateMachine: JobStateMachine;
  private runtime: AgentRuntime;
  private config: PlannerConfig;
  private retryCount: Map<JobState, number> = new Map();

  constructor(
    jobId: string,
    runtime: AgentRuntime,
    config: Partial<PlannerConfig> = {}
  ) {
    this.stateMachine = new JobStateMachine(jobId);
    this.runtime = runtime;
    this.config = {
      maxRetries: 3,
      retryDelayMs: 5000,
      enableAutoRetry: true,
      ...config,
    };
  }

  /**
   * Get current state
   */
  getCurrentState(): JobState {
    return this.stateMachine.getCurrentState();
  }

  /**
   * Get state machine context
   */
  getContext(): JobContext {
    return this.stateMachine.getContext();
  }

  /**
   * Start job processing
   */
  async start(jdText: string): Promise<StepResult> {
    this.stateMachine.updateData({ jdText });
    return this.executeStep('jd_received');
  }

  /**
   * Execute the current step
   */
  async executeStep(event: JobEvent, data?: Partial<JobContext['data']>): Promise<StepResult> {
    const currentState = this.stateMachine.getCurrentState();

    // Check if transition is valid
    if (!this.stateMachine.canTransition(event)) {
      return {
        success: false,
        nextEvent: event,
        error: `Invalid transition: cannot trigger '${event}' from state '${currentState}'`,
      };
    }

    try {
      // Get the action for this transition
      const action = this.stateMachine.getTransitionAction(event);

      // Execute the action if there is one
      if (action && action !== 'start' && action !== 'review' && action !== 'complete' && action !== 'finish') {
        const actionResult = await this.executeAction(action);
        if (!actionResult.success) {
          // Handle failure - transition to error or retry
          return this.handleFailure(currentState, actionResult.error || 'Action failed');
        }
      }

      // Transition to next state
      const nextState = this.stateMachine.transition(event, data);

      // Reset retry count for the completed state
      this.retryCount.delete(currentState);

      // Determine next event based on state
      const nextEvent = this.determineNextEvent(nextState);

      return {
        success: true,
        nextEvent,
        data: this.stateMachine.getContext().data,
      };
    } catch (error) {
      return this.handleFailure(
        currentState,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Execute an action using the agent runtime
   */
  private async executeAction(action: string): Promise<{ success: boolean; error?: string }> {
    // Map actions to tool calls
    const toolMap: Record<string, string> = {
      analyze_jd: 'analyze_jd',
      tailor_resume: 'tailor_resume',
      compile_pdf: 'compile_pdf',
      portal_autofill: 'portal_autofill',
    };

    const toolName = toolMap[action];
    if (!toolName) {
      return { success: true }; // No tool needed for this action
    }

    // This would call the actual tool through the runtime
    // For now, return success as the tools are registered separately
    return { success: true };
  }

  /**
   * Handle failure with retry logic
   */
  private handleFailure(state: JobState, error: string): StepResult {
    this.stateMachine.recordError(error);

    const currentRetries = this.retryCount.get(state) || 0;

    if (this.config.enableAutoRetry && currentRetries < this.config.maxRetries) {
      this.retryCount.set(state, currentRetries + 1);
      return {
        success: false,
        nextEvent: 'retry',
        error: `${error} (Retry ${currentRetries + 1}/${this.config.maxRetries})`,
      };
    }

    // Max retries exceeded - transition to error state
    return {
      success: false,
      nextEvent: 'abort',
      error: `Max retries exceeded: ${error}`,
    };
  }

  /**
   * Determine the next event based on current state
   */
  private determineNextEvent(state: JobState): JobEvent {
    switch (state) {
      case 'analyzing':
        return 'analysis_complete';
      case 'tailoring':
        return 'tailoring_complete';
      case 'compiling':
        return 'compile_complete';
      case 'ready':
        return 'user_approved';
      case 'applying':
        return 'submit_complete';
      case 'applied':
        return 'outcome_recorded';
      case 'closed':
      case 'error':
        return 'abort';
      default:
        return 'jd_received';
    }
  }

  /**
   * Get the current plan step
   */
  getCurrentStep(): PlanStep | undefined {
    const currentState = this.stateMachine.getCurrentState();
    return JOB_PLAN.find(step => step.state === currentState);
  }

  /**
   * Get remaining steps in the plan
   */
  getRemainingSteps(): PlanStep[] {
    const currentState = this.stateMachine.getCurrentState();
    const currentIndex = JOB_PLAN.findIndex(step => step.state === currentState);
    if (currentIndex === -1) return JOB_PLAN;
    return JOB_PLAN.slice(currentIndex + 1);
  }

  /**
   * Approve the current step (for review gates)
   */
  async approve(data?: Partial<JobContext['data']>): Promise<StepResult> {
    const currentState = this.stateMachine.getCurrentState();

    if (currentState === 'ready') {
      return this.executeStep('user_approved', data);
    }

    return {
      success: false,
      nextEvent: 'user_approved',
      error: `Cannot approve from state '${currentState}'`,
    };
  }

  /**
   * Reject the current step (for review gates)
   */
  async reject(): Promise<StepResult> {
    const currentState = this.stateMachine.getCurrentState();

    if (currentState === 'ready') {
      return this.executeStep('user_rejected');
    }

    return {
      success: false,
      nextEvent: 'user_rejected',
      error: `Cannot reject from state '${currentState}'`,
    };
  }

  /**
   * Retry from error state
   */
  async retry(): Promise<StepResult> {
    const currentState = this.stateMachine.getCurrentState();

    if (currentState === 'error') {
      return this.executeStep('retry');
    }

    return {
      success: false,
      nextEvent: 'retry',
      error: `Cannot retry from state '${currentState}'`,
    };
  }

  /**
   * Abort the job
   */
  async abort(): Promise<StepResult> {
    return this.executeStep('abort');
  }

  /**
   * Check if job is complete
   */
  isComplete(): boolean {
    return this.stateMachine.isTerminal();
  }

  /**
   * Check if job has errors
   */
  hasErrors(): boolean {
    return this.stateMachine.isError();
  }

  /**
   * Get error history
   */
  getErrors(): JobContext['errors'] {
    return this.stateMachine.getErrors();
  }

  /**
   * Serialize planner state
   */
  serialize(): string {
    return JSON.stringify({
      stateMachine: this.stateMachine.serialize(),
      retryCount: Array.from(this.retryCount.entries()),
      config: this.config,
    });
  }

  /**
   * Deserialize planner state
   */
  static deserialize(
    serialized: string,
    runtime: AgentRuntime
  ): Planner {
    const data = JSON.parse(serialized);
    const planner = new Planner(
      JSON.parse(data.stateMachine).jobId,
      runtime,
      data.config
    );
    planner.stateMachine = JobStateMachine.deserialize(data.stateMachine);
    planner.retryCount = new Map(data.retryCount);
    return planner;
  }
}
