/**
 * Interview Preparation Module
 *
 * Provides interview question generation, practice sessions, and AI-powered feedback.
 *
 * Usage:
 * ```typescript
 * import { InterviewQuestionGenerator, InterviewFeedbackGenerator } from '@applypilot/core/interview';
 *
 * // Generate questions
 * const generator = new InterviewQuestionGenerator();
 * const result = await generator.generateQuestions({
 *   profile: userProfile,
 *   requirements: jdRequirements,
 *   companyName: 'Tech Corp',
 * });
 *
 * // Get feedback on answers
 * const feedbackGen = new InterviewFeedbackGenerator();
 * const feedback = await feedbackGen.generateFeedback(question, answer, input);
 * ```
 */

export * from './types.js';
export { InterviewQuestionGenerator, getQuestionGenerator } from './question-generator.js';
export { InterviewFeedbackGenerator, getFeedbackGenerator } from './feedback-generator.js';
