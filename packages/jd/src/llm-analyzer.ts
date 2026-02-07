import type { JDRequirements, FitAnalysis, UserProfile } from '@applypilot/core';
import { LLMFactory, type LLMAdapter, getCostTracker } from '@applypilot/core';
import { ConfigManager } from '@applypilot/core';

export interface LLMJDAnalysisResult {
  requirements: JDRequirements;
  fitAnalysis: FitAnalysis;
  rawResponse: string;
  cost: number;
}

export class LLMJDAnalyzer {
  private adapter: LLMAdapter;
  private config: ReturnType<ConfigManager['getLLMConfig']>;

  constructor() {
    const configManager = ConfigManager.getInstance();
    this.config = configManager.getLLMConfig();
    this.adapter = LLMFactory.createAdapter({
      ...this.config,
      apiKey: configManager.getAPIKey() || '',
    });
  }

  /**
   * Analyze job description using LLM
   */
  async analyze(jdText: string, userProfile: UserProfile, jobId?: string): Promise<LLMJDAnalysisResult> {
    const systemPrompt = this.createSystemPrompt();
    const userPrompt = this.createUserPrompt(jdText, userProfile);

    const startTime = Date.now();
    
    const response = await this.adapter.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      maxTokens: 2000,
    });

    // Record usage
    const costTracker = getCostTracker();
    costTracker.recordUsage({
      provider: this.config.provider,
      model: response.model,
      operation: 'jd_analysis',
      promptTokens: response.usage?.promptTokens || 0,
      completionTokens: response.usage?.completionTokens || 0,
      totalTokens: response.usage?.totalTokens || 0,
      cost: response.cost || 0,
      jobId,
    });

    // Parse the structured response
    const parsed = this.parseResponse(response.content);

    return {
      requirements: parsed.requirements,
      fitAnalysis: parsed.fitAnalysis,
      rawResponse: response.content,
      cost: response.cost || 0,
    };
  }

  /**
   * Create system prompt for JD analysis
   */
  private createSystemPrompt(): string {
    return `You are an expert at analyzing job descriptions and extracting structured information.

Your task is to:
1. Extract the role title and seniority level
2. Identify must-have skills and qualifications
3. Identify nice-to-have skills
4. Extract key responsibilities
5. Identify any red flags or concerns
6. Determine the work arrangement (remote/hybrid/onsite)
7. Calculate a fit score based on the candidate's profile

IMPORTANT RULES:
- Be thorough and accurate in your analysis
- Only extract information that is explicitly stated or strongly implied
- For skills, use standard industry terminology
- Be honest about red flags - they help candidates make informed decisions
- The fit score should be realistic (0-100) based on actual skill matches

OUTPUT FORMAT:
You must respond with a valid JSON object in this exact format:

{
  "roleTitle": "Exact job title",
  "seniority": "entry|mid|senior|lead|staff|unknown",
  "mustHaveSkills": ["skill1", "skill2", ...],
  "niceToHaveSkills": ["skill1", "skill2", ...],
  "responsibilities": ["responsibility1", "responsibility2", ...],
  "keywords": ["keyword1", "keyword2", ...],
  "redFlags": ["flag1", "flag2", ...],
  "location": "Location or null",
  "remotePolicy": "remote|hybrid|onsite|unknown",
  "fitScore": 75,
  "matchedSkills": ["skill1", "skill2", ...],
  "missingSkills": ["skill1", "skill2", ...],
  "gaps": ["gap description1", ...],
  "recommendations": ["recommendation1", ...]
}`;
  }

  /**
   * Create user prompt with JD and profile
   */
  private createUserPrompt(jdText: string, userProfile: UserProfile): string {
    const profileSummary = this.summarizeProfile(userProfile);

    return `Please analyze the following job description and compare it to the candidate's profile.

## JOB DESCRIPTION

${jdText}

## CANDIDATE PROFILE

${profileSummary}

Please provide your analysis in the JSON format specified in your instructions.`;
  }

  /**
   * Summarize user profile for the prompt
   */
  private summarizeProfile(profile: UserProfile): string {
    const lines: string[] = [];

    // Personal info
    lines.push(`Name: ${profile.personal.firstName} ${profile.personal.lastName}`);
    lines.push(`Title: ${profile.summary.substring(0, 100)}...`);

    // Skills
    lines.push(`\nTechnical Skills: ${profile.skills.technical.join(', ')}`);
    if (profile.skills.soft.length > 0) {
      lines.push(`Soft Skills: ${profile.skills.soft.join(', ')}`);
    }

    // Experience
    lines.push(`\nWork Experience:`);
    for (const exp of profile.experience.slice(0, 3)) {
      lines.push(`- ${exp.title} at ${exp.company} (${exp.startDate} - ${exp.current ? 'Present' : exp.endDate})`);
      lines.push(`  Skills: ${exp.skills.join(', ')}`);
    }

    // Projects
    if (profile.projects && profile.projects.length > 0) {
      lines.push(`\nProjects:`);
      for (const proj of profile.projects.slice(0, 2)) {
        lines.push(`- ${proj.name}: ${proj.skills.join(', ')}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Parse LLM response into structured data
   */
  private parseResponse(content: string): {
    requirements: JDRequirements;
    fitAnalysis: FitAnalysis;
  } {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const data = JSON.parse(jsonMatch[0]);

      const requirements: JDRequirements = {
        roleTitle: data.roleTitle || 'Unknown Role',
        seniority: data.seniority || 'unknown',
        mustHaveSkills: data.mustHaveSkills || [],
        niceToHaveSkills: data.niceToHaveSkills || [],
        responsibilities: data.responsibilities || [],
        keywords: data.keywords || [],
        redFlags: data.redFlags || [],
        location: data.location || undefined,
        remotePolicy: data.remotePolicy || 'unknown',
      };

      const fitAnalysis: FitAnalysis = {
        score: data.fitScore || 0,
        matchedSkills: data.matchedSkills || [],
        missingSkills: data.missingSkills || [],
        gaps: data.gaps || [],
        recommendations: data.recommendations || [],
      };

      return { requirements, fitAnalysis };
    } catch (error) {
      // Fallback to default values if parsing fails
      console.warn('Failed to parse LLM response, using defaults:', error);
      
      return {
        requirements: {
          roleTitle: 'Unknown Role',
          seniority: 'unknown',
          mustHaveSkills: [],
          niceToHaveSkills: [],
          responsibilities: [],
          keywords: [],
          redFlags: [],
        },
        fitAnalysis: {
          score: 0,
          matchedSkills: [],
          missingSkills: [],
          gaps: ['Failed to analyze job description'],
          recommendations: ['Please try again or analyze manually'],
        },
      };
    }
  }

  /**
   * Quick analysis without profile comparison
   */
  async quickAnalyze(jdText: string, jobId?: string): Promise<{
    requirements: JDRequirements;
    cost: number;
  }> {
    const systemPrompt = `You are an expert at analyzing job descriptions.

Extract the following information and return it as JSON:
{
  "roleTitle": "Job title",
  "seniority": "entry|mid|senior|lead|staff|unknown",
  "mustHaveSkills": ["required skills"],
  "niceToHaveSkills": ["preferred skills"],
  "responsibilities": ["key duties"],
  "keywords": ["important terms"],
  "redFlags": ["any concerns"],
  "location": "location or null",
  "remotePolicy": "remote|hybrid|onsite|unknown"
}`;

    const response = await this.adapter.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: jdText },
      ],
      temperature: 0.3,
      maxTokens: 1500,
    });

    // Record usage
    const costTracker = getCostTracker();
    costTracker.recordUsage({
      provider: this.config.provider,
      model: response.model,
      operation: 'jd_quick_analysis',
      promptTokens: response.usage?.promptTokens || 0,
      completionTokens: response.usage?.completionTokens || 0,
      totalTokens: response.usage?.totalTokens || 0,
      cost: response.cost || 0,
      jobId,
    });

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      const data = JSON.parse(jsonMatch?.[0] || '{}');

      const requirements: JDRequirements = {
        roleTitle: data.roleTitle || 'Unknown Role',
        seniority: data.seniority || 'unknown',
        mustHaveSkills: data.mustHaveSkills || [],
        niceToHaveSkills: data.niceToHaveSkills || [],
        responsibilities: data.responsibilities || [],
        keywords: data.keywords || [],
        redFlags: data.redFlags || [],
        location: data.location || undefined,
        remotePolicy: data.remotePolicy || 'unknown',
      };

      return { requirements, cost: response.cost || 0 };
    } catch {
      return {
        requirements: {
          roleTitle: 'Unknown Role',
          seniority: 'unknown',
          mustHaveSkills: [],
          niceToHaveSkills: [],
          responsibilities: [],
          keywords: [],
          redFlags: [],
        },
        cost: response.cost || 0,
      };
    }
  }
}
