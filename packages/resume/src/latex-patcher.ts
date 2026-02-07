/**
 * LaTeX Patcher - Safe LaTeX Modification System
 *
 * Patches LaTeX files using markers for safe, reversible changes.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import type { LatexPatch, LatexSection, ResumeTailoringResult, TailoringConfig } from './types.js';

export interface LatexPatcherOptions {
  basePath: string;
  backupOnPatch: boolean;
}

export class LatexPatcher {
  private basePath: string;
  private backupOnPatch: boolean;
  private patches: Map<string, LatexPatch[]> = new Map();

  constructor(options: LatexPatcherOptions) {
    this.basePath = options.basePath;
    this.backupOnPatch = options.backupOnPatch ?? true;
  }

  /**
   * Load a LaTeX file and parse its sections
   */
  loadLatexFile(filename: string): string {
    const filePath = resolve(this.basePath, filename);
    if (!existsSync(filePath)) {
      throw new Error(`LaTeX file not found: ${filePath}`);
    }
    return readFileSync(filePath, 'utf-8');
  }

  /**
   * Parse LaTeX sections using markers
   * Markers format: %%AP_SECTION_NAME%%
   */
  parseSections(latexContent: string): LatexSection[] {
    const sections: LatexSection[] = [];
    const markerRegex = /%%AP_([A-Z_]+)%%/g;
    let match;

    const markers: { name: string; index: number }[] = [];
    while ((match = markerRegex.exec(latexContent)) !== null) {
      markers.push({ name: match[1], index: match.index });
    }

    for (let i = 0; i < markers.length; i++) {
      const current = markers[i];
      const next = markers[i + 1];
      const endIndex = next ? next.index : latexContent.length;

      const content = latexContent.substring(
        current.index + current.name.length + 6, // +6 for %%AP_ and %%
        endIndex
      );

      sections.push({
        name: current.name,
        marker: `%%AP_${current.name}%%`,
        content: content.trim(),
        patches: [],
      });
    }

    return sections;
  }

  /**
   * Create a patch for a section
   */
  createPatch(
    sectionName: string,
    originalContent: string,
    newContent: string,
    reason: string
  ): LatexPatch {
    return {
      id: this.generatePatchId(),
      marker: `%%AP_${sectionName}%%`,
      originalContent,
      newContent,
      reason,
      section: sectionName,
    };
  }

  /**
   * Apply a patch to LaTeX content
   */
  applyPatch(latexContent: string, patch: LatexPatch): string {
    const markerRegex = new RegExp(
      `${patch.marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s\\S]*?)(?=%%AP_|$)`
    );

    if (!markerRegex.test(latexContent)) {
      throw new Error(`Marker ${patch.marker} not found in LaTeX content`);
    }

    return latexContent.replace(markerRegex, `${patch.marker}\n${patch.newContent}\n`);
  }

  /**
   * Apply multiple patches atomically
   */
  applyPatches(latexContent: string, patches: LatexPatch[]): string {
    let patchedContent = latexContent;

    for (const patch of patches) {
      patchedContent = this.applyPatch(patchedContent, patch);
    }

    return patchedContent;
  }

  /**
   * Revert a patch (restore original content)
   */
  revertPatch(latexContent: string, patch: LatexPatch): string {
    return this.applyPatch(latexContent, {
      ...patch,
      newContent: patch.originalContent,
    });
  }

  /**
   * Generate a diff between original and patched content
   */
  generateDiff(original: string, patched: string): string {
    const originalLines = original.split('\n');
    const patchedLines = patched.split('\n');
    const diff: string[] = [];

    let i = 0;
    let j = 0;

    while (i < originalLines.length || j < patchedLines.length) {
      const originalLine = originalLines[i];
      const patchedLine = patchedLines[j];

      if (originalLine === patchedLine) {
        diff.push(` ${originalLine}`);
        i++;
        j++;
      } else if (originalLine !== undefined && !patchedLines.includes(originalLine)) {
        diff.push(`-${originalLine}`);
        i++;
      } else if (patchedLine !== undefined && !originalLines.includes(patchedLine)) {
        diff.push(`+${patchedLine}`);
        j++;
      } else {
        diff.push(`-${originalLine}`);
        diff.push(`+${patchedLine}`);
        i++;
        j++;
      }
    }

    return diff.join('\n');
  }

  /**
   * Save patched LaTeX to file
   */
  savePatchedLatex(filename: string, content: string, backup: boolean = true): void {
    const filePath = resolve(this.basePath, filename);

    if (backup && this.backupOnPatch && existsSync(filePath)) {
      const backupPath = `${filePath}.backup.${Date.now()}`;
      writeFileSync(backupPath, readFileSync(filePath, 'utf-8'));
    }

    writeFileSync(filePath, content);
  }

  /**
   * Validate LaTeX syntax (basic checks)
   */
  validateLatex(latexContent: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for unclosed environments
    const envBegin = (latexContent.match(/\\begin\{/g) || []).length;
    const envEnd = (latexContent.match(/\\end\{/g) || []).length;
    if (envBegin !== envEnd) {
      errors.push(`Unbalanced environments: ${envBegin} begin, ${envEnd} end`);
    }

    // Check for unclosed braces
    const openBraces = (latexContent.match(/\{/g) || []).length;
    const closeBraces = (latexContent.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      errors.push(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
    }

    // Check for required markers
    const requiredMarkers = ['%%AP_HEADER%%', '%%AP_EXPERIENCE%%', '%%AP_SKILLS%%'];
    for (const marker of requiredMarkers) {
      if (!latexContent.includes(marker)) {
        errors.push(`Missing required marker: ${marker}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Tailor resume based on job requirements
   */
  tailorResume(
    latexContent: string,
    jobRequirements: {
      requiredSkills: string[];
      preferredSkills: string[];
      keywords: string[];
    },
    config: TailoringConfig
  ): ResumeTailoringResult {
    const sections = this.parseSections(latexContent);
    const patches: LatexPatch[] = [];
    const keywordsAdded: string[] = [];
    const keywordsRemoved: string[] = [];

    // Tailor skills section
    const skillsSection = sections.find((s) => s.name === 'SKILLS');
    if (skillsSection && config.sectionsToTailor.includes('skills')) {
      const tailoredSkills = this.tailorSkillsSection(
        skillsSection.content,
        jobRequirements.requiredSkills,
        jobRequirements.preferredSkills,
        config
      );

      if (tailoredSkills !== skillsSection.content) {
        patches.push(
          this.createPatch('SKILLS', skillsSection.content, tailoredSkills, 'Tailored for job requirements')
        );
      }
    }

    // Tailor experience section
    const experienceSection = sections.find((s) => s.name === 'EXPERIENCE');
    if (experienceSection && config.sectionsToTailor.includes('experience')) {
      const tailoredExperience = this.tailorExperienceSection(
        experienceSection.content,
        jobRequirements.keywords,
        config
      );

      if (tailoredExperience !== experienceSection.content) {
        patches.push(
          this.createPatch(
            'EXPERIENCE',
            experienceSection.content,
            tailoredExperience,
            'Highlighted relevant achievements'
          )
        );
      }
    }

    // Apply patches
    const patchedContent = this.applyPatches(latexContent, patches);

    // Calculate tailoring score
    const tailoringScore = this.calculateTailoringScore(
      latexContent,
      patchedContent,
      jobRequirements
    );

    return {
      resume: {
        id: this.generateResumeId(),
        name: 'tailored-resume',
        basePath: this.basePath,
        latexPath: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
        metadata: {
          keywordsMatched: jobRequirements.requiredSkills.filter((skill) =>
            patchedContent.toLowerCase().includes(skill.toLowerCase())
          ),
          keywordsAdded,
        },
      },
      patches,
      keywordsAdded,
      keywordsRemoved,
      tailoringScore,
      diff: this.generateDiff(latexContent, patchedContent),
    };
  }

  // Private methods

  private generatePatchId(): string {
    return `patch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateResumeId(): string {
    return `resume_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private tailorSkillsSection(
    content: string,
    requiredSkills: string[],
    preferredSkills: string[],
    config: TailoringConfig
  ): string {
    // Simple implementation: prioritize required skills
    const allSkills = [...requiredSkills, ...preferredSkills];
    const skillsToAdd = allSkills.slice(0, config.maxKeywordsToAdd);

    // Check which skills are already present
    const existingSkills = content
      .split(/,|\\|;/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);

    const missingSkills = skillsToAdd.filter(
      (skill) => !existingSkills.some((existing) => existing.includes(skill.toLowerCase()))
    );

    if (missingSkills.length === 0) {
      return content;
    }

    // Add missing skills to the end
    return `${content}, ${missingSkills.join(', ')}`;
  }

  private tailorExperienceSection(content: string, keywords: string[], config: TailoringConfig): string {
    // Simple implementation: bold keywords in experience
    let tailored = content;

    for (const keyword of keywords.slice(0, config.maxKeywordsToAdd)) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      tailored = tailored.replace(regex, `\\textbf{${keyword}}`);
    }

    return tailored;
  }

  private calculateTailoringScore(
    original: string,
    patched: string,
    requirements: { requiredSkills: string[]; preferredSkills: string[] }
  ): number {
    const allSkills = [...requirements.requiredSkills, ...requirements.preferredSkills];

    const originalMatches = allSkills.filter((skill) =>
      original.toLowerCase().includes(skill.toLowerCase())
    ).length;

    const patchedMatches = allSkills.filter((skill) =>
      patched.toLowerCase().includes(skill.toLowerCase())
    ).length;

    if (allSkills.length === 0) return 100;

    return Math.round((patchedMatches / allSkills.length) * 100);
  }
}

export default LatexPatcher;
