import type { UserProfile, JDRequirements, TailoredResume, ResumeChange } from '@applypilot/core';
import { LLMFactory, getCostTracker } from '@applypilot/core';
import { ConfigManager } from '@applypilot/core';

export interface LLMTailorResult {
  tailored: TailoredResume;
  changes: ResumeChange[];
  latex: string;
  cost: number;
}

export class LLMResumeTailor {
  private config: ReturnType<ConfigManager['getLLMConfig']>;
  private tailoringConfig: ReturnType<ConfigManager['getTailoringConfig']>;

  constructor() {
    const configManager = ConfigManager.getInstance();
    this.config = configManager.getLLMConfig();
    this.tailoringConfig = configManager.getTailoringConfig();
  }

  /**
   * Tailor resume for a job using LLM
   */
  async tailor(
    profile: UserProfile,
    requirements: JDRequirements,
    jobId?: string
  ): Promise<LLMTailorResult> {
    const adapter = LLMFactory.createAdapter({
      ...this.config,
      apiKey: ConfigManager.getInstance().getAPIKey() || '',
    });

    const systemPrompt = this.createSystemPrompt();
    const userPrompt = this.createUserPrompt(profile, requirements);

    const response = await adapter.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      maxTokens: 3000,
    });

    // Record usage
    const costTracker = getCostTracker();
    costTracker.recordUsage({
      provider: this.config.provider,
      model: response.model,
      operation: 'resume_tailoring',
      promptTokens: response.usage?.promptTokens || 0,
      completionTokens: response.usage?.completionTokens || 0,
      totalTokens: response.usage?.totalTokens || 0,
      cost: response.cost || 0,
      jobId,
    });

    // Parse the response
    const parsed = this.parseResponse(response.content, profile);

    // Generate LaTeX
    const latex = this.generateLaTeX(parsed.tailored, profile);

    return {
      tailored: parsed.tailored,
      changes: parsed.changes,
      latex,
      cost: response.cost || 0,
    };
  }

  /**
   * Create system prompt for resume tailoring
   */
  private createSystemPrompt(): string {
    const maxSkills = this.tailoringConfig.maxSkills;
    const maxBullets = this.tailoringConfig.maxBulletPoints;
    const enforceTruthfulness = this.tailoringConfig.enforceTruthfulness;

    return `You are an expert resume writer specializing in tailoring resumes for specific job descriptions.

YOUR TASK:
Rewrite the candidate's resume to emphasize relevance to the target job while maintaining complete truthfulness.

RULES:
1. ${enforceTruthfulness ? 'CRITICAL: NEVER invent skills, experiences, or achievements the candidate does not have' : 'Be creative but realistic'}
2. Only use information from the candidate's profile
3. Emphasize skills and experiences that match the job requirements
4. Use strong action verbs and quantify achievements where possible
5. Keep the tone professional and concise
6. Focus on the most relevant experiences (maximum ${maxBullets} bullet points per role)
7. Limit skills section to ${maxSkills} most relevant skills

OUTPUT FORMAT:
Return a JSON object with this structure:

{
  "summary": "Tailored professional summary (2-3 sentences)",
  "skills": ["skill1", "skill2", ...], // Max ${maxSkills} skills
  "experience": [
    {
      "id": "exp-1",
      "bullets": ["bullet 1", "bullet 2", ...] // Max ${maxBullets} bullets
    }
  ],
  "projects": [
    {
      "id": "proj-1", 
      "bullets": ["bullet 1", "bullet 2", ...]
    }
  ],
  "changes": [
    {
      "section": "summary|skills|experience|projects",
      "field": "field name",
      "oldValue": "brief description of old",
      "newValue": "brief description of new",
      "reason": "why this change was made"
    }
  ]
}`;
  }

  /**
   * Create user prompt with profile and requirements
   */
  private createUserPrompt(profile: UserProfile, requirements: JDRequirements): string {
    return `Please tailor this resume for the following job.

## JOB REQUIREMENTS

Title: ${requirements.roleTitle}
Seniority: ${requirements.seniority}
Must-Have Skills: ${requirements.mustHaveSkills.join(', ')}
Nice-to-Have Skills: ${requirements.niceToHaveSkills.join(', ')}
Key Responsibilities:
${requirements.responsibilities.map(r => `- ${r}`).join('\n')}

## CANDIDATE PROFILE

Summary: ${profile.summary}

Technical Skills: ${profile.skills.technical.join(', ')}

Work Experience:
${profile.experience.map(exp => `
ID: ${exp.id}
Title: ${exp.title} at ${exp.company}
Period: ${exp.startDate} - ${exp.current ? 'Present' : exp.endDate}
Original Bullets:
${exp.bullets.map(b => `- ${b}`).join('\n')}
Skills used: ${exp.skills.join(', ')}
`).join('\n')}

${profile.projects ? `Projects:
${profile.projects.map(proj => `
ID: ${proj.id}
Name: ${proj.name}
Description: ${proj.description}
Original Bullets:
${proj.bullets.map(b => `- ${b}`).join('\n')}
`).join('\n')}` : ''}

Please provide the tailored resume in the JSON format specified.`;
  }

  /**
   * Parse LLM response
   */
  private parseResponse(
    content: string,
    profile: UserProfile
  ): { tailored: TailoredResume; changes: ResumeChange[] } {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const data = JSON.parse(jsonMatch[0]);

      const tailored: TailoredResume = {
        summary: data.summary || profile.summary,
        skills: data.skills || profile.skills.technical.slice(0, this.tailoringConfig.maxSkills),
        experience: data.experience || profile.experience.map(exp => ({
          id: exp.id,
          bullets: exp.bullets.slice(0, this.tailoringConfig.maxBulletPoints),
        })),
        projects: data.projects || profile.projects?.map(proj => ({
          id: proj.id,
          bullets: proj.bullets.slice(0, 3),
        })),
      };

      const changes: ResumeChange[] = data.changes || [];

      return { tailored, changes };
    } catch (error) {
      console.warn('Failed to parse LLM response, using defaults:', error);

      // Return unmodified profile as fallback
      return {
        tailored: {
          summary: profile.summary,
          skills: profile.skills.technical.slice(0, this.tailoringConfig.maxSkills),
          experience: profile.experience.map(exp => ({
            id: exp.id,
            bullets: exp.bullets.slice(0, this.tailoringConfig.maxBulletPoints),
          })),
          projects: profile.projects?.map(proj => ({
            id: proj.id,
            bullets: proj.bullets.slice(0, 3),
          })),
        },
        changes: [{
          section: 'error',
          field: 'parsing',
          oldValue: 'original',
          newValue: 'fallback',
          reason: 'Failed to parse LLM response',
        }],
      };
    }
  }

  /**
   * Generate LaTeX from tailored resume
   */
  private generateLaTeX(tailored: TailoredResume, profile: UserProfile): string {
    const lines: string[] = [];

    // Header
    lines.push('\\section{Summary}');
    lines.push(tailored.summary);
    lines.push('');

    // Skills
    lines.push('\\section{Skills}');
    lines.push('\\begin{itemize}');
    for (const skill of tailored.skills) {
      lines.push(`  \\item ${skill}`);
    }
    lines.push('\\end{itemize}');
    lines.push('');

    // Experience
    lines.push('\\section{Experience}');
    for (const exp of tailored.experience) {
      const originalExp = profile.experience.find(e => e.id === exp.id);
      if (originalExp) {
        lines.push(`\\subsection{${originalExp.title} at ${originalExp.company}}`);
        lines.push('\\begin{itemize}');
        for (const bullet of exp.bullets) {
          lines.push(`  \\item ${bullet}`);
        }
        lines.push('\\end{itemize}');
        lines.push('');
      }
    }

    // Projects
    if (tailored.projects && tailored.projects.length > 0) {
      lines.push('\\section{Projects}');
      for (const proj of tailored.projects) {
        const originalProj = profile.projects?.find(p => p.id === proj.id);
        if (originalProj) {
          lines.push(`\\subsection{${originalProj.name}}`);
          lines.push('\\begin{itemize}');
          for (const bullet of proj.bullets) {
            lines.push(`  \\item ${bullet}`);
          }
          lines.push('\\end{itemize}');
          lines.push('');
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate only the summary section
   */
  async tailorSummary(
    profile: UserProfile,
    requirements: JDRequirements,
    jobId?: string
  ): Promise<{ summary: string; cost: number }> {
    const adapter = LLMFactory.createAdapter({
      ...this.config,
      apiKey: ConfigManager.getInstance().getAPIKey() || '',
    });

    const systemPrompt = `You are an expert resume writer. Rewrite the professional summary to be highly relevant to the job requirements. Be truthful and concise (2-3 sentences).`;

    const userPrompt = `Job Title: ${requirements.roleTitle}
Must-Have Skills: ${requirements.mustHaveSkills.join(', ')}

Current Summary: ${profile.summary}

Rewrite this summary to emphasize relevant skills and experience for this role.`;

    const response = await adapter.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      maxTokens: 200,
    });

    // Record usage
    const costTracker = getCostTracker();
    costTracker.recordUsage({
      provider: this.config.provider,
      model: response.model,
      operation: 'summary_tailoring',
      promptTokens: response.usage?.promptTokens || 0,
      completionTokens: response.usage?.completionTokens || 0,
      totalTokens: response.usage?.totalTokens || 0,
      cost: response.cost || 0,
      jobId,
    });

    return {
      summary: response.content.trim(),
      cost: response.cost || 0,
    };
  }
}
