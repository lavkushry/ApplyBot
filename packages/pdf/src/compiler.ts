import { spawn } from 'child_process';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { dirname, join, basename } from 'path';
import { platform } from 'os';
import type { CompileResult } from '@applypilot/core';

export interface CompilerOptions {
  engine: 'pdflatex' | 'xelatex' | 'lualatex';
  maxRuns: number;
  timeout: number;
  outputDirectory?: string;
}

export interface LaTeXCheckResult {
  available: boolean;
  engine: string;
  version?: string;
  path?: string;
  error?: string;
}

export class PDFCompiler {
  private options: CompilerOptions;

  constructor(options: CompilerOptions) {
    this.options = options;
  }

  /**
   * Compile LaTeX file to PDF
   */
  async compile(texPath: string, outputPath?: string): Promise<CompileResult> {
    const outputDir = outputPath ? dirname(outputPath) : this.options.outputDirectory || dirname(texPath);
    
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const finalOutputPath = outputPath || join(outputDir, 'resume.pdf');
    const logPath = finalOutputPath.replace('.pdf', '.log');

    // Check if LaTeX engine is available
    const check = await this.checkEngine();
    if (!check.available) {
      return {
        success: false,
        pdfPath: finalOutputPath,
        logPath,
        errors: [`LaTeX engine not found: ${check.error}. Please install MiKTeX or TeX Live.`],
        warnings: [],
      };
    }

    let lastResult: CompileResult | null = null;

    // Run compilation multiple times if needed (for references, TOC, etc.)
    for (let run = 1; run <= this.options.maxRuns; run++) {
      const result = await this.runCompilation(texPath, outputDir, finalOutputPath, logPath, run);
      lastResult = result;

      if (!result.success) {
        return result;
      }

      // Check if we need to re-run (for references)
      const needsRerun = this.checkNeedsRerun(result);
      if (!needsRerun) {
        break;
      }
    }

    return lastResult!;
  }

  /**
   * Run a single compilation
   */
  private async runCompilation(
    texPath: string,
    outputDir: string,
    finalOutputPath: string,
    logPath: string,
    runNumber: number
  ): Promise<CompileResult> {
    return new Promise((resolve) => {
      const args = [
        '-interaction=nonstopmode',
        '-file-line-error',
        '-halt-on-error',
        `-output-directory=${outputDir}`,
        texPath,
      ];

      const process = spawn(this.options.engine, args);
      let stdout = '';
      let stderr = '';
      
      const timeout = setTimeout(() => {
        process.kill();
        resolve({
          success: false,
          pdfPath: finalOutputPath,
          logPath,
          errors: [`Compilation timeout (>${this.options.timeout}ms) on run ${runNumber}`],
          warnings: [],
        });
      }, this.options.timeout);

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        clearTimeout(timeout);
        
        const output = stdout + stderr;
        const errors = this.parseErrors(output);
        const warnings = this.parseWarnings(output);
        const pdfExists = existsSync(finalOutputPath);
        const success = code === 0 && pdfExists;

        // Write log file
        writeFileSync(logPath, output, 'utf-8');

        resolve({
          success,
          pdfPath: finalOutputPath,
          logPath,
          errors,
          warnings,
        });
      });

      process.on('error', (error) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          pdfPath: finalOutputPath,
          logPath,
          errors: [`Process error: ${error.message}`],
          warnings: [],
        });
      });
    });
  }

  /**
   * Check if compilation needs to be re-run
   */
  private checkNeedsRerun(result: CompileResult): boolean {
    // Check for common re-run indicators in log
    const rerunIndicators = [
      'Rerun to get cross-references right',
      'Rerun to get outlines right',
      'There were undefined references',
      'Label(s) may have changed',
    ];

    const logContent = result.errors.join(' ') + result.warnings.join(' ');
    return rerunIndicators.some(indicator => logContent.includes(indicator));
  }

  /**
   * Parse errors from LaTeX output
   */
  private parseErrors(output: string): string[] {
    const errors: string[] = [];
    const lines = output.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Match error patterns
      if (line.startsWith('!') || line.includes('Error:') || line.includes('Fatal error')) {
        const errorLine = line.trim();
        errors.push(errorLine);
        
        // Include context (next few lines)
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
          const contextLine = lines[j].trim();
          if (contextLine && !contextLine.startsWith('!')) {
            errors.push('  ' + contextLine);
          }
        }
      }
      
      // Match file:line:error pattern
      const fileLineError = line.match(/^(.+\.tex):(\d+):\s*(.+)$/);
      if (fileLineError && (line.includes('error') || line.includes('Error'))) {
        errors.push(`${fileLineError[1]}:${fileLineError[2]}: ${fileLineError[3]}`);
      }
    }

    return [...new Set(errors)]; // Remove duplicates
  }

  /**
   * Parse warnings from LaTeX output
   */
  private parseWarnings(output: string): string[] {
    const warnings: string[] = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes('Warning:') || 
          line.includes('Package') ||
          line.includes('Overfull') ||
          line.includes('Underfull')) {
        warnings.push(line.trim());
      }
    }

    return warnings;
  }

  /**
   * Check if LaTeX engine is available
   */
  async checkEngine(): Promise<LaTeXCheckResult> {
    const engines = platform() === 'win32' 
      ? [this.options.engine, `${this.options.engine}.exe`]
      : [this.options.engine];

    for (const engine of engines) {
      try {
        const result = await this.checkEngineCommand(engine);
        if (result.available) {
          return result;
        }
      } catch {
        continue;
      }
    }

    return {
      available: false,
      engine: this.options.engine,
      error: `${this.options.engine} not found in PATH. Please install MiKTeX (Windows) or TeX Live (macOS/Linux).`,
    };
  }

  /**
   * Check specific engine command
   */
  private async checkEngineCommand(engine: string): Promise<LaTeXCheckResult> {
    return new Promise((resolve) => {
      const process = spawn(engine, ['--version']);
      let output = '';
      let errorOutput = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          const version = this.parseVersion(output);
          resolve({
            available: true,
            engine,
            version,
          });
        } else {
          resolve({
            available: false,
            engine,
            error: errorOutput || 'Unknown error',
          });
        }
      });

      process.on('error', () => {
        resolve({
          available: false,
          engine,
          error: 'Command not found',
        });
      });
    });
  }

  /**
   * Parse version from engine output
   */
  private parseVersion(output: string): string | undefined {
    const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
    return versionMatch ? versionMatch[1] : undefined;
  }

  /**
   * Get installation instructions for the current platform
   */
  static getInstallInstructions(): string {
    const plat = platform();
    
    switch (plat) {
      case 'win32':
        return `
LaTeX is not installed. To install on Windows:

1. Download MiKTeX from: https://miktex.org/download
2. Run the installer and follow the prompts
3. Add MiKTeX to your PATH environment variable
4. Restart your terminal

Or install TeX Live from: https://tug.org/texlive/
`;
      case 'darwin':
        return `
LaTeX is not installed. To install on macOS:

1. Using Homebrew: brew install --cask mactex
2. Or download from: https://tug.org/mactex/
3. Restart your terminal after installation
`;
      case 'linux':
        return `
LaTeX is not installed. To install on Linux:

Ubuntu/Debian: sudo apt-get install texlive-full
Fedora: sudo dnf install texlive-scheme-full
Arch: sudo pacman -S texlive-most texlive-lang
`;
      default:
        return 'Please install a LaTeX distribution (MiKTeX or TeX Live)';
    }
  }
}