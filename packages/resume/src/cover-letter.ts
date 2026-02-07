import type { UserProfile, JDRequirements } from '@applypilot/core';
import { LLMFactory, getCostTracker } from '@applypilot/core';
import { ConfigManager } from '@applypilot/core';

export interface CoverLetterResult {
  short: string;
  long: string;
  cost: number;
}

export class CoverLetterGenerator {
  private config: ReturnType<ConfigManager['getLLMConfig']>;

  constructor() {
    const configManager = ConfigManager.getInstance();
    this.config = configManager.getLLMConfig();
  }

  /**
   * Generate both short and long cover letters
   */
  async generate(
    profile: UserProfile,
    requirements: JDRequirements,
    jobId?: string
  ): Promise<CoverLetterResult> {
    const [shortResult, longResult] = await Promise.all([
      this.generateShort(profile, requirements, jobId),
      this.generateLong(profile, requirements, jobId),
    ]);

    return {
      short: shortResult.letter,
      long: longResult.letter,
      cost: shortResult.cost + longResult.cost,
    };
  }

  /**
   * Generate short cover letter (2-3 paragraphs, ~150 words)
   * Good for: Email body, LinkedIn message, "Additional Info" fields
   */
  async generateShort(
    profile: UserProfile,
    requirements: JDRequirements,
    jobId?: string
  ): Promise<{ letter: string; cost: number }> {
    const adapter = LLMFactory.createAdapter({
      ...this.config,
      apiKey: ConfigManager.getInstance().getAPIKey() || '',
    });

    const systemPrompt = `You are an expert cover letter writer. Write a concise, compelling cover letter.

RULES:
1. Maximum 150 words
2. 2-3 short paragraphs
3. Hook the reader in the first sentence
4. Highlight 2-3 most relevant qualifications
5. Show enthusiasm for the specific role
6. End with a clear call to action
7. Be professional but personable
8. NEVER invent skills or experiences`;

    const userPrompt = this.createPrompt(profile, requirements, 'short');

    const response = await adapter.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5,
      maxTokens: 300,
    });

    // Record usage
    const costTracker = getCostTracker();
    costTracker.recordUsage({
      provider: this.config.provider,
      model: response.model,
      operation: 'cover_letter_short',
      promptTokens: response.usage?.promptTokens || 0,
      completionTokens: response.usage?.completionTokens || 0,
      totalTokens: response.usage?.totalTokens || 0,
      cost: response.cost || 0,
      jobId,
    });

    return {
      letter: this.formatLetter(response.content, profile, requirements),
      cost: response.cost || 0,
    };
  }

  /**
   * Generate long cover letter (4-5 paragraphs, ~400 words)
   * Good for: Traditional cover letter upload, detailed applications
   */
  async generateLong(
    profile: UserProfile,
    requirements: JDRequirements,
    jobId?: string
  ): Promise<{ letter: string; cost: number }> {
    const adapter = LLMFactory.createAdapter({
      ...this.config,
      apiKey: ConfigManager.getInstance().getAPIKey() || '',
    });

    const systemPrompt = `You are an expert cover letter writer. Write a comprehensive, compelling cover letter.

RULES:
1. 4-5 paragraphs, ~400 words
2. Standard business letter format
3. Paragraph 1: Hook + why this company/role
4. Paragraph 2-3: Relevant experience with specific examples
5. Paragraph 4: Why you're a great fit (skills alignment)
6. Paragraph 5: Call to action + closing
7. Use specific examples from the candidate's background
8. Address key requirements from the job description
9. Professional but show personality
10. NEVER invent skills or experiences`;

    const userPrompt = this.createPrompt(profile, requirements, 'long');

    const response = await adapter.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5,
      maxTokens: 800,
    });

    // Record usage
    const costTracker = getCostTracker();
    costTracker.recordUsage({
      provider: this.config.provider,
      model: response.model,
      operation: 'cover_letter_long',
      promptTokens: response.usage?.promptTokens || 0,
      completionTokens: response.usage?.completionTokens || 0,
      totalTokens: response.usage?.totalTokens || 0,
      cost: response.cost || 0,
      jobId,
    });

    return {
      letter: this.formatLetter(response.content, profile, requirements),
      cost: response.cost || 0,
    };
  }

  /**
   * Generate recruiter outreach message
   * Good for: LinkedIn InMail, cold emails
   */
  async generateRecruiterMessage(
    profile: UserProfile,
    requirements: JDRequirements,
    recruiterName?: string,
    jobId?: string
  ): Promise<{ message: string; cost: number }> {
    const adapter = LLMFactory.createAdapter({
      ...this.config,
      apiKey: ConfigManager.getInstance().getAPIKey() || '',
    });

    const systemPrompt = `You are an expert at writing recruiter outreach messages.

RULES:
1. Maximum 100 words
2. Professional but conversational tone
3. Get to the point quickly
4. Mention specific interest in the role
5. Highlight 1-2 key qualifications
6. Include clear ask (call, application, etc.)
7. Reference mutual connection if applicable`;

    const userPrompt = `Write a recruiter outreach message for:

Job: ${requirements.roleTitle} at ${requirements.company || 'the company'}
Candidate: ${profile.personal.firstName} ${profile.personal.lastName}
Key Skills: ${profile.skills.technical.slice(0, 5).join(', ')}
${recruiterName ? `Recruiter Name: ${recruiterName}` : ''}

Candidate Summary: ${profile.summary}`;

    const response = await adapter.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.6,
      maxTokens: 200,
    });

    // Record usage
    const costTracker = getCostTracker();
    costTracker.recordUsage({
      provider: this.config.provider,
      model: response.model,
      operation: 'recruiter_message',
      promptTokens: response.usage?.promptTokens || 0,
      completionTokens: response.usage?.completionTokens || 0,
      totalTokens: response.usage?.totalTokens || 0,
      cost: response.cost || 0,
      jobId,
    });

    return {
      message: response.content.trim(),
      cost: response.cost || 0,
    };
  }

  /**
   * Create the prompt for cover letter generation
   */
  private createPrompt(
    profile: UserProfile,
    requirements: JDRequirements,
    type: 'short' | 'long'
  ): string {
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return `Write a ${type} cover letter for the following:

## JOB DETAILS

Position: ${requirements.roleTitle}
Company: ${requirements.company || '[Company Name]'}
Key Requirements:
${requirements.mustHaveSkills.map(s => `- ${s}`).join('\n')}

Responsibilities:
${requirements.responsibilities.slice(0, 5).map(r => `- ${r}`).join('\n')}

## CANDIDATE DETAILS

Name: ${profile.personal.firstName} ${profile.personal.lastName}
Email: ${profile.personal.email}
Phone: ${profile.personal.phone || '[Phone]'}
Location: ${profile.personal.location || '[Location]'}
LinkedIn: ${profile.personal.linkedin || '[LinkedIn]'}

Summary: ${profile.summary}

Relevant Experience:
${profile.experience.slice(0, 2).map(exp => `
- ${exp.title} at ${exp.company} (${exp.startDate} - ${exp.current ? 'Present' : exp.endDate})
  ${exp.bullets.slice(0, 2).join('\n  ')}
`).join('\n')}

Key Skills: ${profile.skills.technical.filter(s => 
  requirements.mustHaveSkills.some(req => 
    req.toLowerCase().includes(s.toLowerCase()) || 
    s.toLowerCase().includes(req.toLowerCase())
  )
).join(', ')}

Date: ${today}

Write the cover letter now.`;
  }

  /**
   * Format the generated letter with proper structure
   */
  private formatLetter(
    content: string,
    profile: UserProfile,
    requirements: JDRequirements
  ): string {
    // Clean up the content
    let letter = content.trim();

    // Ensure proper letter structure if not present
    if (!letter.includes('Dear') && !letter.includes('Hiring Manager')) {
      const salutation = `Dear Hiring Manager,\n\n`;
      letter = salutation + letter;
    }

    if (!letter.includes('Sincerely') && !letter.includes('Best regards')) {
      const closing = `\n\nSincerely,\n${profile.personal.firstName} ${profile.personal.lastName}`;
      letter += closing;
    }

    return letter;
  }
}
