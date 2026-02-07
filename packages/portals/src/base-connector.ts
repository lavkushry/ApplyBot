import type { Page } from 'playwright';
import type { AnswersPack } from '@applypilot/core';

export interface ConnectorOptions {
  stopBeforeSubmit: boolean;
  humanLikeDelays: boolean;
  timeout: number;
}

export interface FillResult {
  success: boolean;
  filledFields: string[];
  failedFields: string[];
  requiresReview: boolean;
  message: string;
}

export abstract class BasePortalConnector {
  protected options: ConnectorOptions;

  constructor(options: ConnectorOptions) {
    this.options = options;
  }

  /**
   * Check if this connector supports the given URL
   */
  abstract supports(url: string): boolean;

  /**
   * Get portal name
   */
  abstract getName(): string;

  /**
   * Prepare autofill plan (identify fields without filling)
   */
  abstract prepare(page: Page, answers: AnswersPack, pdfPath: string): Promise<{
    canProceed: boolean;
    fields: Array<{
      selector: string;
      value: string;
      type: 'text' | 'select' | 'checkbox' | 'file' | 'textarea';
      label?: string;
    }>;
    warnings: string[];
    multiPage?: boolean;
  }>;

  /**
   * Execute autofill
   */
  abstract execute(page: Page, plan: unknown): Promise<FillResult>;

  /**
   * Human-like delay between actions
   */
  protected async delay(min = 500, max = 1500): Promise<void> {
    if (!this.options.humanLikeDelays) return;
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Scroll element into view
   */
  protected async scrollIntoView(page: Page, selector: string): Promise<void> {
    await page.evaluate((sel) => {
      const element = document.querySelector(sel);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, selector);
    await this.delay(200, 500);
  }
}
