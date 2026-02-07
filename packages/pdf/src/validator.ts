import { readFileSync, statSync } from 'fs';
import type { CompileResult } from '@applypilot/core';

export interface ValidationOptions {
  maxPages?: number;
  maxFileSize?: number; // in bytes
  requiredContent?: string[];
}

export class PDFValidator {
  private options: ValidationOptions;

  constructor(options: ValidationOptions = {}) {
    this.options = {
      maxPages: 2,
      maxFileSize: 5 * 1024 * 1024, // 5MB
      ...options,
    };
  }

  /**
   * Validate compiled PDF
   */
  async validate(pdfPath: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    stats: {
      fileSize: number;
      pageCount?: number;
    };
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check file exists
    try {
      const stats = statSync(pdfPath);

      // Check file size
      if (this.options.maxFileSize && stats.size > this.options.maxFileSize) {
        errors.push(`PDF file size (${stats.size} bytes) exceeds maximum (${this.options.maxFileSize} bytes)`);
      }

      // TODO: Implement page count validation (requires PDF parsing library)

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        stats: {
          fileSize: stats.size,
        },
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to read PDF file: ${error}`],
        warnings: [],
        stats: { fileSize: 0 },
      };
    }
  }

  /**
   * Validate compilation result
   */
  validateCompileResult(result: CompileResult): {
    valid: boolean;
    actionableErrors: string[];
  } {
    if (result.success) {
      return { valid: true, actionableErrors: [] };
    }

    const actionableErrors = result.errors.map((error) => {
      // Provide actionable hints for common errors
      if (error.includes('File not found')) {
        return `${error}\n  Hint: Check that all required files are in the same directory as your .tex file`;
      }
      if (error.includes('Undefined control sequence')) {
        return `${error}\n  Hint: You may be missing a required package. Check your LaTeX template.`;
      }
      if (error.includes('Overfull') || error.includes('Underfull')) {
        return `${error}\n  Hint: This is a warning about text spacing. Usually safe to ignore.`;
      }
      return error;
    });

    return { valid: false, actionableErrors };
  }
}
