/**
 * Browser Manager - OpenClaw-inspired Browser Automation
 *
 * Manages Playwright-based browser sessions, snapshots, and interactions.
 */

import { EventEmitter } from 'events';
import type {
  BrowserConfig,
  BrowserSession,
  BrowserStatus,
  BrowserSnapshot,
  SnapshotElement,
  BrowserAction,
  BrowserActionResult,
  BrowserStats,
  PortalForm,
  PortalField,
  AutofillConfig,
} from './types.js';

export interface BrowserManagerOptions {
  config?: Partial<BrowserConfig>;
}

export class BrowserManager extends EventEmitter {
  private config: BrowserConfig;
  private sessions = new Map<string, BrowserSession>();
  private snapshots = new Map<string, BrowserSnapshot>();
  private actionCount = 0;

  constructor(options: BrowserManagerOptions = {}) {
    super();

    this.config = {
      engine: 'playwright',
      headless: false,
      viewport: { width: 1280, height: 720 },
      timeout: 30000,
      slowMo: 100,
      ...options.config,
    };
  }

  /**
   * Start a new browser session
   */
  async startSession(url?: string): Promise<BrowserSession> {
    const session: BrowserSession = {
      id: this.generateId('session'),
      status: 'idle',
      startedAt: new Date(),
      lastActivityAt: new Date(),
      snapshotCount: 0,
    };

    if (url) {
      session.status = 'navigating';
      session.url = url;
    }

    this.sessions.set(session.id, session);

    this.emit('session_started', session);

    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): BrowserSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all sessions
   */
  listSessions(): BrowserSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Close a session
   */
  async closeSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.status = 'closed';
    this.sessions.delete(sessionId);

    this.emit('session_closed', session);

    return true;
  }

  /**
   * Take a snapshot of the current page
   */
  async takeSnapshot(sessionId: string): Promise<BrowserSnapshot | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status === 'closed') return null;

    // In a real implementation, this would use Playwright to capture the page
    const snapshot: BrowserSnapshot = {
      id: this.generateId('snapshot'),
      sessionId,
      url: session.url || 'about:blank',
      title: session.title || 'Untitled',
      timestamp: new Date(),
      elements: [], // Would be populated by actual DOM scanning
    };

    this.snapshots.set(snapshot.id, snapshot);
    session.snapshotCount++;
    session.lastActivityAt = new Date();

    this.emit('snapshot_taken', snapshot);

    return snapshot;
  }

  /**
   * Get a snapshot by ID
   */
  getSnapshot(snapshotId: string): BrowserSnapshot | undefined {
    return this.snapshots.get(snapshotId);
  }

  /**
   * Execute a browser action
   */
  async executeAction(
    sessionId: string,
    action: BrowserAction
  ): Promise<BrowserActionResult> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status === 'closed') {
      return {
        success: false,
        action,
        error: 'Session not found or closed',
        executionTimeMs: 0,
      };
    }

    const startTime = Date.now();
    session.status = 'interacting';

    try {
      // In a real implementation, this would execute via Playwright
      const result = await this.simulateAction(sessionId, action);

      session.lastActivityAt = new Date();
      session.status = 'idle';
      this.actionCount++;

      const executionTimeMs = Date.now() - startTime;

      this.emit('action_executed', { sessionId, action, result });

      return {
        success: true,
        action,
        data: result,
        executionTimeMs,
      };
    } catch (error) {
      session.status = 'error';

      return {
        success: false,
        action,
        error: error instanceof Error ? error.message : String(error),
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Navigate to a URL
   */
  async navigate(sessionId: string, url: string): Promise<BrowserActionResult> {
    return this.executeAction(sessionId, {
      type: 'navigate',
      target: url,
    });
  }

  /**
   * Click an element
   */
  async click(sessionId: string, selector: string): Promise<BrowserActionResult> {
    return this.executeAction(sessionId, {
      type: 'click',
      target: selector,
    });
  }

  /**
   * Type text into an element
   */
  async type(
    sessionId: string,
    selector: string,
    text: string
  ): Promise<BrowserActionResult> {
    return this.executeAction(sessionId, {
      type: 'type',
      target: selector,
      value: text,
    });
  }

  /**
   * Upload a file
   */
  async upload(
    sessionId: string,
    selector: string,
    filePath: string
  ): Promise<BrowserActionResult> {
    return this.executeAction(sessionId, {
      type: 'upload',
      target: selector,
      value: filePath,
    });
  }

  /**
   * Take a screenshot
   */
  async screenshot(sessionId: string): Promise<BrowserActionResult> {
    return this.executeAction(sessionId, {
      type: 'screenshot',
      target: 'page',
    });
  }

  /**
   * Detect form fields on the current page
   */
  async detectForm(sessionId: string): Promise<PortalForm | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // In a real implementation, this would scan the DOM for form fields
    const fields: PortalField[] = [
      {
        selector: 'input[name="firstName"]',
        name: 'firstName',
        type: 'text',
        required: true,
        label: 'First Name',
      },
      {
        selector: 'input[name="lastName"]',
        name: 'lastName',
        type: 'text',
        required: true,
        label: 'Last Name',
      },
      {
        selector: 'input[name="email"]',
        name: 'email',
        type: 'email',
        required: true,
        label: 'Email',
      },
      {
        selector: 'input[name="resume"]',
        name: 'resume',
        type: 'file',
        required: true,
        label: 'Resume',
      },
    ];

    return {
      url: session.url || '',
      portal: 'generic',
      fields,
      submitButton: 'button[type="submit"]',
      reviewGate: true,
    };
  }

  /**
   * Autofill a form
   */
  async autofillForm(
    sessionId: string,
    form: PortalForm,
    config: AutofillConfig
  ): Promise<BrowserActionResult[]> {
    const results: BrowserActionResult[] = [];

    for (const field of form.fields) {
      const value = config.profile[field.name];

      if (!value && field.required) {
        results.push({
          success: false,
          action: { type: 'type', target: field.selector },
          error: `Required field ${field.name} has no value`,
          executionTimeMs: 0,
        });
        continue;
      }

      if (field.type === 'file' && field.name === 'resume' && config.resumePath) {
        const result = await this.upload(sessionId, field.selector, config.resumePath);
        results.push(result);
      } else if (value) {
        const result = await this.type(sessionId, field.selector, value);
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Get browser statistics
   */
  getStats(): BrowserStats {
    const activeSessions = Array.from(this.sessions.values()).filter(
      (s) => s.status !== 'closed'
    );

    const totalDuration = activeSessions.reduce((sum, s) => {
      return sum + (Date.now() - s.startedAt.getTime());
    }, 0);

    return {
      totalSessions: this.sessions.size,
      activeSessions: activeSessions.length,
      totalSnapshots: this.snapshots.size,
      totalActions: this.actionCount,
      averageSessionDuration:
        activeSessions.length > 0 ? totalDuration / activeSessions.length : 0,
    };
  }

  /**
   * Get the browser configuration
   */
  getConfig(): BrowserConfig {
    return { ...this.config };
  }

  /**
   * Update browser configuration
   */
  updateConfig(config: Partial<BrowserConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // Private methods

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async simulateAction(
    _sessionId: string,
    action: BrowserAction
  ): Promise<unknown> {
    // Simulate action execution delay
    await new Promise((resolve) => setTimeout(resolve, this.config.slowMo));

    // Return mock result based on action type
    switch (action.type) {
      case 'navigate':
        return { url: action.target };
      case 'click':
        return { clicked: action.target };
      case 'type':
        return { typed: action.value, into: action.target };
      case 'upload':
        return { uploaded: action.value, to: action.target };
      case 'screenshot':
        return { screenshot: 'base64_encoded_image_data' };
      case 'evaluate':
        return { result: null };
      default:
        return {};
    }
  }
}

export default BrowserManager;
