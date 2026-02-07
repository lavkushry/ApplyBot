import type { UserProfile, JDRequirements } from '@applypilot/core';
import { LLMFactory, getCostTracker } from '@applypilot/core';
import { ConfigManager } from '@applypilot/core';

export interface AnswersPack {
  screeningQuestions: Record<string, string>;
  formAnswers: Record<string, string>;
  cost: number;
}

export class AnswersPackGenerator {
  private config: ReturnType<ConfigManager['getLLMConfig']>;

  constructor() {
    const configManager = ConfigManager.getInstance();
    this.config = configManager.getLLMConfig();
  }

  /**
   * Generate complete answers pack
   */
  async generate(
    profile: UserProfile,
    requirements: JDRequirements,
    jobId?: string
  ): Promise<AnswersPack> {
    const [screeningResult, formResult] = await Promise.all([
      this.generateScreeningAnswers(profile, requirements, jobId),
      this.generateFormAnswers(profile, requirements, jobId),
    ]);

    return {
      screeningQuestions: screeningResult.answers,
      formAnswers: formResult.answers,
      cost: screeningResult.cost + formResult.cost,
    };
  }

  /**
   * Generate answers to common screening questions
   */
  async generateScreeningAnswers(
    profile: UserProfile,
    requirements: JDRequirements,
    jobId?: string
  ): Promise<{ answers: Record<string, string>; cost: number }> {
    const adapter = LLMFactory.createAdapter({
      ...this.config,
      apiKey: ConfigManager.getInstance().getAPIKey() || '',
    });

    const systemPrompt = `You are an expert at answering job application screening questions.

Generate answers to common screening questions based on the candidate's profile.

RULES:
1. Be truthful - only use information from the candidate's profile
2. Be concise but complete (2-4 sentences per answer)
3. Highlight relevant experience when possible
4. Be professional and positive
5. If a question doesn't apply, provide a reasonable default`;

    const userPrompt = `Generate answers to these common screening questions:

Job: ${requirements.roleTitle}
Candidate: ${profile.personal.firstName} ${profile.personal.lastName}

Profile Summary:
${profile.summary}

Experience:
${profile.experience.map(exp => `- ${exp.title} at ${exp.company}`).join('\n')}

Skills: ${profile.skills.technical.join(', ')}

Generate answers in JSON format:
{
  "Why are you interested in this role?": "answer",
  "Why do you want to work at our company?": "answer",
  "What makes you a good fit for this position?": "answer",
  "Describe your experience with ${requirements.mustHaveSkills.slice(0, 2).join(' and ')}.": "answer",
  "What are your salary expectations?": "answer",
  "When can you start?": "answer",
  "Are you willing to relocate?": "answer",
  "Do you require sponsorship?": "answer"
}`;

    const response = await adapter.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      maxTokens: 1500,
    });

    // Record usage
    const costTracker = getCostTracker();
    costTracker.recordUsage({
      provider: this.config.provider,
      model: response.model,
      operation: 'screening_answers',
      promptTokens: response.usage?.promptTokens || 0,
      completionTokens: response.usage?.completionTokens || 0,
      totalTokens: response.usage?.totalTokens || 0,
      cost: response.cost || 0,
      jobId,
    });

    // Parse answers
    const answers = this.parseJSONResponse(response.content);

    return { answers, cost: response.cost || 0 };
  }

  /**
   * Generate answers for application form fields
   */
  async generateFormAnswers(
    profile: UserProfile,
    requirements: JDRequirements,
    jobId?: string
  ): Promise<{ answers: Record<string, string>; cost: number }> {
    const adapter = LLMFactory.createAdapter({
      ...this.config,
      apiKey: ConfigManager.getInstance().getAPIKey() || '',
    });

    const systemPrompt = `You are an expert at filling out job application forms.

Generate content for common form fields based on the candidate's profile.

RULES:
1. Be truthful and accurate
2. Keep answers concise (fit in form fields)
3. Use strong action verbs
4. Quantify achievements where possible
5. Tailor to the specific job requirements`;

    const userPrompt = `Generate content for these application form fields:

Job: ${requirements.roleTitle}
Company: ${requirements.company || 'Company'}

Candidate Profile:
${profile.summary}

Experience:
${profile.experience.map(exp => `
${exp.title} at ${exp.company}
${exp.bullets.join('\n')}
`).join('\n')}

Generate in JSON format:
{
  "LinkedIn Profile": "${profile.personal.linkedin || ''}",
  "Portfolio/Website": "${profile.personal.portfolio || ''}",
  "GitHub Profile": "${profile.personal.github || ''}",
  "How did you hear about this role?": "answer",
  "What interests you about this opportunity?": "2-3 sentence answer",
  "Describe a challenging project you worked on.": "3-4 sentence answer with specific example",
  "What are your greatest strengths?": "2-3 relevant strengths",
  "Describe your ideal work environment.": "2-3 sentence answer",
  "Additional Information": "Any other relevant information"
}`;

    const response = await adapter.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      maxTokens: 1200,
    });

    // Record usage
    const costTracker = getCostTracker();
    costTracker.recordUsage({
      provider: this.config.provider,
      model: response.model,
      operation: 'form_answers',
      promptTokens: response.usage?.promptTokens || 0,
      completionTokens: response.usage?.completionTokens || 0,
      totalTokens: response.usage?.totalTokens || 0,
      cost: response.cost || 0,
      jobId,
    });

    // Parse answers
    const answers = this.parseJSONResponse(response.content);

    return { answers, cost: response.cost || 0 };
  }

  /**
   * Generate answer for a specific question
   */
  async generateCustomAnswer(
    question: string,
    profile: UserProfile,
    requirements: JDRequirements,
    jobId?: string
  ): Promise<{ answer: string; cost: number }> {
    const adapter = LLMFactory.createAdapter({
      ...this.config,
      apiKey: ConfigManager.getInstance().getAPIKey() || '',
    });

    const systemPrompt = `You are an expert at answering job application questions.

Provide a thoughtful, professional answer that highlights relevant experience.

RULES:
1. Be truthful - only use information from the profile
2. Be concise (2-4 sentences unless specified otherwise)
3. Use the STAR method when appropriate (Situation, Task, Action, Result)
4. Highlight relevant skills and achievements
5. Be specific with examples`;

    const userPrompt = `Question: ${question}

Job: ${requirements.roleTitle}

Candidate Profile:
${profile.summary}

Relevant Experience:
${profile.experience.slice(0, 2).map(exp => `
${exp.title} at ${exp.company}
${exp.bullets.join('\n')}
`).join('\n')}

Provide a professional answer to this question.`;

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
      operation: 'custom_answer',
      promptTokens: response.usage?.promptTokens || 0,
      completionTokens: response.usage?.completionTokens || 0,
      totalTokens: response.usage?.totalTokens || 0,
      cost: response.cost || 0,
      jobId,
    });

    return {
      answer: response.content.trim(),
      cost: response.cost || 0,
    };
  }

  /**
   * Parse JSON response, handling common errors
   */
  private parseJSONResponse(content: string): Record<string, string> {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.warn('Failed to parse JSON response:', error);
    }

    // Fallback: try to extract key-value pairs
    const result: Record<string, string> = {};
    const lines = content.split('\n');
    let currentKey = '';

    for (const line of lines) {
      const match = line.match(/^["']?([^:"]+)["']?\s*:\s*["']?(.+?)["']?[,}]?$/);
      if (match) {
        currentKey = match[1].trim();
        result[currentKey] = match[2].trim();
      } else if (currentKey && line.trim()) {
        result[currentKey] += ' ' + line.trim();
      }
    }

    return result;
  }
}
