import type { LLMAdapter, LLMMessage } from '../llm/index.js';

export interface ReasoningStep {
  step: number;
  title: string;
  reasoning: string;
  conclusion: string;
  confidence: number;
}

export interface ChainOfThoughtResult<T> {
  finalAnswer: T;
  steps: ReasoningStep[];
  totalConfidence: number;
  reasoningTrace: string;
}

export class ChainOfThoughtReasoner {
  private adapter: LLMAdapter;

  constructor(adapter: LLMAdapter) {
    this.adapter = adapter;
  }

  /**
   * Perform chain-of-thought reasoning for JD analysis
   */
  async analyzeJD(jdText: string): Promise<ChainOfThoughtResult<{
    roleTitle: string;
    seniority: string;
    mustHaveSkills: string[];
    niceToHaveSkills: string[];
    keyResponsibilities: string[];
    redFlags: string[];
  }>> {
    const systemPrompt = `You are an expert job description analyzer. Think step-by-step and show your reasoning.

Follow these steps:
1. Identify the role title and company
2. Determine seniority level based on requirements
3. Extract technical skills (must-have vs nice-to-have)
4. Identify key responsibilities
5. Look for red flags or concerns
6. Summarize your findings

For each step, explain your reasoning before giving the answer.`;

    const userPrompt = `Analyze this job description step-by-step:

${jdText}

Provide your analysis in this format:

STEP 1: Role Identification
Reasoning: [Explain how you identified the role]
Answer: [Role title]

STEP 2: Seniority Assessment
Reasoning: [Explain indicators of seniority level]
Answer: [entry/mid/senior/lead/staff]

STEP 3: Must-Have Skills
Reasoning: [Explain what makes these must-have]
Answer: [List skills]

STEP 4: Nice-to-Have Skills
Reasoning: [Explain what makes these optional]
Answer: [List skills]

STEP 5: Key Responsibilities
Reasoning: [Explain main duties]
Answer: [List responsibilities]

STEP 6: Red Flags
Reasoning: [Explain any concerns]
Answer: [List red flags or "None"]

STEP 7: Final Summary
Reasoning: [Synthesize all findings]
Confidence: [0-100]`;

    const response = await this.adapter.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      maxTokens: 2500,
    });

    return this.parseJDAnalysis(response.content);
  }

  /**
   * Perform chain-of-thought reasoning for resume tailoring
   */
  async tailorResume(
    profile: unknown,
    requirements: unknown
  ): Promise<ChainOfThoughtResult<{
    summary: string;
    skills: string[];
    experience: Array<{ id: string; bullets: string[] }>;
    reasoning: string;
  }>> {
    const systemPrompt = `You are an expert resume writer. Think step-by-step about how to tailor this resume.

Follow these steps:
1. Analyze the job requirements deeply
2. Review the candidate's profile
3. Identify the best matching experiences
4. Decide which skills to emphasize
5. Craft compelling bullet points
6. Ensure truthfulness

Show your reasoning for each decision.`;

    const userPrompt = `Tailor this resume step-by-step:

JOB REQUIREMENTS:
${JSON.stringify(requirements, null, 2)}

CANDIDATE PROFILE:
${JSON.stringify(profile, null, 2)}

Provide your tailoring in this format:

STEP 1: Requirements Analysis
Reasoning: [What are the top 3 requirements?]
Priority: [High/Medium/Low for each]

STEP 2: Profile Review
Reasoning: [What experiences match best?]
Matches: [List matching experiences]

STEP 3: Experience Selection
Reasoning: [Why these specific bullets?]
Selected: [Which bullets to use]

STEP 4: Skill Prioritization
Reasoning: [Why this skill order?]
Skills: [Ordered list]

STEP 5: Summary Crafting
Reasoning: [Why this angle?]
Summary: [2-3 sentences]

STEP 6: Truthfulness Check
Reasoning: [Verify no inventions]
Verified: [Yes/No with explanation]

STEP 7: Final Review
Reasoning: [Overall strategy]
Confidence: [0-100]`;

    const response = await this.adapter.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      maxTokens: 3000,
    });

    return this.parseResumeTailoring(response.content);
  }

  /**
   * Parse JD analysis response
   */
  private parseJDAnalysis(content: string): ChainOfThoughtResult<{
    roleTitle: string;
    seniority: string;
    mustHaveSkills: string[];
    niceToHaveSkills: string[];
    keyResponsibilities: string[];
    redFlags: string[];
  }> {
    const steps: ReasoningStep[] = [];
    
    // Parse each step
    const stepRegex = /STEP (\d+):\s*([^\n]+)\nReasoning:\s*([^\n]+)\n(?:Answer|Priority|Matches|Selected|Skills|Summary|Verified):\s*([^\n]+)/gi;
    let match;
    
    while ((match = stepRegex.exec(content)) !== null) {
      steps.push({
        step: parseInt(match[1]),
        title: match[2].trim(),
        reasoning: match[3].trim(),
        conclusion: match[4].trim(),
        confidence: 80, // Default confidence
      });
    }

    // Extract final confidence
    const confidenceMatch = content.match(/Confidence:\s*(\d+)/);
    const totalConfidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 70;

    // Extract structured data
    const roleMatch = content.match(/STEP 1:[\s\S]*?Answer:\s*([^\n]+)/);
    const seniorityMatch = content.match(/STEP 2:[\s\S]*?Answer:\s*([^\n]+)/);
    const mustHaveMatch = content.match(/STEP 3:[\s\S]*?Answer:\s*([\s\S]*?)(?=STEP 4:|$)/);
    const niceToHaveMatch = content.match(/STEP 4:[\s\S]*?Answer:\s*([\s\S]*?)(?=STEP 5:|$)/);
    const responsibilitiesMatch = content.match(/STEP 5:[\s\S]*?Answer:\s*([\s\S]*?)(?=STEP 6:|$)/);
    const redFlagsMatch = content.match(/STEP 6:[\s\S]*?Answer:\s*([\s\S]*?)(?=STEP 7:|$)/);

    return {
      finalAnswer: {
        roleTitle: roleMatch?.[1].trim() || 'Unknown',
        seniority: seniorityMatch?.[1].trim().toLowerCase() || 'unknown',
        mustHaveSkills: this.parseList(mustHaveMatch?.[1] || ''),
        niceToHaveSkills: this.parseList(niceToHaveMatch?.[1] || ''),
        keyResponsibilities: this.parseList(responsibilitiesMatch?.[1] || ''),
        redFlags: this.parseList(redFlagsMatch?.[1] || ''),
      },
      steps,
      totalConfidence,
      reasoningTrace: content,
    };
  }

  /**
   * Parse resume tailoring response
   */
  private parseResumeTailoring(content: string): ChainOfThoughtResult<{
    summary: string;
    skills: string[];
    experience: Array<{ id: string; bullets: string[] }>;
    reasoning: string;
  }> {
    const steps: ReasoningStep[] = [];
    
    // Similar parsing logic as JD analysis
    const stepRegex = /STEP (\d+):\s*([^\n]+)\nReasoning:\s*([^\n]+)/gi;
    let match;
    
    while ((match = stepRegex.exec(content)) !== null) {
      steps.push({
        step: parseInt(match[1]),
        title: match[2].trim(),
        reasoning: match[3].trim(),
        conclusion: '',
        confidence: 80,
      });
    }

    const confidenceMatch = content.match(/Confidence:\s*(\d+)/);
    const totalConfidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 70;

    // Extract summary
    const summaryMatch = content.match(/STEP 5:[\s\S]*?Summary:\s*([^\n]+)/);
    const skillsMatch = content.match(/STEP 4:[\s\S]*?Skills:\s*([\s\S]*?)(?=STEP 5:|$)/);

    return {
      finalAnswer: {
        summary: summaryMatch?.[1].trim() || '',
        skills: this.parseList(skillsMatch?.[1] || ''),
        experience: [], // Would need more complex parsing
        reasoning: content,
      },
      steps,
      totalConfidence,
      reasoningTrace: content,
    };
  }

  /**
   * Parse a list from text
   */
  private parseList(text: string): string[] {
    return text
      .split(/[\n,]/)
      .map(item => item.trim())
      .filter(item => item && !item.match(/^(none|n\/a|step \d)/i))
      .map(item => item.replace(/^[-•*]\s*/, ''));
  }
}
