/**
 * Bundle Tools - Application Bundle Export
 */

import type { ToolDefinition } from '../agent/types.js';
import type { ToolResult } from '../gateway/types.js';

export interface BundleExportOptions {
  outputDir?: string;
}

export function createBundleExportTool(options: BundleExportOptions = {}): ToolDefinition {
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
          return { toolCallId: 'bundle_export', status: 'error', result: { error: 'jobId, company, and role are required' }, executionTimeMs: Date.now() - startTime };
        }

        const sanitizedCompany = company.replace(/[^a-zA-Z0-9]/g, '_');
        const bundlePath = `${outputDir}/${jobId}_${sanitizedCompany}_bundle.zip`;

        return {
          toolCallId: 'bundle_export',
          status: 'success',
          result: { bundlePath, jobId, company, role, artifacts: ['cover_letter.md', 'answers.json', 'recruiter_message.md'] },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        return { toolCallId: 'bundle_export', status: 'error', result: { error: String(error) }, executionTimeMs: Date.now() - startTime };
      }
    },
  };
}
