import type { 
  LLMRequest, 
  LLMResponse, 
  LLMStreamChunk, 
  LLMConfig,
  LLMHealthCheck,
  StreamHandler 
} from './types.js';

export abstract class LLMAdapter {
  protected config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /**
   * Send a completion request to the LLM
   */
  abstract complete(request: LLMRequest): Promise<LLMResponse>;

  /**
   * Stream a completion request
   */
  abstract stream(request: LLMRequest, handler: StreamHandler): Promise<void>;

  /**
   * Check if the LLM service is available
   */
  abstract healthCheck(): Promise<LLMHealthCheck>;

  /**
   * Get the provider name
   */
  abstract getProvider(): string;

  /**
   * Estimate cost for a request (in USD)
   */
  abstract estimateCost(request: LLMRequest): number;

  /**
   * Get default model for this provider
   */
  abstract getDefaultModel(): string;

  /**
   * Validate the configuration
   */
  abstract validateConfig(): { valid: boolean; errors: string[] };

  /**
   * Helper method to create system message for resume tailoring
   */
  protected createResumeSystemPrompt(): string {
    return `You are an expert resume writer and career coach. Your task is to help tailor resumes for specific job descriptions.

IMPORTANT RULES:
1. NEVER invent skills, experiences, or qualifications that the candidate doesn't have
2. Only use information provided in the candidate's profile and achievements
3. Focus on highlighting relevant experience and skills that match the job
4. Use strong action verbs and quantify achievements where possible
5. Keep the tone professional and concise
6. Maintain truthfulness - do not exaggerate or fabricate

Your output should be tailored resume content that honestly represents the candidate's qualifications while emphasizing relevance to the target role.`;
  }

  /**
   * Helper method to create system message for JD analysis
   */
  protected createJDAnalysisSystemPrompt(): string {
    return `You are an expert at analyzing job descriptions and extracting key information.

Your task is to:
1. Extract the role title and seniority level
2. Identify must-have skills and qualifications
3. Identify nice-to-have skills
4. Extract key responsibilities
5. Identify any red flags or concerns
6. Determine the work arrangement (remote/hybrid/onsite)

Be thorough and accurate in your analysis. Only extract information that is explicitly stated or strongly implied in the job description.`;
  }
}