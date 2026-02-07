import type { LLMAdapter } from '../llm/index.js';
import { getOutcomeTracker } from './outcome-tracker.js';
import { getFeedbackCollector } from './feedback-collector.js';

export interface PromptTemplate {
  id: string;
  name: string;
  task: string;
  template: string;
  version: number;
  performance: {
    uses: number;
    avgRating: number;
    successRate: number;
  };
}

export interface OptimizationSuggestion {
  currentPrompt: string;
  suggestedPrompt: string;
  reason: string;
  expectedImprovement: string;
}

export class PromptOptimizer {
  private adapter: LLMAdapter;
  private templates: Map<string, PromptTemplate> = new Map();

  constructor(adapter: LLMAdapter) {
    this.adapter = adapter;
    this.loadDefaultTemplates();
  }

  /**
   * Load default prompt templates
   */
  private loadDefaultTemplates(): void {
    const templates: PromptTemplate[] = [
      {
        id: 'jd_analysis_v1',
        name: 'JD Analysis - Standard',
        task: 'jd_analysis',
        template: `Analyze this job description and extract key information:

{{jd_text}}

Provide:
1. Role title
2. Seniority level
3. Must-have skills
4. Nice-to-have skills
5. Key responsibilities`,
        version: 1,
        performance: { uses: 0, avgRating: 0, successRate: 0 },
      },
      {
        id: 'jd_analysis_v2',
        name: 'JD Analysis - Chain of Thought',
        task: 'jd_analysis',
        template: `Analyze this job description step by step:

{{jd_text}}

STEP 1: Read through the entire description
STEP 2: Identify the main role and seniority indicators
STEP 3: Extract required technical skills
STEP 4: Extract preferred/nice-to-have skills
STEP 5: List key responsibilities
STEP 6: Identify any red flags or concerns
STEP 7: Summarize your findings

Provide detailed reasoning for each step.`,
        version: 2,
        performance: { uses: 0, avgRating: 0, successRate: 0 },
      },
      {
        id: 'resume_tailor_v1',
        name: 'Resume Tailoring - Standard',
        task: 'resume_tailoring',
        template: `Tailor this resume for the job:

JOB REQUIREMENTS:
{{requirements}}

CANDIDATE PROFILE:
{{profile}}

Provide:
1. Professional summary
2. Skills list (prioritized)
3. Experience bullets`,
        version: 1,
        performance: { uses: 0, avgRating: 0, successRate: 0 },
      },
      {
        id: 'resume_tailor_v2',
        name: 'Resume Tailoring - Few-Shot',
        task: 'resume_tailoring',
        template: `You are an expert resume writer. Here are examples of good tailoring:

EXAMPLE 1:
Input: Senior Frontend Engineer role, React expert candidate
Output: "Senior Frontend Engineer with 5+ years building React applications..."

EXAMPLE 2:
Input: Data Scientist role, Python/ML background
Output: "Data Scientist specializing in machine learning and predictive analytics..."

Now tailor this resume:

JOB: {{requirements}}
CANDIDATE: {{profile}}

Provide tailored content following the examples above.`,
        version: 2,
        performance: { uses: 0, avgRating: 0, successRate: 0 },
      },
    ];

    for (const template of templates) {
      this.templates.set(template.id, template);
    }
  }

  /**
   * Get best performing template for a task
   */
  getBestTemplate(task: string): PromptTemplate | null {
    const taskTemplates = Array.from(this.templates.values())
      .filter(t => t.task === task);

    if (taskTemplates.length === 0) return null;

    // Sort by performance score (success rate * avg rating)
    return taskTemplates.sort((a, b) => {
      const scoreA = a.performance.successRate * a.performance.avgRating;
      const scoreB = b.performance.successRate * b.performance.avgRating;
      return scoreB - scoreA;
    })[0];
  }

  /**
   * Update template performance
   */
  updateTemplatePerformance(templateId: string, rating: number, outcome: 'success' | 'failure'): void {
    const template = this.templates.get(templateId);
    if (!template) return;

    const { performance } = template;
    const newUses = performance.uses + 1;
    
    // Update average rating
    performance.avgRating = ((performance.avgRating * performance.uses) + rating) / newUses;
    
    // Update success rate
    const successCount = performance.successRate * performance.uses + (outcome === 'success' ? 1 : 0);
    performance.successRate = successCount / newUses;
    
    performance.uses = newUses;
  }

  /**
   * Analyze feedback to suggest prompt improvements
   */
  async analyzeForImprovements(): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];
    
    const feedbackCollector = getFeedbackCollector();
    const lowRatedFeedback = feedbackCollector.getLowRatedFeedback(50);
    
    // Group feedback by issue type
    const issuePatterns: Record<string, string[]> = {
      'too_generic': [],
      'missing_skills': [],
      'wrong_tone': [],
      'formatting_issues': [],
    };

    for (const feedback of lowRatedFeedback) {
      if (feedback.comments) {
        const lowerComment = feedback.comments.toLowerCase();
        if (lowerComment.includes('generic') || lowerComment.includes('template')) {
          issuePatterns.too_generic.push(feedback.comments);
        }
        if (lowerComment.includes('skill') || lowerComment.includes('missing')) {
          issuePatterns.missing_skills.push(feedback.comments);
        }
        if (lowerComment.includes('tone') || lowerComment.includes('formal')) {
          issuePatterns.wrong_tone.push(feedback.comments);
        }
      }
    }

    // Generate suggestions based on common issues
    if (issuePatterns.too_generic.length > 5) {
      suggestions.push({
        currentPrompt: 'Standard template-based generation',
        suggestedPrompt: 'Add specific instructions to avoid generic language and include company-specific details',
        reason: `${issuePatterns.too_generic.length} users reported content being too generic`,
        expectedImprovement: 'More personalized, specific content',
      });
    }

    if (issuePatterns.missing_skills.length > 5) {
      suggestions.push({
        currentPrompt: 'Standard skill extraction',
        suggestedPrompt: 'Add explicit instruction to cross-reference all job requirements with candidate skills',
        reason: `${issuePatterns.missing_skills.length} users reported missing relevant skills`,
        expectedImprovement: 'Better skill matching and coverage',
      });
    }

    if (issuePatterns.wrong_tone.length > 5) {
      suggestions.push({
        currentPrompt: 'Standard professional tone',
        suggestedPrompt: 'Add tone calibration based on company culture indicators in JD',
        reason: `${issuePatterns.wrong_tone.length} users reported tone issues`,
        expectedImprovement: 'Better tone alignment with company culture',
      });
    }

    return suggestions;
  }

  /**
   * Auto-optimize prompts based on outcomes
   */
  async autoOptimize(): Promise<{
    optimizations: Array<{
      task: string;
      oldTemplate: string;
      newTemplate: string;
      reason: string;
    }>;
  }> {
    const outcomeTracker = getOutcomeTracker();
    const metrics = outcomeTracker.getSuccessMetrics();
    const optimizations: Array<{
      task: string;
      oldTemplate: string;
      newTemplate: string;
      reason: string;
    }> = [];

    // Check if current templates are underperforming
    const insights = outcomeTracker.getInsights();
    
    for (const insight of insights) {
      if (insight.insight.includes('success rate')) {
        // Suggest template improvements
        const oldTemplate = this.getBestTemplate('resume_tailoring');
        if (oldTemplate) {
          const newTemplate = await this.generateImprovedTemplate(
            oldTemplate,
            insight.recommendation
          );
          
          optimizations.push({
            task: 'resume_tailoring',
            oldTemplate: oldTemplate.template,
            newTemplate,
            reason: insight.insight,
          });
        }
      }
    }

    return { optimizations };
  }

  /**
   * Generate an improved template based on feedback
   */
  private async generateImprovedTemplate(
    currentTemplate: PromptTemplate,
    improvementGoal: string
  ): Promise<string> {
    const prompt = `Improve this prompt template to achieve: ${improvementGoal}

Current Template:
${currentTemplate.template}

Provide an improved version that addresses the goal while maintaining clarity and effectiveness.`;

    const response = await this.adapter.complete({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      maxTokens: 1000,
    });

    return response.content;
  }

  /**
   * Create a new template variant for A/B testing
   */
  createTemplateVariant(
    baseTemplateId: string,
    modifications: string
  ): PromptTemplate | null {
    const baseTemplate = this.templates.get(baseTemplateId);
    if (!baseTemplate) return null;

    const newTemplate: PromptTemplate = {
      id: `${baseTemplate.task}_v${baseTemplate.version + 1}`,
      name: `${baseTemplate.name} - Optimized`,
      task: baseTemplate.task,
      template: `${baseTemplate.template}\n\nADDITIONAL INSTRUCTIONS:\n${modifications}`,
      version: baseTemplate.version + 1,
      performance: { uses: 0, avgRating: 0, successRate: 0 },
    };

    this.templates.set(newTemplate.id, newTemplate);
    return newTemplate;
  }

  /**
   * Get all templates for a task
   */
  getTemplatesForTask(task: string): PromptTemplate[] {
    return Array.from(this.templates.values())
      .filter(t => t.task === task)
      .sort((a, b) => b.version - a.version);
  }

  /**
   * Render a template with variables
   */
  renderTemplate(templateId: string, variables: Record<string, string>): string {
    const template = this.templates.get(templateId);
    if (!template) throw new Error(`Template not found: ${templateId}`);

    let rendered = template.template;
    for (const [key, value] of Object.entries(variables)) {
      rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    return rendered;
  }
}

// Singleton instance
let promptOptimizerInstance: PromptOptimizer | null = null;

export function getPromptOptimizer(adapter: LLMAdapter): PromptOptimizer {
  if (!promptOptimizerInstance) {
    promptOptimizerInstance = new PromptOptimizer(adapter);
  }
  return promptOptimizerInstance;
}
