/**
 * Resume Tools - Resume Tailoring and PDF Compilation
 */

import type { ToolDefinition } from '../agent/types.js';
import type { ToolResult } from '../gateway/types.js';

export interface TailorResumeOptions {
  templatePath?: string;
  achievementBankPath?: string;
}

export interface CompilePDFOptions {
  compiler?: 'pdflatex' | 'xelatex' | 'lualatex';
  timeoutMs?: number;
}

export function createTailorResumeTool(options: TailorResumeOptions = {}): ToolDefinition {
  return {
    name: 'tailor_resume',
    description: 'Tailor a LaTeX resume for a specific job description.',
    parameters: {
      type: 'object',
      properties: {
        baseLatex: { type: 'string', description: 'Base LaTeX resume content' },
        requirements: { type: 'string', description: 'Job requirements from analyze_jd as JSON' },
        strategy: { type: 'string', description: 'Strategy: marker or achievement_bank' },
      },
      required: ['baseLatex', 'requirements'],
    },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const startTime = Date.now();
      try {
        const baseLatex = String(args.baseLatex || '');
        const requirementsStr = String(args.requirements || '{}');
        const requirements = JSON.parse(requirementsStr) as Record<string, unknown>;
        
        if (!baseLatex.trim()) {
          return { toolCallId: 'tailor_resume', status: 'error', result: { error: 'Base LaTeX content is required' }, executionTimeMs: Date.now() - startTime };
        }

        // Simulate tailoring
        const skills = (requirements.mustHaveSkills as string[]) || [];
        const tailoredLatex = baseLatex.replace(/\\section\{Skills\}([\s\S]*?)\\section/, `\\section{Skills}\n${skills.join(', ')}\n\\section`);

        return {
          toolCallId: 'tailor_resume',
          status: 'success',
          result: { tailoredLatex, changes: [`Updated skills section with: ${skills.join(', ')}`] },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        return { toolCallId: 'tailor_resume', status: 'error', result: { error: String(error) }, executionTimeMs: Date.now() - startTime };
      }
    },
  };
}

export function createCompilePDFTool(options: CompilePDFOptions = {}): ToolDefinition {
  const { compiler = 'pdflatex', timeoutMs = 30000 } = options;

  return {
    name: 'compile_pdf',
    description: 'Compile a LaTeX resume to PDF.',
    parameters: {
      type: 'object',
      properties: {
        latexContent: { type: 'string', description: 'LaTeX content to compile' },
        outputName: { type: 'string', description: 'Output filename' },
        maxPages: { type: 'number', description: 'Maximum allowed pages' },
      },
      required: ['latexContent'],
    },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const startTime = Date.now();
      try {
        const latexContent = String(args.latexContent || '');
        const outputName = String(args.outputName || 'tailored_resume');
        
        if (!latexContent.trim()) {
          return { toolCallId: 'compile_pdf', status: 'error', result: { error: 'LaTeX content is required' }, executionTimeMs: Date.now() - startTime };
        }

        // Simulate compilation
        const pdfPath = `./output/${outputName}.pdf`;

        return {
          toolCallId: 'compile_pdf',
          status: 'success',
          result: { pdfPath, pageCount: 1, compiler, compileLog: 'Compilation successful' },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        return { toolCallId: 'compile_pdf', status: 'error', result: { error: String(error) }, executionTimeMs: Date.now() - startTime };
      }
    },
  };
}
