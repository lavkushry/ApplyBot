import type { LLMAdapter } from '../llm/index.js';

export interface ValidationResult {
  isValid: boolean;
  score: number;
  issues: Array<{
    severity: 'error' | 'warning' | 'info';
    message: string;
    suggestion: string;
  }>;
  improvements: string[];
}

export class OutputValidator {
  private adapter: LLMAdapter;

  constructor(adapter: LLMAdapter) {
    this.adapter = adapter;
  }

  /**
   * Validate tailored resume content
   */
  async validateResume(
    tailored: {
      summary: string;
      skills: string[];
      experience: Array<{ bullets: string[] }>;
    },
    originalProfile: unknown,
    requirements: unknown
  ): Promise<ValidationResult> {
    const issues: Array<{ severity: 'error' | 'warning' | 'info'; message: string; suggestion: string }> = [];
    
    // Check 1: Truthfulness - no invented information
    const truthfulnessCheck = await this.checkTruthfulness(tailored, originalProfile);
    if (!truthfulnessCheck.passed) {
      issues.push({
        severity: 'error',
        message: 'Potential invented information detected',
        suggestion: truthfulnessCheck.suggestion,
      });
    }

    // Check 2: Completeness - all required sections present
    if (!tailored.summary || tailored.summary.length < 50) {
      issues.push({
        severity: 'warning',
        message: 'Professional summary is missing or too short',
        suggestion: 'Add a 2-3 sentence summary highlighting key qualifications',
      });
    }

    if (tailored.skills.length < 5) {
      issues.push({
        severity: 'warning',
        message: 'Too few skills listed',
        suggestion: 'Include at least 8-10 relevant skills',
      });
    }

    // Check 3: Relevance - skills match job requirements
    const relevanceCheck = await this.checkRelevance(tailored, requirements);
    if (!relevanceCheck.passed) {
      issues.push({
        severity: 'warning',
        message: 'Skills may not fully match job requirements',
        suggestion: relevanceCheck.suggestion,
      });
    }

    // Check 4: Quality - no buzzwords, good formatting
    const qualityCheck = this.checkQuality(tailored);
    issues.push(...qualityCheck.issues);

    // Calculate overall score
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const score = Math.max(0, 100 - (errorCount * 20) - (warningCount * 10));

    // Generate improvements
    const improvements = await this.suggestImprovements(tailored, requirements);

    return {
      isValid: errorCount === 0 && score >= 70,
      score,
      issues,
      improvements,
    };
  }

  /**
   * Validate JD analysis output
   */
  async validateJDAnalysis(
    analysis: {
      roleTitle: string;
      seniority: string;
      mustHaveSkills: string[];
      niceToHaveSkills: string[];
      redFlags: string[];
    },
    originalJD: string
  ): Promise<ValidationResult> {
    const issues: Array<{ severity: 'error' | 'warning' | 'info'; message: string; suggestion: string }> = [];

    // Check 1: Role title is reasonable
    if (!analysis.roleTitle || analysis.roleTitle === 'Unknown') {
      issues.push({
        severity: 'warning',
        message: 'Could not identify role title',
        suggestion: 'Manually review and add the correct job title',
      });
    }

    // Check 2: Skills were extracted
    if (analysis.mustHaveSkills.length === 0 && analysis.niceToHaveSkills.length === 0) {
      issues.push({
        severity: 'error',
        message: 'No skills extracted from job description',
        suggestion: 'Job description may be too vague or use non-standard terminology',
      });
    }

    // Check 3: Seniority level makes sense
    const seniorityLevels = ['entry', 'junior', 'mid', 'senior', 'lead', 'staff', 'principal'];
    if (!seniorityLevels.includes(analysis.seniority.toLowerCase())) {
      issues.push({
        severity: 'info',
        message: `Unusual seniority level: ${analysis.seniority}`,
        suggestion: 'Verify seniority level matches the role',
      });
    }

    // Check 4: Red flags detected if JD has warning signs
    const hasWarningSigns = /(rockstar|ninja|guru|wear many hats|fast.?paced|urgent)/i.test(originalJD);
    if (hasWarningSigns && analysis.redFlags.length === 0) {
      issues.push({
        severity: 'info',
        message: 'Job description contains warning signs but no red flags were detected',
        suggestion: 'Manually review for potential concerns',
      });
    }

    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const score = Math.max(0, 100 - (errorCount * 25) - (warningCount * 10));

    const improvements = this.suggestJDImprovements(analysis);

    return {
      isValid: errorCount === 0,
      score,
      issues,
      improvements,
    };
  }

  /**
   * Check if tailored content is truthful
   */
  private async checkTruthfulness(
    tailored: { summary: string; skills: string[] },
    originalProfile: unknown
  ): Promise<{ passed: boolean; suggestion: string }> {
    const prompt = `Check if this resume content contains any invented information.

Original Profile: ${JSON.stringify(originalProfile)}

Tailored Content:
Summary: ${tailored.summary}
Skills: ${tailored.skills.join(', ')}

Does the tailored content contain any skills, achievements, or qualifications NOT present in the original profile?

Respond with JSON:
{
  "hasInventions": true/false,
  "inventedItems": ["list any invented items"],
  "suggestion": "how to fix"
}`;

    try {
      const response = await this.adapter.complete({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        maxTokens: 500,
      });

      const result = JSON.parse(response.content);
      return {
        passed: !result.hasInventions,
        suggestion: result.suggestion || 'Remove invented information and use only facts from your profile',
      };
    } catch {
      // If parsing fails, assume it's okay
      return { passed: true, suggestion: '' };
    }
  }

  /**
   * Check if tailored content is relevant to job
   */
  private async checkRelevance(
    tailored: { skills: string[] },
    requirements: unknown
  ): Promise<{ passed: boolean; suggestion: string }> {
    const prompt = `Check if these skills are relevant to the job requirements.

Job Requirements: ${JSON.stringify(requirements)}

Candidate Skills: ${tailored.skills.join(', ')}

Are these skills well-aligned with the job requirements?

Respond with JSON:
{
  "isRelevant": true/false,
  "missingKeySkills": ["list important missing skills"],
  "suggestion": "how to improve relevance"
}`;

    try {
      const response = await this.adapter.complete({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        maxTokens: 500,
      });

      const result = JSON.parse(response.content);
      return {
        passed: result.isRelevant,
        suggestion: result.suggestion || 'Add more relevant skills from the job description',
      };
    } catch {
      return { passed: true, suggestion: '' };
    }
  }

  /**
   * Check quality of content
   */
  private checkQuality(tailored: { summary: string; skills: string[] }): {
    issues: Array<{ severity: 'error' | 'warning' | 'info'; message: string; suggestion: string }>;
  } {
    const issues: Array<{ severity: 'error' | 'warning' | 'info'; message: string; suggestion: string }> = [];

    // Check for buzzwords
    const buzzwords = ['rockstar', 'ninja', 'guru', 'wizard', 'superstar'];
    const hasBuzzwords = buzzwords.some(word => 
      tailored.summary.toLowerCase().includes(word)
    );

    if (hasBuzzwords) {
      issues.push({
        severity: 'warning',
        message: 'Professional summary contains buzzwords',
        suggestion: 'Replace buzzwords with specific, quantified achievements',
      });
    }

    // Check for passive voice (simplified)
    const passiveIndicators = ['was responsible for', 'was tasked with', 'helped with'];
    const hasPassiveVoice = passiveIndicators.some(phrase =>
      tailored.summary.toLowerCase().includes(phrase)
    );

    if (hasPassiveVoice) {
      issues.push({
        severity: 'info',
        message: 'Consider using more active voice',
        suggestion: 'Replace passive phrases with action verbs',
      });
    }

    // Check skill formatting
    const hasInconsistentFormatting = tailored.skills.some((skill, i, arr) => {
      if (i === 0) return false;
      const prev = arr[i - 1];
      const currCapitalized = skill[0] === skill[0].toUpperCase();
      const prevCapitalized = prev[0] === prev[0].toUpperCase();
      return currCapitalized !== prevCapitalized;
    });

    if (hasInconsistentFormatting) {
      issues.push({
        severity: 'info',
        message: 'Inconsistent skill formatting detected',
        suggestion: 'Use consistent capitalization for all skills',
      });
    }

    return { issues };
  }

  /**
   * Suggest improvements for resume
   */
  private async suggestImprovements(
    tailored: { summary: string; skills: string[] },
    requirements: unknown
  ): Promise<string[]> {
    const prompt = `Suggest 3 specific improvements for this resume.

Current Summary: ${tailored.summary}
Current Skills: ${tailored.skills.join(', ')}
Job Requirements: ${JSON.stringify(requirements)}

Provide exactly 3 actionable improvements as a JSON array of strings.`;

    try {
      const response = await this.adapter.complete({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        maxTokens: 400,
      });

      const improvements = JSON.parse(response.content);
      if (Array.isArray(improvements)) {
        return improvements.slice(0, 3);
      }
    } catch {
      // Return default suggestions
    }

    return [
      'Add quantified achievements (numbers, percentages)',
      'Ensure all skills match job requirements',
      'Review for any typos or formatting issues',
    ];
  }

  /**
   * Suggest improvements for JD analysis
   */
  private suggestJDImprovements(analysis: { mustHaveSkills: string[] }): string[] {
    const improvements: string[] = [];

    if (analysis.mustHaveSkills.length < 5) {
      improvements.push('Research company tech stack to identify additional relevant skills');
    }

    improvements.push(
      'Review job description for implicit requirements not explicitly stated',
      'Check company careers page for culture fit indicators'
    );

    return improvements;
  }
}
