/**
 * Browser Integration Types - OpenClaw-inspired Browser Automation
 *
 * Playwright-based browser control with CDP integration.
 */

export interface BrowserConfig {
  engine: 'playwright' | 'puppeteer';
  headless: boolean;
  executablePath?: string;
  userDataDir?: string;
  viewport: {
    width: number;
    height: number;
  };
  timeout: number;
  slowMo: number;
}

export interface BrowserSession {
  id: string;
  status: BrowserStatus;
  url?: string;
  title?: string;
  startedAt: Date;
  lastActivityAt: Date;
  snapshotCount: number;
}

export type BrowserStatus = 'idle' | 'navigating' | 'interacting' | 'error' | 'closed';

export interface BrowserSnapshot {
  id: string;
  sessionId: string;
  url: string;
  title: string;
  timestamp: Date;
  elements: SnapshotElement[];
  screenshot?: string;
}

export interface SnapshotElement {
  id: string;
  ref: string;
  tag: string;
  type?: string;
  name?: string;
  placeholder?: string;
  value?: string;
  text?: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  attributes: Record<string, string>;
  visible: boolean;
  interactable: boolean;
}

export interface BrowserAction {
  type: BrowserActionType;
  target: string;
  value?: string;
  options?: Record<string, unknown>;
}

export type BrowserActionType =
  | 'navigate'
  | 'click'
  | 'type'
  | 'select'
  | 'upload'
  | 'scroll'
  | 'screenshot'
  | 'wait'
  | 'evaluate';

export interface BrowserActionResult {
  success: boolean;
  action: BrowserAction;
  error?: string;
  data?: unknown;
  executionTimeMs: number;
}

export interface PortalField {
  selector: string;
  name: string;
  type: 'text' | 'email' | 'tel' | 'select' | 'file' | 'checkbox' | 'radio';
  required: boolean;
  label?: string;
  placeholder?: string;
  options?: string[];
  value?: string;
}

export interface PortalForm {
  url: string;
  portal: string;
  fields: PortalField[];
  submitButton?: string;
  reviewGate: boolean;
}

export interface AutofillConfig {
  profile: Record<string, string>;
  resumePath?: string;
  coverLetterPath?: string;
  autoSubmit: boolean;
}

export interface BrowserStats {
  totalSessions: number;
  activeSessions: number;
  totalSnapshots: number;
  totalActions: number;
  averageSessionDuration: number;
}

export interface ReviewGateConfig {
  enabled: boolean;
  beforeSubmit: boolean;
  beforeFileUpload: boolean;
  beforeSensitiveInput: boolean;
}
