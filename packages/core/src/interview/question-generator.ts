/**
 * Interview Question Generator
 * Generates tailored interview questions based on job requirements and user profile
 */

import { LLMFactory, getCostTracker } from '../llm/index.js';
import { ConfigManager } from '../config/index.js';
import type {
  InterviewQuestion,
  InterviewQuestionType,
  InterviewConfig,
  GeneratedQuestionsResult,
  InterviewPrepInput,
  TechnicalTopic,
} from './types.js';

export interface QuestionGeneratorOptions {
  config?: InterviewConfig;
}

export class InterviewQuestionGenerator {
  private config: ReturnType<ConfigManager['getLLMConfig']>;
  private defaultConfig: InterviewConfig = {
    questionTypes: ['technical', 'behavioral', 'role_specific'],
    questionCount: 10,
    includeTechnical: true,
    includeBehavioral: true,
    difficultyDistribution: {
      easy: 0.3,
      medium: 0.5,
      hard: 0.2,
    },
  };

  constructor(options?: QuestionGeneratorOptions) {
    const configManager = ConfigManager.getInstance();
    this.config = configManager.getLLMConfig();
    if (options?.config) {
      this.defaultConfig = { ...this.defaultConfig, ...options.config };
    }
  }

  /**
   * Generate interview questions for a job
   */
  async generateQuestions(
    input: InterviewPrepInput,
    jobId?: string
  ): Promise<GeneratedQuestionsResult> {
    const adapter = LLMFactory.createAdapter({
      ...this.config,
      apiKey: ConfigManager.getInstance().getAPIKey() || '',
    });

    const systemPrompt = this.createSystemPrompt();
    const userPrompt = this.createUserPrompt(input);

    const response = await adapter.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5,
      maxTokens: 4000,
    });

    // Record usage
    const costTracker = getCostTracker();
    costTracker.recordUsage({
      provider: this.config.provider,
      model: response.model,
      operation: 'interview_question_generation',
      promptTokens: response.usage?.promptTokens || 0,
      completionTokens: response.usage?.completionTokens || 0,
      totalTokens: response.usage?.totalTokens || 0,
      cost: response.cost || 0,
      jobId,
    });

    // Parse the response
    const parsed = this.parseResponse(response.content);

    return {
      questions: parsed.questions,
      technicalTopics: parsed.technicalTopics,
      cost: response.cost || 0,
    };
  }

  /**
   * Create system prompt for question generation
   */
  private createSystemPrompt(): string {
    return `You are an expert interview coach and hiring manager with deep knowledge of technical and behavioral interviews.

YOUR TASK:
Generate realistic, challenging interview questions tailored to the specific job and candidate profile.

QUESTION TYPES TO INCLUDE:
1. Technical - Role-specific technical knowledge and problem-solving
2. Behavioral - STAR method questions about past experiences
3. Situational - Hypothetical scenarios
4. Role-Specific - Questions specific to the job title and seniority
5. Resume-Based - Questions derived from candidate's experience
6. Company-Specific - Questions about why this company/role

RULES:
1. Questions must be specific to the job requirements
2. Technical questions should match the required skills
3. Behavioral questions should probe relevant experience
4. Include context about what the interviewer is looking for
5. Provide tips for answering effectively
6. Suggest follow-up questions the interviewer might ask
7. Rate difficulty based on seniority level

OUTPUT FORMAT:
Return a JSON object with this structure:

{
  "questions": [
    {
      "id": "q1",
      "type": "technical|behavioral|situational|role_specific|resume_based|company_specific",
      "question": "The actual question text",
      "context": "What the interviewer is looking for",
      "expectedAnswer": "Key points a good answer should include",
      "tips": ["Tip 1", "Tip 2", "Tip 3"],
      "followUpQuestions": ["Follow-up 1", "Follow-up 2"],
      "difficulty": "easy|medium|hard",
      "estimatedTimeMinutes": 3
    }
  ],
  "technicalTopics": [
    {
      "name": "Topic name",
      "category": "e.g., Programming, System Design, Leadership",
      "proficiency": "beginner|intermediate|advanced",
      "commonQuestions": ["Question 1", "Question 2"],
      "resources": [
        {
          "title": "Resource name",
          "url": "https://example.com",
          "type": "article|video|documentation|practice"
        }
      ]
    }
  ]
}`;
  }

  /**
   * Create user prompt with job and profile details
   */
  private createUserPrompt(input: InterviewPrepInput): string {
    const config = this.defaultConfig;
    const totalQuestions = config.questionCount;
    const technicalCount = config.includeTechnical ? Math.floor(totalQuestions * 0.4) : 0;
    const behavioralCount = config.includeBehavioral ? Math.floor(totalQuestions * 0.4) : 0;
    const otherCount = totalQuestions - technicalCount - behavioralCount;

    return `Generate ${totalQuestions} interview questions for the following:

## JOB DETAILS

Title: ${input.requirements.roleTitle}
Company: ${input.companyName}
Seniority: ${input.requirements.seniority}

Required Skills:
${input.requirements.mustHaveSkills.map(s => `- ${s}`).join('\n')}

Nice-to-Have Skills:
${input.requirements.niceToHaveSkills.map(s => `- ${s}`).join('\n')}

Responsibilities:
${input.requirements.responsibilities.slice(0, 5).map(r => `- ${r}`).join('\n')}

${input.jobDescription ? `Full Job Description:\n${input.jobDescription.substring(0, 1000)}` : ''}

## CANDIDATE PROFILE

Summary: ${input.profile.summary}

Technical Skills: ${input.profile.skills.technical.join(', ')}

Experience:
${input.profile.experience.map(exp => `
- ${exp.title} at ${exp.company} (${exp.startDate} - ${exp.current ? 'Present' : exp.endDate})
  ${exp.bullets.slice(0, 2).join('\n  ')}
`).join('\n')}

## QUESTION DISTRIBUTION

- Technical Questions: ${technicalCount}
- Behavioral Questions: ${behavioralCount}
- Role-Specific/Other: ${otherCount}

Difficulty Distribution:
- Easy: ${Math.floor(totalQuestions * config.difficultyDistribution.easy)}
- Medium: ${Math.floor(totalQuestions * config.difficultyDistribution.medium)}
- Hard: ${Math.ceil(totalQuestions * config.difficultyDistribution.hard)}

Generate the questions now.`;
  }

  /**
   * Parse LLM response
   */
  private parseResponse(content: string): {
    questions: InterviewQuestion[];
    technicalTopics: TechnicalTopic[];
  } {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const data = JSON.parse(jsonMatch[0]);

      return {
        questions: (data.questions || []).map((q: InterviewQuestion, index: number) => ({
          ...q,
          id: q.id || `q${index + 1}`,
        })),
        technicalTopics: data.technicalTopics || [],
      };
    } catch (error) {
      console.warn('Failed to parse LLM response:', error);

      // Return default questions as fallback
      return {
        questions: this.getDefaultQuestions(),
        technicalTopics: [],
      };
    }
  }

  /**
   * Get default questions as fallback
   */
  private getDefaultQuestions(): InterviewQuestion[] {
    return [
      {
        id: 'q1',
        type: 'behavioral',
        question: 'Tell me about yourself and your background.',
        context: 'The interviewer wants to understand your career trajectory and how you communicate.',
        tips: ['Keep it concise (2-3 minutes)', 'Focus on relevant experience', 'End with why you\'re interested in this role'],
        difficulty: 'easy',
        estimatedTimeMinutes: 3,
      },
      {
        id: 'q2',
        type: 'behavioral',
        question: 'Describe a challenging project you worked on and how you handled it.',
        context: 'Looking for problem-solving skills, resilience, and ability to work under pressure.',
        tips: ['Use the STAR method', 'Focus on your specific contributions', 'Highlight the outcome and lessons learned'],
        difficulty: 'medium',
        estimatedTimeMinutes: 5,
      },
      {
        id: 'q3',
        type: 'behavioral',
        question: 'Tell me about a time you had a conflict with a teammate. How did you resolve it?',
        context: 'Assessing interpersonal skills, emotional intelligence, and conflict resolution.',
        tips: ['Be honest but professional', 'Focus on resolution, not the conflict', 'Show empathy and growth'],
        difficulty: 'medium',
        estimatedTimeMinutes: 4,
      },
      {
        id: 'q4',
        type: 'company_specific',
        question: 'Why do you want to work at our company?',
        context: 'Testing your research and genuine interest in the company.',
        tips: ['Mention specific company values or projects', 'Connect to your career goals', 'Show enthusiasm'],
        difficulty: 'easy',
        estimatedTimeMinutes: 3,
      },
      {
        id: 'q5',
        type: 'role_specific',
        question: 'Where do you see yourself in 5 years?',
        context: 'Understanding your career aspirations and if they align with the role.',
        tips: ['Show ambition but be realistic', 'Connect to growth within the company', 'Demonstrate commitment to the field'],
        difficulty: 'easy',
        estimatedTimeMinutes: 3,
      },
    ];
  }

  /**
   * Generate questions for a specific type
   */
  async generateQuestionsByType(
    input: InterviewPrepInput,
    type: InterviewQuestionType,
    count: number,
    jobId?: string
  ): Promise<InterviewQuestion[]> {
    const adapter = LLMFactory.createAdapter({
      ...this.config,
      apiKey: ConfigManager.getInstance().getAPIKey() || '',
    });

    const systemPrompt = `Generate ${count} ${type} interview questions. Return JSON array of questions.`;
    const userPrompt = this.createUserPrompt(input);

    const response = await adapter.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5,
      maxTokens: 2000,
    });

    // Record usage
    const costTracker = getCostTracker();
    costTracker.recordUsage({
      provider: this.config.provider,
      model: response.model,
      operation: `interview_questions_${type}`,
      promptTokens: response.usage?.promptTokens || 0,
      completionTokens: response.usage?.completionTokens || 0,
      totalTokens: response.usage?.totalTokens || 0,
      cost: response.cost || 0,
      jobId,
    });

    try {
      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback
    }

    return [];
  }
}

// Singleton instance
let questionGeneratorInstance: InterviewQuestionGenerator | null = null;

export function getQuestionGenerator(options?: QuestionGeneratorOptions): InterviewQuestionGenerator {
  if (!questionGeneratorInstance) {
    questionGeneratorInstance = new InterviewQuestionGenerator(options);
  }
  return questionGeneratorInstance;
}
