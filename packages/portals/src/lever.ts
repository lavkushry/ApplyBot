import type { Page } from 'playwright';
import type { AnswersPack } from '@applypilot/core';
import { BasePortalConnector, type ConnectorOptions, type FillResult } from './base-connector.js';

export class LeverConnector extends BasePortalConnector {
  constructor(options: ConnectorOptions) {
    super(options);
  }

  supports(url: string): boolean {
    return url.includes('lever.co') || url.includes('jobs.lever.co');
  }

  getName(): string {
    return 'Lever';
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

    // Lever uses a specific form structure
    const formExists = await page.locator('.application-form, form[data-qa="application-form"]').count() > 0;
    if (!formExists) {
      warnings.push('Could not detect Lever application form. Page structure may have changed.');
      return { canProceed: false, fields, warnings };
    }

    // Extract Lever form fields
    const formFields = await page.evaluate(() => {
      const results: Array<{
        selector: string;
        type: string;
        label: string;
        required: boolean;
      }> = [];

      // Lever uses data-qa attributes
      document.querySelectorAll('[data-qa="input"], input:not([type="hidden"])').forEach((el, i) => {
        const input = el as HTMLInputElement;
        const labelEl = input.closest('.field')?.querySelector('label, .label');
        const label = labelEl?.textContent || 
                     input.placeholder || 
                     input.getAttribute('aria-label') ||
                     `Field ${i}`;
        
        let type = 'text';
        if (input.type === 'email') type = 'text';
        else if (input.type === 'tel') type = 'text';
        else if (input.type === 'file') type = 'file';

        results.push({
          selector: `[data-qa="input"][name="${input.name}"], input[name="${input.name}"]`,
          type,
          label: label.trim(),
          required: input.required || input.closest('.field')?.classList.contains('required') || false,
        });
      });

      // Textareas
      document.querySelectorAll('textarea[data-qa="textarea"], textarea').forEach((el, i) => {
        const textarea = el as HTMLTextAreaElement;
        const labelEl = textarea.closest('.field')?.querySelector('label, .label');
        const label = labelEl?.textContent || 
                     textarea.placeholder || 
                     `Textarea ${i}`;
        
        results.push({
          selector: `textarea[name="${textarea.name}"]`,
          type: 'textarea',
          label: label.trim(),
          required: textarea.required || textarea.closest('.field')?.classList.contains('required') || false,
        });
      });

      // Selects (dropdowns)
      document.querySelectorAll('select[data-qa="select"], select').forEach((el, i) => {
        const select = el as HTMLSelectElement;
        const labelEl = select.closest('.field')?.querySelector('label, .label');
        const label = labelEl?.textContent || `Select ${i}`;
        
        results.push({
          selector: `select[name="${select.name}"]`,
          type: 'select',
          label: label.trim(),
          required: select.required || select.closest('.field')?.classList.contains('required') || false,
        });
      });

      // Checkboxes (custom Lever styling)
      document.querySelectorAll('.checkbox input[type="checkbox"]').forEach((el, i) => {
        const input = el as HTMLInputElement;
        const labelEl = input.closest('.checkbox')?.querySelector('label');
        const label = labelEl?.textContent || `Checkbox ${i}`;
        
        results.push({
          selector: `input[type="checkbox"][name="${input.name}"]`,
          type: 'checkbox',
          label: label.trim(),
          required: false,
        });
      });

      return results;
    });

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

    // Handle resume upload (Lever has specific resume field)
    const resumeField = formFields.find(f => 
      f.label.toLowerCase().includes('resume') || 
      f.label.toLowerCase().includes('cv') ||
      f.type === 'file'
    );
    if (resumeField) {
      fields.push({
        selector: resumeField.selector,
        value: pdfPath,
        type: 'file',
        label: resumeField.label,
      });
    }

    return {
      canProceed: warnings.length === 0 || !fields.some(f => f.type === 'file'),
      fields,
      warnings,
    };
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

        // Wait for element to be visible and enabled
        await page.waitForSelector(field.selector, { state: 'visible', timeout: 5000 });

        switch (field.type) {
          case 'text':
          case 'email':
          case 'tel':
            // Clear field first
            await page.fill(field.selector, '');
            await page.fill(field.selector, field.value);
            break;
          case 'textarea':
            await page.fill(field.selector, field.value);
            break;
          case 'select':
            await page.selectOption(field.selector, { label: field.value });
            break;
          case 'file':
            // Lever has custom file upload handling
            const fileInput = page.locator(field.selector);
            await fileInput.setInputFiles(field.value);
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
        await this.delay(400, 900);
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
        : 'All fields filled successfully',
    };
  }

  private mapFieldToAnswer(
    label: string,
    type: string,
    answers: AnswersPack
  ): { value: string; type: 'text' | 'select' | 'checkbox' | 'file' | 'textarea' } | null {
    const lowerLabel = label.toLowerCase();

    // Personal info - Lever uses specific field names
    const personal = answers.personal || {};
    if (lowerLabel.includes('name')) {
      if (lowerLabel.includes('first')) {
        return { value: personal.firstName || '', type: 'text' };
      }
      if (lowerLabel.includes('last')) {
        return { value: personal.lastName || '', type: 'text' };
      }
      // Full name field
      return { value: `${personal.firstName || ''} ${personal.lastName || ''}`.trim(), type: 'text' };
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
    if (lowerLabel.includes('website') || lowerLabel.includes('portfolio') || lowerLabel.includes('url')) {
      return { value: personal.portfolio || '', type: 'text' };
    }

    // Location fields
    if (lowerLabel.includes('city')) {
      return { value: answers.location?.city || '', type: 'text' };
    }
    if (lowerLabel.includes('state') || lowerLabel.includes('province')) {
      return { value: answers.location?.state || '', type: 'text' };
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