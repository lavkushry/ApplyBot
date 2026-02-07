import type { Page } from 'playwright';
import type { AnswersPack } from '@applypilot/core';
import { BasePortalConnector, type ConnectorOptions, type FillResult } from './base-connector.js';

export class WorkdayConnector extends BasePortalConnector {
  constructor(options: ConnectorOptions) {
    super(options);
  }

  supports(url: string): boolean {
    return url.includes('workday.com') || url.includes('myworkdayjobs.com');
  }

  getName(): string {
    return 'Workday';
  }

  async prepare(
    page: Page,
    answers: AnswersPack,
    pdfPath: string
  ): Promise<{
    canProceed: boolean;
    fields: Array<{
      selector: string;
      value: string;
      type: 'text' | 'select' | 'checkbox' | 'file' | 'textarea';
      label?: string;
    }>;
    warnings: string[];
    multiPage: boolean;
  }> {
    const warnings: string[] = [];
    const fields: Array<{
      selector: string;
      value: string;
      type: 'text' | 'select' | 'checkbox' | 'file' | 'textarea';
      label?: string;
    }> = [];

    // Wait for form to load
    await page.waitForLoadState('networkidle');

    // Workday uses a multi-page wizard
    const isWorkday = await page.locator('[data-automation-id="pageHeader"], .wd-page-header').count() > 0;
    if (!isWorkday) {
      warnings.push('Could not detect Workday application form. Page structure may have changed.');
      return { canProceed: false, fields, warnings, multiPage: true };
    }

    // Check current page type
    const currentPage = await this.detectCurrentPage(page);
    
    // Extract fields based on current page
    const formFields = await this.extractFields(page, currentPage);

    // Map fields to answers
    for (const field of formFields) {
      const mapping = this.mapFieldToAnswer(field.label, field.type, answers);
      if (mapping) {
        fields.push({
          selector: field.selector,
          value: mapping.value,
          type: mapping.type,
          label: field.label,
        });
      } else if (field.required) {
        warnings.push(`Required field not mapped: ${field.label}`);
      }
    }

    // Handle resume upload on appropriate page
    if (currentPage === 'resume') {
      const resumeField = formFields.find(f => 
        f.label.toLowerCase().includes('resume') || 
        f.label.toLowerCase().includes('cv')
      );
      if (resumeField) {
        fields.push({
          selector: resumeField.selector,
          value: pdfPath,
          type: 'file',
          label: resumeField.label,
        });
      }
    }

    return {
      canProceed: warnings.length === 0 || !fields.some(f => f.type === 'file'),
      fields,
      warnings,
      multiPage: true,
    };
  }

  private async detectCurrentPage(page: Page): Promise<string> {
    const headerText = await page.locator('[data-automation-id="pageHeader"], .wd-page-header').textContent().catch(() => '');
    const lowerHeader = headerText?.toLowerCase() || '';

    if (lowerHeader.includes('contact')) return 'contact';
    if (lowerHeader.includes('experience')) return 'experience';
    if (lowerHeader.includes('resume')) return 'resume';
    if (lowerHeader.includes('application')) return 'application';
    if (lowerHeader.includes('review')) return 'review';
    
    // Try to detect by form content
    const hasResumeUpload = await page.locator('input[type="file"]').count() > 0;
    if (hasResumeUpload) return 'resume';

    const hasExperienceFields = await page.locator('[data-automation-id*="experience"]').count() > 0;
    if (hasExperienceFields) return 'experience';

    return 'unknown';
  }

  private async extractFields(page: Page, pageType: string): Promise<Array<{
    selector: string;
    type: string;
    label: string;
    required: boolean;
  }>> {
    return page.evaluate((currentPageType) => {
      const results: Array<{
        selector: string;
        type: string;
        label: string;
        required: boolean;
      }> = [];

      // Workday uses data-automation-id attributes
      const inputSelectors = [
        'input[data-automation-id]',
        'textarea[data-automation-id]',
        'select[data-automation-id]',
      ];

      inputSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach((el, i) => {
          const element = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
          const automationId = element.getAttribute('data-automation-id') || '';
          
          // Find label
          let label = '';
          const labelEl = element.closest('[data-automation-id="formField"]')?.querySelector('label');
          if (labelEl) {
            label = labelEl.textContent || '';
          } else {
            // Try to extract from automation ID
            label = automationId.replace(/([A-Z])/g, ' $1').trim();
          }

          let type = 'text';
          if (element.tagName === 'TEXTAREA') type = 'textarea';
          else if (element.tagName === 'SELECT') type = 'select';
          else if (element.type === 'file') type = 'file';
          else if (element.type === 'checkbox') type = 'checkbox';
          else if (element.type === 'email') type = 'text';
          else if (element.type === 'tel') type = 'text';

          const isRequired = element.required || 
                            element.closest('[data-automation-id="formField"]')?.classList.contains('required') ||
                            element.getAttribute('aria-required') === 'true';

          results.push({
            selector: `[data-automation-id="${automationId}"]`,
            type,
            label: label.trim() || `Field ${i}`,
            required: isRequired,
          });
        });
      });

      // Also check for standard inputs
      document.querySelectorAll('input:not([data-automation-id])').forEach((el, i) => {
        const input = el as HTMLInputElement;
        if (input.type === 'hidden') return;

        const labelEl = document.querySelector(`label[for="${input.id}"]`);
        const label = labelEl?.textContent || input.placeholder || `Input ${i}`;

        let type = 'text';
        if (input.type === 'file') type = 'file';
        else if (input.type === 'checkbox') type = 'checkbox';

        results.push({
          selector: `#${input.id}, input[name="${input.name}"]`,
          type,
          label: label.trim(),
          required: input.required,
        });
      });

      return results;
    }, pageType);
  }

  async execute(page: Page, plan: unknown): Promise<FillResult> {
    const fields = plan as Array<{
      selector: string;
      value: string;
      type: string;
      label?: string;
    }>;

    const filledFields: string[] = [];
    const failedFields: string[] = [];

    for (const field of fields) {
      try {
        await this.scrollIntoView(page, field.selector);
        await this.delay();

        // Wait for element
        await page.waitForSelector(field.selector, { state: 'visible', timeout: 5000 });

        switch (field.type) {
          case 'text':
          case 'email':
          case 'tel':
            await page.fill(field.selector, field.value);
            break;
          case 'textarea':
            await page.fill(field.selector, field.value);
            break;
          case 'select':
            // Workday uses custom dropdowns sometimes
            try {
              await page.selectOption(field.selector, { label: field.value });
            } catch {
              // Try clicking and selecting
              await page.click(field.selector);
              await this.delay(500);
              await page.click(`text="${field.value}"`);
            }
            break;
          case 'file':
            await page.setInputFiles(field.selector, field.value);
            break;
          case 'checkbox':
            if (field.value === 'true') {
              await page.check(field.selector);
            } else {
              await page.uncheck(field.selector);
            }
            break;
        }

        filledFields.push(field.label || field.selector);
        await this.delay(500, 1000);
      } catch (error) {
        failedFields.push(field.label || field.selector);
        console.error(`Failed to fill ${field.label}:`, error);
      }
    }

    return {
      success: failedFields.length === 0,
      filledFields,
      failedFields,
      requiresReview: failedFields.length > 0 || this.options.stopBeforeSubmit,
      message: failedFields.length > 0 
        ? `Failed to fill ${failedFields.length} fields` 
        : 'All fields filled successfully. Click "Next" to continue to the next page.',
    };
  }

  async navigateToNextPage(page: Page): Promise<boolean> {
    try {
      // Look for next button
      const nextButton = page.locator('button:has-text("Next"), [data-automation-id="nextButton"], button:has-text("Continue")');
      if (await nextButton.count() > 0) {
        await nextButton.click();
        await page.waitForLoadState('networkidle');
        await this.delay(1000);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private mapFieldToAnswer(
    label: string,
    type: string,
    answers: AnswersPack
  ): { value: string; type: 'text' | 'select' | 'checkbox' | 'file' | 'textarea' } | null {
    const lowerLabel = label.toLowerCase();

    // Personal info
    const personal = answers.personal || {};
    if (lowerLabel.includes('first name')) {
      return { value: personal.firstName || '', type: 'text' };
    }
    if (lowerLabel.includes('last name')) {
      return { value: personal.lastName || '', type: 'text' };
    }
    if (lowerLabel.includes('email')) {
      return { value: personal.email || '', type: 'text' };
    }
    if (lowerLabel.includes('phone')) {
      return { value: personal.phone || '', type: 'text' };
    }
    if (lowerLabel.includes('linkedin')) {
      return { value: personal.linkedin || '', type: 'text' };
    }
    if (lowerLabel.includes('website') || lowerLabel.includes('portfolio')) {
      return { value: personal.portfolio || '', type: 'text' };
    }

    // Location
    if (lowerLabel.includes('city')) {
      return { value: answers.location?.city || '', type: 'text' };
    }
    if (lowerLabel.includes('state') || lowerLabel.includes('province')) {
      return { value: answers.location?.state || '', type: 'select' };
    }
    if (lowerLabel.includes('country')) {
      return { value: answers.location?.country || '', type: 'select' };
    }
    if (lowerLabel.includes('zip') || lowerLabel.includes('postal')) {
      return { value: answers.location?.postalCode || '', type: 'text' };
    }

    // Form answers
    for (const [key, value] of Object.entries(answers.formAnswers)) {
      if (lowerLabel.includes(key.toLowerCase())) {
        return { value, type: type as 'text' | 'textarea' };
      }
    }

    // Screening questions
    for (const [key, value] of Object.entries(answers.screeningQuestions)) {
      if (lowerLabel.includes(key.toLowerCase().substring(0, 20))) {
        return { value, type: 'textarea' };
      }
    }

    return null;
  }
}