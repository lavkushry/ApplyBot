import { chromium, type Browser, type Page } from 'playwright';
import type { AnswersPack } from '@applypilot/core';
import { GreenhouseConnector } from './greenhouse.js';
import { LeverConnector } from './lever.js';
import { WorkdayConnector } from './workday.js';
import type { ConnectorOptions, FillResult } from './base-connector.js';

export interface AutofillOptions {
  url: string;
  answers: AnswersPack;
  pdfPath: string;
  mode: 'assist' | 'autofill';
  stopBeforeSubmit: boolean;
  headless: boolean;
}

export interface AutofillResult {
  success: boolean;
  portal: string;
  filledFields: string[];
  failedFields: string[];
  requiresReview: boolean;
  message: string;
  screenshot?: string;
}

export class AutofillEngine {
  private connectors = {
    greenhouse: GreenhouseConnector,
    lever: LeverConnector,
    workday: WorkdayConnector,
  };

  /**
   * Detect which portal connector to use
   */
  detectPortal(url: string): string | null {
    for (const [name, ConnectorClass] of Object.entries(this.connectors)) {
      const connector = new ConnectorClass({
        stopBeforeSubmit: true,
        humanLikeDelays: true,
        timeout: 30000,
      });
      if (connector.supports(url)) {
        return name;
      }
    }
    return null;
  }

  /**
   * Execute autofill on a job portal
   */
  async autofill(options: AutofillOptions): Promise<AutofillResult> {
    const portalName = this.detectPortal(options.url);
    
    if (!portalName) {
      return {
        success: false,
        portal: 'unknown',
        filledFields: [],
        failedFields: [],
        requiresReview: true,
        message: 'Unsupported job portal. Supported: Greenhouse, Lever, Workday',
      };
    }

    const ConnectorClass = this.connectors[portalName as keyof typeof this.connectors];
    const connectorOptions: ConnectorOptions = {
      stopBeforeSubmit: options.stopBeforeSubmit,
      humanLikeDelays: options.mode === 'autofill',
      timeout: 30000,
    };
    const connector = new ConnectorClass(connectorOptions);

    let browser: Browser | null = null;

    try {
      // Launch browser
      browser = await chromium.launch({
        headless: options.headless,
        slowMo: options.mode === 'assist' ? 100 : 0,
      });

      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });

      const page = await context.newPage();

      // Navigate to the job posting
      await page.goto(options.url, { waitUntil: 'networkidle' });

      // Prepare autofill plan
      const plan = await connector.prepare(page, options.answers, options.pdfPath);

      if (!plan.canProceed && plan.fields.length === 0) {
        await browser.close();
        return {
          success: false,
          portal: portalName,
          filledFields: [],
          failedFields: [],
          requiresReview: true,
          message: `Cannot proceed: ${plan.warnings.join(', ')}`,
        };
      }

      // Show warnings in assist mode
      if (options.mode === 'assist' && plan.warnings.length > 0) {
        console.log('Warnings:', plan.warnings);
      }

      // Execute autofill
      const result = await connector.execute(page, plan.fields);

      // Take screenshot for review
      const screenshot = await page.screenshot({ 
        fullPage: true,
        type: 'png',
      });
      const screenshotBase64 = screenshot.toString('base64');

      // Keep browser open in assist mode for manual review
      if (options.mode === 'autofill' || !options.stopBeforeSubmit) {
        await browser.close();
      }

      return {
        success: result.success,
        portal: portalName,
        filledFields: result.filledFields,
        failedFields: result.failedFields,
        requiresReview: result.requiresReview,
        message: result.message,
        screenshot: screenshotBase64,
      };
    } catch (error) {
      if (browser) {
        await browser.close();
      }

      return {
        success: false,
        portal: portalName || 'unknown',
        filledFields: [],
        failedFields: [],
        requiresReview: true,
        message: `Autofill failed: ${error}`,
      };
    }
  }

  /**
   * Preview fields that would be filled (without actually filling)
   */
  async preview(options: Omit<AutofillOptions, 'mode'>): Promise<{
    portal: string;
    fields: Array<{
      label: string;
      value: string;
      type: string;
    }>;
    warnings: string[];
  }> {
    const portalName = this.detectPortal(options.url);
    
    if (!portalName) {
      return {
        portal: 'unknown',
        fields: [],
        warnings: ['Unsupported job portal'],
      };
    }

    const ConnectorClass = this.connectors[portalName as keyof typeof this.connectors];
    const connector = new ConnectorClass({
      stopBeforeSubmit: true,
      humanLikeDelays: false,
      timeout: 30000,
    });

    let browser: Browser | null = null;

    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto(options.url, { waitUntil: 'networkidle' });

      const plan = await connector.prepare(page, options.answers, options.pdfPath);

      await browser.close();

      return {
        portal: portalName,
        fields: plan.fields.map(f => ({
          label: f.label || f.selector,
          value: f.value.substring(0, 50) + (f.value.length > 50 ? '...' : ''),
          type: f.type,
        })),
        warnings: plan.warnings,
      };
    } catch (error) {
      if (browser) {
        await browser.close();
      }
      throw error;
    }
  }

  /**
   * Get list of supported portals
   */
  getSupportedPortals(): string[] {
    return Object.keys(this.connectors);
  }
}

// Singleton instance
let autofillEngineInstance: AutofillEngine | null = null;

export function getAutofillEngine(): AutofillEngine {
  if (!autofillEngineInstance) {
    autofillEngineInstance = new AutofillEngine();
  }
  return autofillEngineInstance;
}
