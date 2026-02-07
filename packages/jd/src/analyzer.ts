import type { JDRequirements, FitAnalysis, UserProfile } from '@applypilot/core';

export interface JDAnalysisResult {
  requirements: JDRequirements;
  fitAnalysis: FitAnalysis;
}

export class JDAnalyzer {
  /**
   * Analyze JD text and extract structured requirements
   * This is a placeholder - actual implementation will use LLM
   */
  async analyze(jdText: string, userProfile: UserProfile): Promise<JDAnalysisResult> {
    // Extract basic information without LLM
    const title = this.extractTitle(jdText);
    const seniority = this.detectSeniority(jdText);
    const mustHaveSkills = this.extractMustHaveSkills(jdText);
    const niceToHaveSkills = this.extractNiceToHaveSkills(jdText);
    const keywords = this.extractKeywords(jdText);
    const redFlags = this.detectRedFlags(jdText);

    const requirements: JDRequirements = {
      roleTitle: title || 'Unknown Role',
      seniority,
      mustHaveSkills,
      niceToHaveSkills,
      responsibilities: this.extractResponsibilities(jdText),
      keywords,
      redFlags,
      location: this.extractLocation(jdText),
      remotePolicy: this.detectRemotePolicy(jdText),
    };

    // Calculate fit analysis
    const fitAnalysis = this.calculateFit(userProfile, requirements);

    return { requirements, fitAnalysis };
  }

  /**
   * Extract title from JD text
   */
  private extractTitle(text: string): string | undefined {
    const patterns = [
      /^([A-Z][a-zA-Z\s]+(?:Engineer|Developer|Manager|Director|Analyst|Designer|Architect|Specialist|Lead)(?:\s+[A-Z][a-zA-Z\s]+)?)/m,
      /position:\s*([^\n]+)/i,
      /role:\s*([^\n]+)/i,
      /job title:\s*([^\n]+)/i,
      /we are looking for a\s+([^\n]+)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return undefined;
  }

  /**
   * Detect seniority level from JD text
   */
  private detectSeniority(text: string): JDRequirements['seniority'] {
    const lowerText = text.toLowerCase();

    if (/\b(staff|principal|architect|lead|senior lead)\b/.test(lowerText)) {
      return 'staff';
    }
    if (/\b(lead|manager|director|head of)\b/.test(lowerText)) {
      return 'lead';
    }
    if (/\b(senior|sr\.?|experienced)\b/.test(lowerText)) {
      return 'senior';
    }
    if (/\b(mid|intermediate|2-5 years)\b/.test(lowerText)) {
      return 'mid';
    }
    if (/\b(junior|jr\.?|entry|graduate|0-2 years|1-2 years)\b/.test(lowerText)) {
      return 'entry';
    }

    return 'unknown';
  }

  /**
   * Extract must-have/required skills
   */
  private extractMustHaveSkills(text: string): string[] {
    const skills: string[] = [];
    const lowerText = text.toLowerCase();

    // Common technical skills patterns
    const skillPatterns = [
      /(?:required|must have|must-have|essential|necessary)\s*:?\s*([^\n]+)/gi,
      /(?:required skills|requirements)\s*:?\s*([^\n#]+)/gi,
    ];

    for (const pattern of skillPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const skillsText = match[1];
        const extracted = this.parseSkillsList(skillsText);
        skills.push(...extracted);
      }
    }

    // Also look for common programming languages and technologies
    const commonSkills = [
      'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'go', 'rust', 'ruby', 'php',
      'react', 'vue', 'angular', 'svelte', 'next.js', 'nuxt',
      'node.js', 'express', 'nestjs', 'django', 'flask', 'spring',
      'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform',
      'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch',
      'graphql', 'rest', 'grpc', 'websockets',
      'git', 'ci/cd', 'jenkins', 'github actions', 'gitlab ci',
    ];

    for (const skill of commonSkills) {
      if (lowerText.includes(skill)) {
        skills.push(skill);
      }
    }

    return [...new Set(skills)];
  }

  /**
   * Extract nice-to-have/preferred skills
   */
  private extractNiceToHaveSkills(text: string): string[] {
    const skills: string[] = [];

    const patterns = [
      /(?:preferred|nice to have|nice-to-have|bonus|plus)\s*:?\s*([^\n]+)/gi,
      /(?:preferred skills|bonus skills)\s*:?\s*([^\n#]+)/gi,
    ];

    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const skillsText = match[1];
        const extracted = this.parseSkillsList(skillsText);
        skills.push(...extracted);
      }
    }

    return [...new Set(skills)];
  }

  /**
   * Parse skills from text (comma, bullet, or newline separated)
   */
  private parseSkillsList(text: string): string[] {
    return text
      .split(/[,•\-\n]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.length < 50)
      .map(s => s.replace(/^[\s•\-\*]+/, ''));
  }

  /**
   * Extract responsibilities from JD text
   */
  private extractResponsibilities(text: string): string[] {
    const responsibilities: string[] = [];

    const patterns = [
      /(?:responsibilities|what you'll do|key duties|role overview)\s*:?\s*([^#]+?)(?=\n\s*\n|requirements|qualifications|$)/is,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const items = match[1]
          .split(/[\n•\-]+/)
          .map(s => s.trim())
          .filter(s => s.length > 10 && s.length < 200);
        responsibilities.push(...items);
      }
    }

    return responsibilities.slice(0, 10);
  }

  /**
   * Extract keywords from JD text
   */
  extractKeywords(text: string): string[] {
    const commonWords = new Set([
      'the', 'and', 'or', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    ]);

    const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];
    const frequency: Record<string, number> = {};

    for (const word of words) {
      if (!commonWords.has(word) && word.length > 2) {
        frequency[word] = (frequency[word] || 0) + 1;
      }
    }

    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([word]) => word);
  }

  /**
   * Detect red flags in JD
   */
  private detectRedFlags(text: string): string[] {
    const redFlags: string[] = [];
    const lowerText = text.toLowerCase();

    const flagPatterns = [
      { pattern: /\b(urgent|immediate start|asap)\b/i, message: 'Urgent hiring may indicate high turnover' },
      { pattern: /\b(rockstar|ninja|guru|wizard|superstar)\b/i, message: 'Buzzword job titles may indicate unrealistic expectations' },
      { pattern: /\b(fast-paced|high-pressure|work hard play hard)\b/i, message: 'May indicate poor work-life balance' },
      { pattern: /\b(competitive salary|compensation commensurate)\b/i, message: 'Salary not disclosed' },
      { pattern: /\b(unlimited vacation|unlimited pto)\b/i, message: 'Unlimited PTO can sometimes mean less actual vacation' },
      { pattern: /\b(family|tight-knit family)\b/i, message: 'May blur professional boundaries' },
    ];

    for (const { pattern, message } of flagPatterns) {
      if (pattern.test(lowerText)) {
        redFlags.push(message);
      }
    }

    return redFlags;
  }

  /**
   * Extract location information
   */
  private extractLocation(text: string): { city?: string; state?: string; country?: string; postalCode?: string; remote?: boolean } | undefined {
    const patterns = [
      /location\s*:?\s*([^\n]+)/i,
      /(?:based in|located in)\s+([^\n\.]+)/i,
      /(?:remote|hybrid|onsite)\s*(?:in|:)?\s*([^\n]+)?/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const locationStr = match[1]?.trim() || match[0]?.trim();
        if (locationStr) {
          return { city: locationStr };
        }
      }
    }

    return undefined;
  }

  /**
   * Detect remote work policy
   */
  private detectRemotePolicy(text: string): JDRequirements['remotePolicy'] {
    const lowerText = text.toLowerCase();

    if (/\b(fully remote|100% remote|remote only|anywhere)\b/.test(lowerText)) {
      return 'remote';
    }
    if (/\b(hybrid|flexible|partially remote|2-3 days|3 days)\b/.test(lowerText)) {
      return 'hybrid';
    }
    if (/\b(onsite|on-site|in office|in-office|on site)\b/.test(lowerText)) {
      return 'onsite';
    }

    return 'unknown';
  }

  /**
   * Calculate fit between user profile and JD requirements
   */
  private calculateFit(profile: UserProfile, requirements: JDRequirements): FitAnalysis {
    const userSkills = new Set(profile.skills.technical.map(s => s.toLowerCase()));
    const mustHaveSkills = requirements.mustHaveSkills.map(s => s.toLowerCase());
    const niceToHaveSkills = requirements.niceToHaveSkills.map(s => s.toLowerCase());

    const matchedSkills: string[] = [];
    const missingSkills: string[] = [];

    for (const skill of mustHaveSkills) {
      if (userSkills.has(skill) || this.hasSimilarSkill(userSkills, skill)) {
        matchedSkills.push(skill);
      } else {
        missingSkills.push(skill);
      }
    }

    for (const skill of niceToHaveSkills) {
      if (userSkills.has(skill) || this.hasSimilarSkill(userSkills, skill)) {
        matchedSkills.push(skill);
      }
    }

    // Calculate score
    const mustHaveMatch = mustHaveSkills.length > 0
      ? matchedSkills.filter(s => mustHaveSkills.includes(s)).length / mustHaveSkills.length
      : 1;

    const score = Math.round(mustHaveMatch * 100);

    const gaps: string[] = [];
    if (missingSkills.length > 0) {
      gaps.push(`Missing ${missingSkills.length} required skills: ${missingSkills.slice(0, 3).join(', ')}${missingSkills.length > 3 ? '...' : ''}`);
    }

    const recommendations: string[] = [];
    if (score < 50) {
      recommendations.push('Consider highlighting transferable skills in your resume');
    }
    if (missingSkills.length > 0) {
      recommendations.push(`Consider addressing ${missingSkills.slice(0, 2).join(', ')} in your cover letter`);
    }

    return {
      score,
      matchedSkills: [...new Set(matchedSkills)],
      missingSkills,
      gaps,
      recommendations,
    };
  }

  /**
   * Check if user has a similar skill (e.g., "React" matches "React.js")
   */
  private hasSimilarSkill(userSkills: Set<string>, targetSkill: string): boolean {
    const variations = [
      targetSkill,
      targetSkill.replace(/\.js$/, ''),
      targetSkill.replace(/\.js$/, '.js'),
      targetSkill.replace(/\s+/g, ''),
      targetSkill.replace(/\s+/g, '-'),
      targetSkill.replace(/\s+/g, '_'),
    ];

    return variations.some(v => userSkills.has(v));
  }
}
