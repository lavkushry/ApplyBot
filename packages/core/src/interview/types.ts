/**
 * Interview Preparation Types
 * Types for interview question generation, practice sessions, and feedback
 */

import type { JDRequirements, UserProfile } from '../types/index.js';

export interface InterviewQuestion {
  id: string;
  type: InterviewQuestionType;
  question: string;
  context?: string;
  expectedAnswer?: string;
  tips: string[];
  followUpQuestions?: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedTimeMinutes: number;
}

export type InterviewQuestionType =
  | 'technical'
  | 'behavioral'
  | 'situational'
  | 'cultural_fit'
  | 'company_specific'
  | 'role_specific'
  | 'system_design'
  | 'coding'
  | 'resume_based';

export interface InterviewPrepSession {
  id: string;
  jobId: string;
  createdAt: Date;
  questions: InterviewQuestion[];
  progress: SessionProgress;
  config: InterviewConfig;
}

export interface SessionProgress {
  totalQuestions: number;
  answeredQuestions: number;
  correctAnswers: number;
  timeSpentMinutes: number;
  currentQuestionIndex: number;
}

export interface InterviewConfig {
  questionTypes: InterviewQuestionType[];
  questionCount: number;
  includeTechnical: boolean;
  includeBehavioral: boolean;
  difficultyDistribution: {
    easy: number;
    medium: number;
    hard: number;
  };
  timeLimitMinutes?: number;
}

export interface PracticeAnswer {
  questionId: string;
  answer: string;
  timeTakenSeconds: number;
  confidence: number;
  notes?: string;
}

export interface AnswerFeedback {
  questionId: string;
  score: number;
  strengths: string[];
  improvements: string[];
  missingPoints: string[];
  suggestedAnswer: string;
  followUpQuestions: string[];
}

export interface InterviewPrepResult {
  session: InterviewPrepSession;
  answers: PracticeAnswer[];
  feedback: AnswerFeedback[];
  overallScore: number;
  recommendations: string[];
  cost: number;
}

export interface CompanyResearch {
  companyName: string;
  mission?: string;
  values: string[];
  recentNews: NewsItem[];
  interviewProcess?: string;
  commonQuestions: string[];
  glassdoorRating?: number;
  cultureKeywords: string[];
}

export interface NewsItem {
  title: string;
  date: string;
  summary: string;
  url?: string;
}

export interface TechnicalTopic {
  name: string;
  category: string;
  proficiency: 'beginner' | 'intermediate' | 'advanced';
  commonQuestions: string[];
  resources: ResourceLink[];
}

export interface ResourceLink {
  title: string;
  url: string;
  type: 'article' | 'video' | 'documentation' | 'practice';
}

export interface InterviewPrepInput {
  profile: UserProfile;
  requirements: JDRequirements;
  companyName: string;
  jobDescription?: string;
}

export interface GeneratedQuestionsResult {
  questions: InterviewQuestion[];
  companyResearch?: CompanyResearch;
  technicalTopics: TechnicalTopic[];
  cost: number;
}

export interface MockInterviewResult {
  transcript: InterviewTranscriptItem[];
  overallScore: number;
  technicalScore: number;
  communicationScore: number;
  culturalFitScore: number;
  strengths: string[];
  areasForImprovement: string[];
  nextSteps: string[];
}

export interface InterviewTranscriptItem {
  role: 'interviewer' | 'candidate';
  content: string;
  timestamp: Date;
  questionType?: InterviewQuestionType;
}
