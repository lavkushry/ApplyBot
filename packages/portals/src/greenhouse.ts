import type { Page } from 'playwright';
import type { AnswersPack, UserProfile } from '@applypilot/core';
import { BasePortalConnector, type ConnectorOptions, type FillResult } from './base-connector.js';

export class GreenhouseConnector extends BasePortalConnector {
  constructor(options: ConnectorOptions) {
    super(options);
  }

  supports(url: string): boolean {
    return url.includes('greenhouse.io') || url.includes('boards.greenhouse.io');
  }

  getName(): string {
    return 'Greenhouse';
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

    // Check if we're on an application form
    const formExists = await page.locator('#application_form, form[action*="/applications"]').count() > 0;
    if (!formExists) {
      warnings.push('Could not detect Greenhouse application form. Page structure may have changed.');
      return { canProceed: false, fields, warnings };
    }

    // Extract all form fields
    const formFields = await page.evaluate(() => {
      const results: Array<{
        selector: string;
        type: string;
        label: string;
        required: boolean;
      }> = [];

      // Text inputs
      document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"]').forEach((el, i) => {
        const input = el as HTMLInputElement;
        const label = document.querySelector(`label[for="${input.id}"]`)?.textContent || 
                     input.placeholder || 
                     input.name ||
                     `Field ${i}`;
        results.push({
          selector: `#${input.id}, input[name="${input.name}"]`,
          type: 'text',
          label: label.trim(),
          required: input.required,
        });
      });

      // Textareas
      document.querySelectorAll('textarea').forEach((el, i) => {
        const textarea = el as HTMLTextAreaElement;
        const label = document.querySelector(`label[for="${textarea.id}"]`)?.textContent || 
                     textarea.placeholder || 
                     `Textarea ${i}`;
        results.push({
          selector: `#${textarea.id}, textarea[name="${textarea.name}"]`,
          type: 'textarea',
          label: label.trim(),
          required: textarea.required,
        });
      });

      // Selects
      document.querySelectorAll('select').forEach((el, i) => {
        const select = el as HTMLSelectElement;
        const label = document.querySelector(`label[for="${select.id}"]`)?.textContent || 
                     `Select ${i}`;
        results.push({
          selector: `#${select.id}, select[name="${select.name}"]`,
          type: 'select',
          label: label.trim(),
          required: select.required,
        });
      });

      // File inputs
      document.querySelectorAll('input[type="file"]').forEach((el, i) => {
        const input = el as HTMLInputElement;
        const label = document.querySelector(`label[for="${input.id}"]`)?.textContent || 
                     `File ${i}`;
        results.push({
          selector: `#${input.id}, input[type="file"][name="${input.name}"]`,
          type: 'file',
          label: label.trim(),
          required: input.required,
        });
      });

      // Checkboxes
      document.querySelectorAll('input[type="checkbox"]').forEach((el, i) => {
        const input = el as HTMLInputElement;
        const label = document.querySelector(`label[for="${input.id}"]`)?.textContent || 
                     `Checkbox ${i}`;
        results.push({
          selector: `#${input.id}, input[type="checkbox"][name="${input.name}"]`,
          type: 'checkbox',
          label: label.trim(),
          required: input.required,
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

    // Check for resume upload field
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
            await page.selectOption(field.selector, field.value);
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
        await this.delay(300, 800);
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
      return { value: answers.location?.state || '', type: 'text' };
    }
    if (lowerLabel.includes('country')) {
      return { value: answers.location?.country || '', type: 'text' };
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