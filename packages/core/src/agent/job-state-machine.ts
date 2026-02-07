/**
 * Job State Machine
 *
 * Manages the job application workflow state transitions.
 * Implements the state machine from PRD section 12.3.
 */

export type JobState =
  | 'new'
  | 'analyzing'
  | 'tailoring'
  | 'compiling'
  | 'ready'
  | 'applying'
  | 'applied'
  | 'closed'
  | 'error';

export type JobEvent =
  | 'jd_received'
  | 'analysis_complete'
  | 'analysis_error'
  | 'tailoring_complete'
  | 'tailoring_error'
  | 'compile_complete'
  | 'compile_error'
  | 'user_approved'
  | 'user_rejected'
  | 'submit_initiated'
  | 'submit_complete'
  | 'submit_error'
  | 'outcome_recorded'
  | 'retry'
  | 'abort';

export interface StateTransition {
  from: JobState;
  event: JobEvent;
  to: JobState;
  action?: string;
}

export const JOB_STATE_TRANSITIONS: StateTransition[] = [
  // New -> Analyzing
  { from: 'new', event: 'jd_received', to: 'analyzing', action: 'analyze_jd' },

  // Analyzing -> Tailoring (success) or Error (failure)
  { from: 'analyzing', event: 'analysis_complete', to: 'tailoring', action: 'tailor_resume' },
  { from: 'analyzing', event: 'analysis_error', to: 'error' },
  { from: 'analyzing', event: 'retry', to: 'analyzing' },

  // Tailoring -> Compiling (success) or Error (failure)
  { from: 'tailoring', event: 'tailoring_complete', to: 'compiling', action: 'compile_pdf' },
  { from: 'tailoring', event: 'tailoring_error', to: 'error' },
  { from: 'tailoring', event: 'retry', to: 'tailoring' },

  // Compiling -> Ready (success) or Error (failure)
  { from: 'compiling', event: 'compile_complete', to: 'ready' },
  { from: 'compiling', event: 'compile_error', to: 'error' },
  { from: 'compiling', event: 'retry', to: 'compiling' },

  // Ready -> Applying (user approves) or Closed (user rejects)
  { from: 'ready', event: 'user_approved', to: 'applying', action: 'portal_autofill' },
  { from: 'ready', event: 'user_rejected', to: 'closed' },

  // Applying -> Applied (success) or Error (failure)
  { from: 'applying', event: 'submit_complete', to: 'applied' },
  { from: 'applying', event: 'submit_error', to: 'error' },

  // Applied -> Closed (outcome recorded)
  { from: 'applied', event: 'outcome_recorded', to: 'closed' },

  // Error -> New (retry) or Closed (abort)
  { from: 'error', event: 'retry', to: 'new' },
  { from: 'error', event: 'abort', to: 'closed' },
];

export interface JobContext {
  jobId: string;
  currentState: JobState;
  previousState?: JobState;
  stateHistory: Array<{
    state: JobState;
    enteredAt: Date;
    event?: JobEvent;
  }>;
  data: {
    jdText?: string;
    requirements?: unknown;
    tailoredResume?: string;
    pdfPath?: string;
    bundlePath?: string;
    portalUrl?: string;
    outcome?: 'interview' | 'offer' | 'rejected' | 'no_reply';
  };
  errors: Array<{
    state: JobState;
    error: string;
    timestamp: Date;
  }>;
}

export class JobStateMachine {
  private context: JobContext;

  constructor(jobId: string) {
    this.context = {
      jobId,
      currentState: 'new',
      stateHistory: [{ state: 'new', enteredAt: new Date() }],
      data: {},
      errors: [],
    };
  }

  /**
   * Get current state
   */
  getCurrentState(): JobState {
    return this.context.currentState;
  }

  /**
   * Get full context
   */
  getContext(): JobContext {
    return this.context;
  }

  /**
   * Check if a transition is valid
   */
  canTransition(event: JobEvent): boolean {
    return JOB_STATE_TRANSITIONS.some(
      t => t.from === this.context.currentState && t.event === event
    );
  }

  /**
   * Get valid next events for current state
   */
  getValidEvents(): JobEvent[] {
    return JOB_STATE_TRANSITIONS
      .filter(t => t.from === this.context.currentState)
      .map(t => t.event);
  }

  /**
   * Get the action for a transition
   */
  getTransitionAction(event: JobEvent): string | undefined {
    const transition = JOB_STATE_TRANSITIONS.find(
      t => t.from === this.context.currentState && t.event === event
    );
    return transition?.action;
  }

  /**
   * Transition to a new state
   */
  transition(event: JobEvent, data?: Partial<JobContext['data']>): JobState {
    const transition = JOB_STATE_TRANSITIONS.find(
      t => t.from === this.context.currentState && t.event === event
    );

    if (!transition) {
      throw new Error(
        `Invalid transition: cannot trigger '${event}' from state '${this.context.currentState}'`
      );
    }

    // Update state
    this.context.previousState = this.context.currentState;
    this.context.currentState = transition.to;

    // Update history
    this.context.stateHistory.push({
      state: transition.to,
      enteredAt: new Date(),
      event,
    });

    // Update data
    if (data) {
      this.context.data = { ...this.context.data, ...data };
    }

    return transition.to;
  }

  /**
   * Record an error
   */
  recordError(error: string): void {
    this.context.errors.push({
      state: this.context.currentState,
      error,
      timestamp: new Date(),
    });
  }

  /**
   * Update context data
   */
  updateData(data: Partial<JobContext['data']>): void {
    this.context.data = { ...this.context.data, ...data };
  }

  /**
   * Check if job is in a terminal state
   */
  isTerminal(): boolean {
    return ['closed', 'applied'].includes(this.context.currentState);
  }

  /**
   * Check if job is in an error state
   */
  isError(): boolean {
    return this.context.currentState === 'error';
  }

  /**
   * Get state history
   */
  getStateHistory(): JobContext['stateHistory'] {
    return this.context.stateHistory;
  }

  /**
   * Get errors
   */
  getErrors(): JobContext['errors'] {
    return this.context.errors;
  }

  /**
   * Serialize state machine
   */
  serialize(): string {
    return JSON.stringify(this.context);
  }

  /**
   * Deserialize state machine
   */
  static deserialize(serialized: string): JobStateMachine {
    const context = JSON.parse(serialized) as JobContext;
    const sm = new JobStateMachine(context.jobId);
    sm.context = context;
    return sm;
  }
}
