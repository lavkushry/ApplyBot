import type { LLMAdapter } from '../llm/index.js';

export interface FewShotExample {
  input: string;
  output: string;
  explanation?: string;
}

export interface FewShotConfig {
  examples: FewShotExample[];
  maxExamples: number;
  similarityThreshold: number;
}

export class FewShotLearner {
  private adapter: LLMAdapter;
  private examples: Map<string, FewShotExample[]> = new Map();

  constructor(adapter: LLMAdapter) {
    this.adapter = adapter;
  }

  /**
   * Add examples for a specific task
   */
  addExamples(task: string, examples: FewShotExample[]): void {
    this.examples.set(task, examples);
  }

  /**
   * Get relevant examples based on input similarity
   */
  getRelevantExamples(task: string, input: string, maxExamples: number = 3): FewShotExample[] {
    const taskExamples = this.examples.get(task) || [];
    
    // Simple keyword-based similarity (could be enhanced with embeddings)
    const scored = taskExamples.map(example => ({
      example,
      score: this.calculateSimilarity(input, example.input),
    }));

    // Sort by similarity and return top examples
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxExamples)
      .map(s => s.example);
  }

  /**
   * Create a few-shot prompt with examples
   */
  createFewShotPrompt(
    task: string,
    input: string,
    instructions: string,
    maxExamples: number = 3
  ): string {
    const examples = this.getRelevantExamples(task, input, maxExamples);
    
    let prompt = `${instructions}\n\n`;
    
    if (examples.length > 0) {
      prompt += `Here are some examples:\n\n`;
      
      examples.forEach((example, i) => {
        prompt += `Example ${i + 1}:\n`;
        prompt += `Input: ${example.input}\n`;
        prompt += `Output: ${example.output}\n`;
        if (example.explanation) {
          prompt += `Explanation: ${example.explanation}\n`;
        }
        prompt += `\n`;
      });
    }
    
    prompt += `Now, please process this input:\n${input}\n`;
    
    return prompt;
  }

  /**
   * Calculate simple keyword similarity
   */
  private calculateSimilarity(input1: string, input2: string): number {
    const words1 = new Set(input1.toLowerCase().split(/\s+/));
    const words2 = new Set(input2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * Pre-defined examples for resume tailoring
   */
  static getResumeTailoringExamples(): FewShotExample[] {
    return [
      {
        input: `Job: Senior Software Engineer at TechCorp
Requirements: React, TypeScript, Node.js, 5+ years experience
Candidate: 6 years experience, React expert, some Node.js`,
        output: `SUMMARY: Senior Software Engineer with 6 years of experience specializing in React and TypeScript. Proven track record building scalable web applications with Node.js backends.

SKILLS: React, TypeScript, Node.js, JavaScript, HTML/CSS, Git, REST APIs

EXPERIENCE HIGHLIGHTS:
- Led development of React-based dashboard serving 10K+ daily users
- Built RESTful APIs with Node.js handling 1M+ requests/day
- Mentored junior developers in React best practices`,
        explanation: `Emphasized React and TypeScript (must-haves), highlighted Node.js experience even though not primary skill, quantified achievements`,
      },
      {
        input: `Job: Data Scientist at AI Startup
Requirements: Python, Machine Learning, SQL, TensorFlow
Candidate: Python expert, ML background, some SQL, no TensorFlow`,
        output: `SUMMARY: Data Scientist with strong Python and machine learning background. Experienced in building predictive models and working with large datasets using SQL.

SKILLS: Python, Machine Learning, SQL, scikit-learn, Pandas, NumPy, Data Visualization

EXPERIENCE HIGHLIGHTS:
- Developed ML models improving prediction accuracy by 25%
- Analyzed 10M+ row datasets using Python and SQL
- Built data pipelines processing 1TB+ daily`,
        explanation: `Led with Python and ML (strong matches), included SQL prominently, avoided mentioning lack of TensorFlow, focused on quantified ML achievements`,
      },
      {
        input: `Job: Product Manager at FinTech
Requirements: Product strategy, Agile, Financial services experience
Candidate: 4 years PM experience, Agile certified, no FinTech background`,
        output: `SUMMARY: Product Manager with 4 years of experience driving product strategy and Agile development. Proven ability to deliver complex products in regulated industries.

SKILLS: Product Strategy, Agile/Scrum, User Research, Data Analysis, Stakeholder Management

EXPERIENCE HIGHLIGHTS:
- Led product strategy for B2B SaaS platform generating $5M ARR
- Managed Agile teams of 10+ developers across 3 time zones
- Launched 5 major products on time and under budget`,
        explanation: `Emphasized product strategy and Agile (matches), highlighted regulated industry experience (similar to FinTech), used financial metrics (ARR) to show business acumen`,
      },
    ];
  }

  /**
   * Pre-defined examples for cover letter generation
   */
  static getCoverLetterExamples(): FewShotExample[] {
    return [
      {
        input: `Job: Software Engineer at Google
Candidate: Full-stack developer, 3 years experience, passionate about search technology`,
        output: `Dear Hiring Manager,

I'm excited to apply for the Software Engineer position at Google. As a full-stack developer with 3 years of experience building scalable web applications, I'm particularly drawn to Google's mission of organizing the world's information.

In my current role, I've developed search functionality that processes 100K+ queries daily, giving me direct experience with the challenges Google solves at scale. I've also contributed to open-source projects related to information retrieval, which aligns with Google's engineering culture.

I would welcome the opportunity to discuss how my experience with high-scale systems and passion for search technology could contribute to Google's continued innovation.

Best regards,
[Name]`,
        explanation: `Connected candidate's search experience to Google's mission, mentioned relevant technical experience, showed passion for the specific domain`,
      },
      {
        input: `Job: Product Manager at Stripe
Candidate: Technical background, previous PM experience at startup, interested in payments`,
        output: `Dear Stripe Team,

I'm writing to express my interest in the Product Manager role at Stripe. Having led product development at a fast-growing startup, I understand the critical importance of reliable payment infrastructure—I've experienced the pain of payment failures firsthand.

My technical background in software engineering allows me to work closely with developers, while my product experience has taught me to balance technical constraints with user needs. At my current company, I launched a payment integration that reduced checkout abandonment by 30%.

Stripe's developer-first approach to payments resonates deeply with me. I'd love to discuss how my combination of technical expertise and product intuition could help Stripe continue to empower online businesses.

Sincerely,
[Name]`,
        explanation: `Showed understanding of Stripe's developer focus, used specific metric (30% reduction), connected personal experience to company mission`,
      },
    ];
  }

  /**
   * Pre-defined examples for JD analysis
   */
  static getJDAnalysisExamples(): FewShotExample[] {
    return [
      {
        input: `Job Description:
"We're looking for a rockstar ninja developer who can wear many hats. Must be passionate about our mission. Unlimited PTO (subject to manager approval). Fast-paced environment."`,
        output: `ROLE: Software Developer
SENIORITY: Unknown (buzzwords suggest junior/mid)
MUST-HAVE: Not clearly specified
NICE-TO-HAVE: Not specified
RED FLAGS:
- "Rockstar/ninja" terminology (often indicates unclear expectations)
- "Wear many hats" (may mean understaffed)
- "Fast-paced" (potential for overwork)
- Unlimited PTO with approval (may not be truly unlimited)

FIT ASSESSMENT: Low - Job description lacks specific technical requirements and contains multiple red flags`,
        explanation: `Identified buzzwords and vague language as red flags, noted lack of specific requirements, provided honest assessment`,
      },
      {
        input: `Job Description:
"Senior Backend Engineer. 5+ years Python experience required. Must have experience with distributed systems and microservices. Experience with AWS and Kubernetes preferred. Competitive salary and benefits."`,
        output: `ROLE: Senior Backend Engineer
SENIORITY: Senior (5+ years, specific tech requirements)
MUST-HAVE: Python (5+ years), Distributed Systems, Microservices
NICE-TO-HAVE: AWS, Kubernetes
RED FLAGS: None identified

FIT ASSESSMENT: High - Clear requirements, specific technologies, appropriate seniority indicators`,
        explanation: `Recognized clear technical requirements, distinguished must-have from nice-to-have, noted appropriate seniority indicators`, 
      },
    ];
  }
}
