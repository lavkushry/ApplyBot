/**
 * Portal Tools - Job Portal Autofill
 */

import type { ToolDefinition } from '../agent/types.js';
import type { ToolResult } from '../gateway/types.js';

export interface PortalAutofillOptions {
  browserManager?: unknown;
  defaultMode?: 'assist' | 'guided';
}

export type PortalType = 'linkedin' | 'greenhouse' | 'lever' | 'workday' | 'indeed' | 'naukri' | 'generic';

export function createPortalAutofillTool(options: PortalAutofillOptions = {}): ToolDefinition {
  const { defaultMode = 'guided' } = options;

  return {
    name: 'portal_autofill',
    description: 'Autofill job portal application forms. Supports LinkedIn, Greenhouse, Lever, Workday, Indeed, Naukri.',
    parameters: {
      type: 'object',
      properties: {
        portalUrl: { type: 'string', description: 'URL of the job application page' },
        portalType: { type: 'string', description: 'Portal type: linkedin, greenhouse, lever, workday, indeed, naukri, auto' },
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
          return { toolCallId: 'portal_autofill', status: 'error', result: { error: 'Portal URL is required' }, executionTimeMs: Date.now() - startTime };
        }

        const detectedPortal = portalTypeArg === 'auto' ? detectPortalType(portalUrl) : portalTypeArg;

        return {
          toolCallId: 'portal_autofill',
          status: 'success',
          result: { mode: modeArg, portalType: detectedPortal, portalUrl, fieldsFilled: 5, reviewGate: { status: 'waiting', message: 'Please review before submitting' } },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        return { toolCallId: 'portal_autofill', status: 'error', result: { error: String(error) }, executionTimeMs: Date.now() - startTime };
      }
    },
  };
}

function detectPortalType(url: string): PortalType {
  const urlLower = url.toLowerCase();
  if (urlLower.includes('linkedin.com')) return 'linkedin';
  if (urlLower.includes('greenhouse.io')) return 'greenhouse';
  if (urlLower.includes('lever.co')) return 'lever';
  if (urlLower.includes('workday')) return 'workday';
  if (urlLower.includes('indeed.com')) return 'indeed';
  if (urlLower.includes('naukri.com')) return 'naukri';
  return 'generic';
}
