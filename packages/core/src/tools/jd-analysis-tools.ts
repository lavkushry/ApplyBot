/**
 * JD Analysis Tools - Job Description Analysis
 */

import type { ToolDefinition } from '../agent/types.js';
import type { ToolResult } from '../gateway/types.js';

export interface JDAnalysisResult {
  roleTitle: string;
  seniority: string;
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  responsibilities: string[];
  keywords: string[];
  redFlags: string[];
  location?: string;
  salaryRange?: string;
  coverageScore: number;
  gaps: string[];
}

export interface AnalyzeJDToolOptions {
  llmAdapter?: unknown;
  maxInputLength?: number;
  enableSanitization?: boolean;
}

export function createAnalyzeJDTool(options: AnalyzeJDToolOptions = {}): ToolDefinition {
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
        includeNiceToHave: { type: 'string', description: 'Whether to include nice-to-have skills' },
      },
      required: ['jdText'],
    },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const startTime = Date.now();

      try {
        let jdText = String(args.jdText || '');
        const userSkillsStr = String(args.userSkills || '[]');
        const userSkills = JSON.parse(userSkillsStr) as string[];
        const includeNiceToHave = args.includeNiceToHave !== 'false';

        if (!jdText.trim()) {
          return { toolCallId: 'analyze_jd', status: 'error', result: { error: 'Job description text is required' }, executionTimeMs: Date.now() - startTime };
        }

        if (enableSanitization) {
          jdText = jdText.substring(0, maxInputLength);
        }

        const analysis = analyzeJobDescription(jdText, userSkills, includeNiceToHave);

        return {
          toolCallId: 'analyze_jd',
          status: 'success',
          result: { requirements: analysis, coverageScore: analysis.coverageScore, gaps: analysis.gaps },
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        return { toolCallId: 'analyze_jd', status: 'error', result: { error: String(error) }, executionTimeMs: Date.now() - startTime };
      }
    },
  };
}

function analyzeJobDescription(jdText: string, userSkills: string[], includeNiceToHave: boolean): JDAnalysisResult {
  const roleTitle = extractRoleTitle(jdText);
  const seniority = extractSeniority(jdText);
  const { mustHaveSkills, niceToHaveSkills } = extractSkills(jdText, includeNiceToHave);
  const responsibilities = extractResponsibilities(jdText);
  const keywords = extractKeywords(jdText);
  const redFlags = extractRedFlags(jdText);
  const location = extractLocation(jdText);
  const salaryRange = extractSalaryRange(jdText);
  const { coverageScore, gaps } = calculateCoverageAndGaps(mustHaveSkills, userSkills);

  return { roleTitle, seniority, mustHaveSkills, niceToHaveSkills, responsibilities, keywords, redFlags, location, salaryRange, coverageScore, gaps };
}

function extractRoleTitle(jdText: string): string {
  const match = jdText.match(/^(?:Job Title|Position|Role)[:\s]*([^\n]+)/i) || jdText.match(/^([^\n]+)/);
  return match?.[1]?.trim() || 'Unknown Role';
}

function extractSeniority(jdText: string): string {
  const patterns: Record<string, RegExp> = {
    'Staff/Principal': /staff|principal|fellow/i,
    Senior: /senior|sr\.|5\+?\s*years/i,
    Mid: /mid|3\+?\s*years/i,
    Junior: /junior|jr\.|entry|0-2\s*years/i,
  };
  for (const [level, pattern] of Object.entries(patterns)) {
    if (pattern.test(jdText)) return level;
  }
  return 'Not Specified';
}

function extractSkills(jdText: string, includeNiceToHave: boolean): { mustHaveSkills: string[]; niceToHaveSkills: string[] } {
  const commonSkills = ['javascript', 'typescript', 'python', 'java', 'go', 'react', 'node', 'aws', 'docker', 'kubernetes', 'sql', 'git'];
  const textLower = jdText.toLowerCase();
  const mustHaveSkills = commonSkills.filter(skill => textLower.includes(skill));
  const niceToHaveSkills = includeNiceToHave ? commonSkills.filter(skill => !mustHaveSkills.includes(skill) && Math.random() > 0.7) : [];
  return { mustHaveSkills, niceToHaveSkills };
}

function extractResponsibilities(jdText: string): string[] {
  const section = jdText.match(/(?:Responsibilities|What You'll Do)[:\s]*([\s\S]*?)(?=\n\n|\n[A-Z]|$)/i)?.[1] || '';
  return section.split(/[\n•\-]+/).map(s => s.trim()).filter(s => s.length > 10 && s.length < 200).slice(0, 8);
}

function extractKeywords(jdText: string): string[] {
  const keywords = ['agile', 'scrum', 'remote', 'hybrid', 'full-time', 'startup', 'fintech', 'leadership'];
  return keywords.filter(kw => jdText.toLowerCase().includes(kw));
}

function extractRedFlags(jdText: string): string[] {
  const flags: string[] = [];
  if (/rockstar|ninja|guru/i.test(jdText)) flags.push('Vague requirements');
  if (/10\+?\s*years.*react/i.test(jdText)) flags.push('Unrealistic expectations');
  if (/fast[-\s]?paced|high[-\s]?pressure/i.test(jdText)) flags.push('Fast-paced environment');
  return flags;
}

function extractLocation(jdText: string): string | undefined {
  return jdText.match(/(?:Location|Based in)[:\s]*([^\n]+)/i)?.[1]?.trim();
}

function extractSalaryRange(jdText: string): string | undefined {
  return jdText.match(/(?:Salary|Compensation)[:\s]*[$]?([\d,]+[k]?\s*[-–]\s*[$]?[\d,]+[k]?)/i)?.[1]?.trim();
}

function calculateCoverageAndGaps(requiredSkills: string[], userSkills: string[]): { coverageScore: number; gaps: string[] } {
  if (requiredSkills.length === 0) return { coverageScore: 100, gaps: [] };
  const userSkillsLower = userSkills.map(s => s.toLowerCase());
  const gaps = requiredSkills.filter(skill => !userSkillsLower.some(us => us.includes(skill.toLowerCase()) || skill.toLowerCase().includes(us)));
  const matched = requiredSkills.length - gaps.length;
  return { coverageScore: Math.round((matched / requiredSkills.length) * 100), gaps };
}
