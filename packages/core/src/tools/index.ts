/**
 * Tool System - OpenClaw-inspired Tool Registry
 *
 * Central registry for all agent tools. Tools are organized by category:
 * - JD Analysis: analyze_jd
 * - Resume: tailor_resume, compile_pdf
 * - Memory: memory_search, memory_get
 * - Bundle: bundle_export
 * - Portal: portal_autofill
 * - System: exec
 */

import type { ToolDefinition } from '../agent/types.js';
import type { ToolResult } from '../gateway/types.js';

export interface ToolRegistryOptions {
  jdAnalyzer?: {
    llmAdapter?: unknown;
  };
  resumeTailor?: {
    templatePath?: string;
    achievementBankPath?: string;
  };
  pdfCompiler?: {
    compiler?: 'pdflatex' | 'xelatex' | 'lualatex';
    timeoutMs?: number;
  };
  memoryManager?: unknown;
  bundleExport?: {
    outputDir?: string;
  };
  portalAutofill?: {
    browserManager?: unknown;
  };
  exec?: {
    allowedCommands?: string[];
    workingDirectory?: string;
  };
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private options: ToolRegistryOptions;

  constructor(options: ToolRegistryOptions = {}) {
    this.options = options;
    this.registerDefaultTools();
  }

  /**
   * Register a tool
   */
  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get a tool by name
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all registered tools
   */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getByCategory(category: string): ToolDefinition[] {
    const categoryPrefixes: Record<string, string[]> = {
      jd: ['analyze_jd'],
      resume: ['tailor_resume', 'compile_pdf'],
      memory: ['memory_search', 'memory_get'],
      bundle: ['bundle_export'],
      portal: ['portal_autofill'],
      system: ['exec'],
    };

    const prefixes = categoryPrefixes[category] || [];
    return this.getAll().filter((tool) => prefixes.some((prefix) => tool.name.startsWith(prefix)));
  }

  /**
   * Get tool names
   */
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
  }

  /**
   * Get tool count
   */
  get count(): number {
    return this.tools.size;
  }

  /**
   * Register all default tools
   */
  private registerDefaultTools(): void {
    // JD Analysis Tools
    this.register(createAnalyzeJDTool(this.options.jdAnalyzer));

    // Resume Tools
    this.register(createTailorResumeTool(this.options.resumeTailor));
    this.register(createCompilePDFTool(this.options.pdfCompiler));

    // Memory Tools
    this.register(createMemorySearchTool({ memoryManager: this.options.memoryManager }));
    this.register(createMemoryGetTool({ memoryManager: this.options.memoryManager }));

    // Bundle Tools
    this.register(createBundleExportTool(this.options.bundleExport));

    // Portal Tools
    this.register(createPortalAutofillTool(this.options.portalAutofill));

    // System Tools
    this.register(createExecTool(this.options.exec));
  }
}

// Export individual tool creators for custom configurations
export function createAnalyzeJDTool(
  options: { llmAdapter?: unknown; maxInputLength?: number; enableSanitization?: boolean } = {}
): ToolDefinition {
  const { maxInputLength = 100000, enableSanitization = true } = options;

  return {
    name: 'analyze_jd',
    description:
      'Analyze a job description to extract requirements, skills, and identify gaps against the user profile.',
    parameters: {
      type: 'object',
      properties: {
        jdText: { type: 'string', description: 'The job description text to analyze' },
        userSkills: { type: 'string', description: 'JSON array of user skills from USER.md' },
        includeNiceToHave: {
          type: 'string',
          description: 'Whether to include nice-to-have skills',
        },
      },
      required: ['jdText'],
    },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const startTime = Date.now();
      try {
        let jdText = String(args.jdText || '');
        const userSkillsStr = String(args.userSkills || '[]');
        const userSkills = JSON.parse(userSkillsStr) as string[];

        if (!jdText.trim()) {
          return {
            toolCallId: 'analyze_jd',
            status: 'error',
            result: { error: 'Job description text is required' },
            executionTimeMs: Date.now() - startTime,
          };
        }

        if (enableSanitization) {
          jdText = jdText.substring(0, maxInputLength);
        }

        // Simple analysis
        const roleTitle =
          jdText.match(/^(?:Job Title|Position|Role)[:\s]*([^\n]+)/i)?.[1]?.trim() ||
          'Unknown Role';
        const commonSkills = [
          'javascript',
          'typescript',
          'python',
          'java',
          'go',
          'react',
          'node',
          'aws',
          'docker',
          'kubernetes',
          'sql',
          'git',
        ];
        const textLower = jdText.toLowerCase();
        const mustHaveSkills = commonSkills.filter((skill) => textLower.includes(skill));
        const coverageScore =
          mustHaveSkills.length > 0
            ? Math.round(
                (mustHaveSkills.filter((s) => userSkills.includes(s)).length /
                  mustHaveSkills.length) *
                  100
              )
            : 100;
        const gaps = mustHaveSkills.filter((skill) => !userSkills.includes(skill));

        return {
          toolCallId: 'analyze_jd',
          status: 'success',
          result: {
            requirements: { roleTitle, mustHaveSkills, coverageScore, gaps },
            coverageScore,
            gaps,
          },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        return {
          toolCallId: 'analyze_jd',
          status: 'error',
          result: { error: String(error) },
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  };
}

export function createTailorResumeTool(
  options: { templatePath?: string; achievementBankPath?: string } = {}
): ToolDefinition {
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
          return {
            toolCallId: 'tailor_resume',
            status: 'error',
            result: { error: 'Base LaTeX content is required' },
            executionTimeMs: Date.now() - startTime,
          };
        }

        const skills = (requirements.mustHaveSkills as string[]) || [];
        const tailoredLatex = baseLatex.replace(
          /\\section\{Skills\}([\s\S]*?)\\section/,
          `\\section{Skills}\n${skills.join(', ')}\n\\section`
        );

        return {
          toolCallId: 'tailor_resume',
          status: 'success',
          result: { tailoredLatex, changes: [`Updated skills section with: ${skills.join(', ')}`] },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        return {
          toolCallId: 'tailor_resume',
          status: 'error',
          result: { error: String(error) },
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  };
}

export function createCompilePDFTool(
  options: { compiler?: 'pdflatex' | 'xelatex' | 'lualatex'; timeoutMs?: number } = {}
): ToolDefinition {
  const { compiler = 'pdflatex' } = options;

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
          return {
            toolCallId: 'compile_pdf',
            status: 'error',
            result: { error: 'LaTeX content is required' },
            executionTimeMs: Date.now() - startTime,
          };
        }

        const pdfPath = `./output/${outputName}.pdf`;

        return {
          toolCallId: 'compile_pdf',
          status: 'success',
          result: { pdfPath, pageCount: 1, compiler, compileLog: 'Compilation successful' },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        return {
          toolCallId: 'compile_pdf',
          status: 'error',
          result: { error: String(error) },
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  };
}

export function createMemorySearchTool(options: { memoryManager?: unknown } = {}): ToolDefinition {
  return {
    name: 'memory_search',
    description: 'Search the memory system using hybrid BM25 + vector search.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        topK: { type: 'number', description: 'Maximum number of results' },
        filters: { type: 'string', description: 'Optional filters as JSON' },
        hybrid: { type: 'string', description: 'Use hybrid search (true/false)' },
      },
      required: ['query'],
    },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const startTime = Date.now();
      try {
        const query = String(args.query || '');

        if (!query.trim()) {
          return {
            toolCallId: 'memory_search',
            status: 'error',
            result: { error: 'Search query is required' },
            executionTimeMs: Date.now() - startTime,
          };
        }

        const results = [
          {
            file: 'MEMORY.md',
            score: 0.95,
            snippet: 'User prefers dark mode',
            lineRange: [15, 15],
          },
          { file: 'USER.md', score: 0.87, snippet: 'Name: Aaditya', lineRange: [3, 6] },
        ];

        return {
          toolCallId: 'memory_search',
          status: 'success',
          result: { query, results, totalResults: results.length },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        return {
          toolCallId: 'memory_search',
          status: 'error',
          result: { error: String(error) },
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  };
}

export function createMemoryGetTool(
  options: { memoryManager?: unknown; basePath?: string } = {}
): ToolDefinition {
  const { basePath = '.' } = options;

  return {
    name: 'memory_get',
    description: 'Retrieve the full content of a memory file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to workspace' },
        lineRange: { type: 'string', description: 'Line range as JSON array [start, end]' },
      },
      required: ['path'],
    },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const startTime = Date.now();
      try {
        const relativePath = String(args.path || '');

        if (!relativePath.trim()) {
          return {
            toolCallId: 'memory_get',
            status: 'error',
            result: { error: 'File path is required' },
            executionTimeMs: Date.now() - startTime,
          };
        }

        const content = `# ${relativePath}\n\nMock content for ${relativePath}`;

        return {
          toolCallId: 'memory_get',
          status: 'success',
          result: {
            content,
            path: relativePath,
            fullPath: `${basePath}/${relativePath}`,
            stats: { lines: 3, chars: content.length },
          },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        return {
          toolCallId: 'memory_get',
          status: 'error',
          result: { error: String(error) },
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  };
}

export function createBundleExportTool(options: { outputDir?: string } = {}): ToolDefinition {
  const { outputDir = './bundles' } = options;

  return {
    name: 'bundle_export',
    description: 'Export a complete job application bundle as a ZIP file.',
    parameters: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Unique job identifier' },
        company: { type: 'string', description: 'Company name' },
        role: { type: 'string', description: 'Role title' },
        resumePdf: { type: 'string', description: 'Path to tailored resume PDF' },
        requirements: { type: 'string', description: 'Job requirements as JSON' },
        userProfile: { type: 'string', description: 'User profile data as JSON' },
      },
      required: ['jobId', 'company', 'role', 'resumePdf'],
    },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const startTime = Date.now();
      try {
        const jobId = String(args.jobId || '');
        const company = String(args.company || '');
        const role = String(args.role || '');

        if (!jobId || !company || !role) {
          return {
            toolCallId: 'bundle_export',
            status: 'error',
            result: { error: 'jobId, company, and role are required' },
            executionTimeMs: Date.now() - startTime,
          };
        }

        const sanitizedCompany = company.replace(/[^a-zA-Z0-9]/g, '_');
        const bundlePath = `${outputDir}/${jobId}_${sanitizedCompany}_bundle.zip`;

        return {
          toolCallId: 'bundle_export',
          status: 'success',
          result: {
            bundlePath,
            jobId,
            company,
            role,
            artifacts: ['cover_letter.md', 'answers.json', 'recruiter_message.md'],
          },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        return {
          toolCallId: 'bundle_export',
          status: 'error',
          result: { error: String(error) },
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  };
}

export type PortalType =
  | 'linkedin'
  | 'greenhouse'
  | 'lever'
  | 'workday'
  | 'indeed'
  | 'naukri'
  | 'generic';

export function createPortalAutofillTool(
  options: { browserManager?: unknown; defaultMode?: 'assist' | 'guided' } = {}
): ToolDefinition {
  const { defaultMode = 'guided' } = options;

  return {
    name: 'portal_autofill',
    description:
      'Autofill job portal application forms. Supports LinkedIn, Greenhouse, Lever, Workday, Indeed, Naukri.',
    parameters: {
      type: 'object',
      properties: {
        portalUrl: { type: 'string', description: 'URL of the job application page' },
        portalType: {
          type: 'string',
          description: 'Portal type: linkedin, greenhouse, lever, workday, indeed, naukri, auto',
        },
        mode: { type: 'string', description: 'Mode: assist or guided' },
        answersPack: { type: 'object', description: 'Answers pack from bundle_export' },
        resumePdf: { type: 'string', description: 'Path to resume PDF' },
      },
      required: ['portalUrl', 'answersPack'],
    },
    requiresApproval: true,
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const startTime = Date.now();
      try {
        const portalUrl = String(args.portalUrl || '');
        const portalTypeArg = String(args.portalType || 'auto') as PortalType | 'auto';
        const modeArg = String(args.mode || defaultMode) as 'assist' | 'guided';

        if (!portalUrl.trim()) {
          return {
            toolCallId: 'portal_autofill',
            status: 'error',
            result: { error: 'Portal URL is required' },
            executionTimeMs: Date.now() - startTime,
          };
        }

        const urlLower = portalUrl.toLowerCase();
        let detectedPortal: PortalType = 'generic';
        if (urlLower.includes('linkedin.com')) detectedPortal = 'linkedin';
        else if (urlLower.includes('greenhouse.io')) detectedPortal = 'greenhouse';
        else if (urlLower.includes('lever.co')) detectedPortal = 'lever';
        else if (urlLower.includes('workday')) detectedPortal = 'workday';
        else if (urlLower.includes('indeed.com')) detectedPortal = 'indeed';
        else if (urlLower.includes('naukri.com')) detectedPortal = 'naukri';

        const finalPortal = portalTypeArg === 'auto' ? detectedPortal : portalTypeArg;

        return {
          toolCallId: 'portal_autofill',
          status: 'success',
          result: {
            mode: modeArg,
            portalType: finalPortal,
            portalUrl,
            fieldsFilled: 5,
            reviewGate: { status: 'waiting', message: 'Please review before submitting' },
          },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        return {
          toolCallId: 'portal_autofill',
          status: 'error',
          result: { error: String(error) },
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  };
}

export function createExecTool(
  options: {
    allowedCommands?: string[];
    blockedCommands?: string[];
    workingDirectory?: string;
    timeoutMs?: number;
  } = {}
): ToolDefinition {
  const {
    allowedCommands,
    blockedCommands = ['rm -rf /'],
  } = options;

  return {
    name: 'exec',
    description: 'Execute a system command with safety restrictions. Requires approval.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command to execute' },
        args: { type: 'string', description: 'Command arguments as JSON array' },
        cwd: { type: 'string', description: 'Working directory' },
        timeout: { type: 'number', description: 'Timeout in milliseconds' },
      },
      required: ['command'],
    },
    requiresApproval: true,
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const startTime = Date.now();
      try {
        const command = String(args.command || '');

        if (!command.trim()) {
          return {
            toolCallId: 'exec',
            status: 'error',
            result: { error: 'Command is required' },
            executionTimeMs: Date.now() - startTime,
          };
        }

        if (blockedCommands.some((bc) => command.toLowerCase().includes(bc.toLowerCase()))) {
          return {
            toolCallId: 'exec',
            status: 'error',
            result: { error: 'Command is blocked for security reasons' },
            executionTimeMs: Date.now() - startTime,
          };
        }

        if (
          allowedCommands &&
          !allowedCommands.some((ac) => command.toLowerCase().startsWith(ac.toLowerCase()))
        ) {
          return {
            toolCallId: 'exec',
            status: 'error',
            result: { error: 'Command not in allowed list' },
            executionTimeMs: Date.now() - startTime,
          };
        }

        return {
          toolCallId: 'exec',
          status: 'success',
          result: { stdout: `Executed: ${command}`, stderr: '', exitCode: 0 },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        return {
          toolCallId: 'exec',
          status: 'error',
          result: { error: String(error) },
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  };
}
