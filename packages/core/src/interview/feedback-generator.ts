/**
 * Interview Feedback Generator
 * Provides AI-powered feedback on practice interview answers
 */

import { LLMFactory, getCostTracker } from '../llm/index.js';
import { ConfigManager } from '../config/index.js';
import type {
  InterviewQuestion,
  PracticeAnswer,
  AnswerFeedback,
  InterviewPrepInput,
} from './types.js';

export interface FeedbackGeneratorOptions {
  detailed?: boolean;
}

export class InterviewFeedbackGenerator {
  private config: ReturnType<ConfigManager['getLLMConfig']>;
  private options: FeedbackGeneratorOptions;

  constructor(options: FeedbackGeneratorOptions = {}) {
    const configManager = ConfigManager.getInstance();
    this.config = configManager.getLLMConfig();
    this.options = {
      detailed: true,
      ...options,
    };
  }

  /**
   * Generate feedback for a practice answer
   */
  async generateFeedback(
    question: InterviewQuestion,
    answer: PracticeAnswer,
    input: InterviewPrepInput,
    jobId?: string
  ): Promise<AnswerFeedback> {
    const adapter = LLMFactory.createAdapter({
      ...this.config,
      apiKey: ConfigManager.getInstance().getAPIKey() || '',
    });

    const systemPrompt = this.createSystemPrompt();
    const userPrompt = this.createUserPrompt(question, answer, input);

    const response = await adapter.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      maxTokens: 2000,
    });

    // Record usage
    const costTracker = getCostTracker();
    costTracker.recordUsage({
      provider: this.config.provider,
      model: response.model,
      operation: 'interview_feedback',
      promptTokens: response.usage?.promptTokens || 0,
      completionTokens: response.usage?.completionTokens || 0,
      totalTokens: response.usage?.totalTokens || 0,
      cost: response.cost || 0,
      jobId,
    });

    // Parse the response
    return this.parseResponse(response.content, question.id);
  }

  /**
   * Generate feedback for multiple answers
   */
  async generateBatchFeedback(
    questions: InterviewQuestion[],
    answers: PracticeAnswer[],
    input: InterviewPrepInput,
    jobId?: string
  ): Promise<AnswerFeedback[]> {
    const feedback: AnswerFeedback[] = [];

    for (const answer of answers) {
      const question = questions.find(q => q.id === answer.questionId);
      if (question) {
        const answerFeedback = await this.generateFeedback(
          question,
          answer,
          input,
          jobId
        );
        feedback.push(answerFeedback);
      }
    }

    return feedback;
  }

  /**
   * Create system prompt for feedback generation
   */
  private createSystemPrompt(): string {
    return `You are an expert interview coach providing constructive feedback on practice answers.

YOUR TASK:
Evaluate the candidate's answer and provide detailed, actionable feedback.

EVALUATION CRITERIA:
1. Content Quality - Did they address the question? Were their points relevant?
2. Structure - Was the answer well-organized? Easy to follow?
3. Specificity - Did they use specific examples? Quantify achievements?
4. Communication - Was the answer clear and professional?
5. Time Management - Was the answer appropriately detailed for the time?

FEEDBACK GUIDELINES:
- Be constructive and encouraging
- Highlight specific strengths
- Identify concrete areas for improvement
- Suggest what was missing from an ideal answer
- Provide a model answer as reference
- Suggest follow-up questions they should prepare for

SCORING:
- 90-100: Excellent - Ready for the real interview
- 80-89: Good - Minor improvements needed
- 70-79: Adequate - Some gaps to address
- 60-69: Needs Work - Significant improvements needed
- Below 60: Major revision required

OUTPUT FORMAT:
Return a JSON object:
{
  "score": 85,
  "strengths": ["Specific strength 1", "Strength 2"],
  "improvements": ["Area to improve 1", "Area 2"],
  "missingPoints": ["Key point they missed"],
  "suggestedAnswer": "A model answer they could learn from",
  "followUpQuestions": ["Questions the interviewer might ask next"]
}`;
  }

  /**
   * Create user prompt with question and answer
   */
  private createUserPrompt(
    question: InterviewQuestion,
    answer: PracticeAnswer,
    input: InterviewPrepInput
  ): string {
    return `Please evaluate this interview answer:

## QUESTION

Type: ${question.type}
Difficulty: ${question.difficulty}
Question: ${question.question}

${question.context ? `Context: ${question.context}` : ''}

${question.expectedAnswer ? `Expected Answer Points: ${question.expectedAnswer}` : ''}

## CANDIDATE'S ANSWER

${answer.answer}

Time Taken: ${answer.timeTakenSeconds} seconds
Self-Rated Confidence: ${answer.confidence}/10

## CANDIDATE PROFILE

Role: ${input.requirements.roleTitle}
Experience Level: ${input.requirements.seniority}

Summary: ${input.profile.summary}

Relevant Experience:
${input.profile.experience.slice(0, 2).map(exp => `- ${exp.title} at ${exp.company}`).join('\n')}

Provide detailed feedback in the JSON format specified.`;
  }

  /**
   * Parse LLM response
   */
  private parseResponse(content: string, questionId: string): AnswerFeedback {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const data = JSON.parse(jsonMatch[0]);

      return {
        questionId,
        score: data.score || 70,
        strengths: data.strengths || [],
        improvements: data.improvements || [],
        missingPoints: data.missingPoints || [],
        suggestedAnswer: data.suggestedAnswer || '',
        followUpQuestions: data.followUpQuestions || [],
      };
    } catch (error) {
      console.warn('Failed to parse feedback response:', error);

      // Return default feedback as fallback
      return {
        questionId,
        score: 70,
        strengths: ['Attempted to answer the question'],
        improvements: ['Review the suggested answer for improvements'],
        missingPoints: ['Unable to analyze specific missing points'],
        suggestedAnswer: 'Please try again with a more detailed answer.',
        followUpQuestions: [],
      };
    }
  }

  /**
   * Generate overall session recommendations
   */
  async generateRecommendations(
    feedback: AnswerFeedback[],
    input: InterviewPrepInput,
    jobId?: string
  ): Promise<string[]> {
    const adapter = LLMFactory.createAdapter({
      ...this.config,
      apiKey: ConfigManager.getInstance().getAPIKey() || '',
    });

    const avgScore = feedback.reduce((sum, f) => sum + f.score, 0) / feedback.length;
    const weakAreas = feedback
      .filter(f => f.score < 75)
      .flatMap(f => f.improvements)
      .slice(0, 5);

    const systemPrompt = `You are an expert interview coach. Provide 3-5 actionable recommendations based on the practice session results.`;

    const userPrompt = `Based on this interview practice session, provide recommendations:

Average Score: ${avgScore.toFixed(1)}/100

Areas for Improvement:
${weakAreas.map(a => `- ${a}`).join('\n')}

Provide 3-5 specific, actionable recommendations to improve interview performance.
Return as a JSON array of strings.`;

    const response = await adapter.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5,
      maxTokens: 1000,
    });

    // Record usage
    const costTracker = getCostTracker();
    costTracker.recordUsage({
      provider: this.config.provider,
      model: response.model,
      operation: 'interview_recommendations',
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

    return [
      'Practice more behavioral questions using the STAR method',
      'Review technical concepts relevant to the role',
      'Prepare specific examples from your experience',
      'Work on concise communication',
    ];
  }
}

// Singleton instance
let feedbackGeneratorInstance: InterviewFeedbackGenerator | null = null;

export function getFeedbackGenerator(options?: FeedbackGeneratorOptions): InterviewFeedbackGenerator {
  if (!feedbackGeneratorInstance) {
    feedbackGeneratorInstance = new InterviewFeedbackGenerator(options);
  }
  return feedbackGeneratorInstance;
}
