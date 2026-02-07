/**
 * Browser Integration Module - OpenClaw-inspired Browser Automation
 *
 * Playwright-based browser control with CDP integration.
 */

export { BrowserManager } from './browser-manager.js';

export type {
  BrowserConfig,
  BrowserSession,
  BrowserStatus,
  BrowserSnapshot,
  SnapshotElement,
  BrowserAction,
  BrowserActionType,
  BrowserActionResult,
  PortalField,
  PortalForm,
  AutofillConfig,
  BrowserStats,
  ReviewGateConfig,
} from './types.js';

export type { BrowserManagerOptions } from './browser-manager.js';
