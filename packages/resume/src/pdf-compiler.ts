/**
 * PDF Compiler - LaTeX to PDF Compilation Service
 *
 * Compiles LaTeX resumes to PDF using MiKTeX/TeX Live.
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import type { PdfCompilationResult, PdfError, PdfWarning } from './types.js';

export interface PdfCompilerOptions {
  texCommand: string;
  outputDirectory?: string;
  timeoutMs: number;
  shellEscape: boolean;
}

export class PdfCompiler {
  private texCommand: string;
  private outputDirectory?: string;
  private timeoutMs: number;
  private shellEscape: boolean;

  constructor(options: Partial<PdfCompilerOptions> = {}) {
    this.texCommand = options.texCommand ?? 'pdflatex';
    this.outputDirectory = options.outputDirectory;
    this.timeoutMs = options.timeoutMs ?? 60000;
    this.shellEscape = options.shellEscape ?? false;
  }

  /**
   * Compile LaTeX file to PDF
   */
  async compile(latexPath: string): Promise<PdfCompilationResult> {
    const startTime = Date.now();

    if (!existsSync(latexPath)) {
      return {
        success: false,
        errors: [{ message: `LaTeX file not found: ${latexPath}` }],
        warnings: [],
        compilationTimeMs: 0,
      };
    }

    const workingDir = path.dirname(latexPath);
    const filename = path.basename(latexPath);
    const outputDir = this.outputDirectory ?? workingDir;

    try {
      // Run LaTeX compilation (2 passes for references)
      const pass1 = await this.runLatex(workingDir, filename, outputDir);
      if (!pass1.success) {
        return {
          success: false,
          pdfPath: undefined,
          logPath: pass1.logPath,
          errors: pass1.errors,
          warnings: pass1.warnings,
          compilationTimeMs: Date.now() - startTime,
        };
      }

      // Second pass for references
      const pass2 = await this.runLatex(workingDir, filename, outputDir);

      const pdfPath = path.resolve(outputDir, filename.replace('.tex', '.pdf'));
      const logPath = path.resolve(outputDir, filename.replace('.tex', '.log'));

      return {
        success: pass2.success && existsSync(pdfPath),
        pdfPath: existsSync(pdfPath) ? pdfPath : undefined,
        logPath: existsSync(logPath) ? logPath : undefined,
        errors: pass2.errors,
        warnings: pass2.warnings,
        compilationTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        errors: [
          {
            message: error instanceof Error ? error.message : 'Compilation failed',
          },
        ],
        warnings: [],
        compilationTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Run a single LaTeX compilation pass
   */
  private async runLatex(
    workingDir: string,
    filename: string,
    outputDir: string
  ): Promise<{
    success: boolean;
    logPath?: string;
    errors: PdfError[];
    warnings: PdfWarning[];
  }> {
    return new Promise((resolve, reject) => {
      const args = [
        '-interaction=nonstopmode',
        '-halt-on-error',
        `-output-directory=${outputDir}`,
      ];

      if (this.shellEscape) {
        args.push('-shell-escape');
      }

      args.push(filename);

      const childProcess = spawn(this.texCommand, args, {
        cwd: workingDir,
        timeout: this.timeoutMs,
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code) => {
        const logFilePath = path.resolve(outputDir, filename.replace('.tex', '.log'));
        const logContent = existsSync(logFilePath) ? readFileSync(logFilePath, 'utf-8') : stdout;

        const { errors, warnings } = this.parseLog(logContent);

        resolve({
          success: code === 0,
          logPath: existsSync(logFilePath) ? logFilePath : undefined,
          errors,
          warnings,
        });
      });

      childProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Parse LaTeX log for errors and warnings
   */
  private parseLog(logContent: string): {
    errors: PdfError[];
    warnings: PdfWarning[];
  } {
    const errors: PdfError[] = [];
    const warnings: PdfWarning[] = [];

    const lines = logContent.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Error patterns
      if (line.includes('!')) {
        errors.push({
          line: i + 1,
          message: line.replace('!', '').trim(),
          context: lines.slice(Math.max(0, i - 2), i + 3).join('\n'),
        });
      }

      // Warning patterns
      if (line.includes('Warning:') || line.includes('LaTeX Warning:')) {
        warnings.push({
          line: i + 1,
          message: line.trim(),
          context: lines.slice(Math.max(0, i - 1), i + 2).join('\n'),
        });
      }

      // Overfull/underfull hbox warnings
      if (line.includes('Overfull') || line.includes('Underfull')) {
        warnings.push({
          line: i + 1,
          message: line.trim(),
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Check if LaTeX compiler is available
   */
  async checkCompiler(): Promise<boolean> {
    return new Promise((resolve) => {
      const childProcess = spawn(this.texCommand, ['--version'], { timeout: 5000 });

      childProcess.on('close', (code) => {
        resolve(code === 0);
      });

      childProcess.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Get compiler version
   */
  async getCompilerVersion(): Promise<string | null> {
    return new Promise((resolve) => {
      const childProcess = spawn(this.texCommand, ['--version'], { timeout: 5000 });

      let output = '';

      childProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      childProcess.on('close', (code) => {
        if (code === 0) {
          // Extract version from first line
          const firstLine = output.split('\n')[0];
          resolve(firstLine.trim());
        } else {
          resolve(null);
        }
      });

      childProcess.on('error', () => {
        resolve(null);
      });
    });
  }

  /**
   * Validate LaTeX file before compilation
   */
  validateLatex(latexPath: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!existsSync(latexPath)) {
      errors.push(`File not found: ${latexPath}`);
      return { valid: false, errors };
    }

    const content = readFileSync(latexPath, 'utf-8');

    // Check for document class
    if (!content.includes('\\documentclass')) {
      errors.push('Missing \\documentclass declaration');
    }

    // Check for document environment
    if (!content.includes('\\begin{document}') || !content.includes('\\end{document}')) {
      errors.push('Missing document environment');
    }

    // Check for unclosed environments
    const envBegin = (content.match(/\\begin\{/g) || []).length;
    const envEnd = (content.match(/\\end\{/g) || []).length;
    if (envBegin !== envEnd) {
      errors.push(`Unbalanced environments: ${envBegin} begin, ${envEnd} end`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Update compiler configuration
   */
  updateConfig(config: Partial<PdfCompilerOptions>): void {
    if (config.texCommand) this.texCommand = config.texCommand;
    if (config.outputDirectory) this.outputDirectory = config.outputDirectory;
    if (config.timeoutMs) this.timeoutMs = config.timeoutMs;
    if (config.shellEscape !== undefined) this.shellEscape = config.shellEscape;
  }
}

export default PdfCompiler;
