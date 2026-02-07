import type { UserProfile, JDRequirements, TailoredResume, ResumeChange } from '@applypilot/core';
import { ResumeTemplate } from './template.js';

export interface TailorOptions {
  maxSkills: number;
  maxBulletPoints: number;
  enforceTruthfulness: boolean;
}

export class ResumeTailor {
  private template: ResumeTemplate;
  private options: TailorOptions;

  constructor(templatePath: string, options: TailorOptions) {
    this.template = new ResumeTemplate(templatePath);
    this.options = options;
  }

  /**
   * Tailor resume based on JD requirements
   * This is a placeholder - actual implementation will use LLM
   */
  async tailor(profile: UserProfile, requirements: JDRequirements): Promise<{
    tailored: TailoredResume;
    changes: ResumeChange[];
    latex: string;
  }> {
    // TODO: Implement LLM-based tailoring
    const tailored: TailoredResume = {
      summary: profile.summary,
      skills: profile.skills.technical.slice(0, this.options.maxSkills),
      experience: profile.experience.map((exp) => ({
        id: exp.id,
        bullets: exp.bullets.slice(0, this.options.maxBulletPoints),
      })),
    };

    const changes: ResumeChange[] = [];

    // Generate LaTeX content
    const summaryLatex = this.generateSummaryLatex(tailored.summary);
    const skillsLatex = this.generateSkillsLatex(tailored.skills);
    const experienceLatex = this.generateExperienceLatex(profile.experience, tailored.experience);

    const { content: latex } = this.template.patch({
      summary: summaryLatex,
      skills: skillsLatex,
      experience: experienceLatex,
    });

    return { tailored, changes, latex };
  }

  private generateSummaryLatex(summary: string): string {
    return `\\section{Summary}\n${summary}`;
  }

  private generateSkillsLatex(skills: string[]): string {
    return `\\section{Skills}\n\\begin{itemize}\n${skills.map((s) => `  \\item ${s}`).join('\n')}\n\\end{itemize}`;
  }

  private generateExperienceLatex(
    experiences: UserProfile['experience'],
    tailored: TailoredResume['experience']
  ): string {
    return experiences
      .map((exp) => {
        const tailoredExp = tailored.find((e) => e.id === exp.id);
        const bullets = tailoredExp?.bullets || exp.bullets;
        return `\\subsection{${exp.title} at ${exp.company}}
\\begin{itemize}
${bullets.map((b) => `  \\item ${b}`).join('\n')}
\\end{itemize}`;
      })
      .join('\n\n');
  }

  validateTemplate(): { valid: boolean; missing: string[] } {
    return this.template.validate();
  }
}
