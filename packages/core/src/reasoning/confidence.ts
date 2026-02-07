export interface ConfidenceScore {
  overall: number;
  components: {
    dataQuality: number;
    matchStrength: number;
    outputQuality: number;
    reasoningQuality: number;
    truthfulness: number;
  };
  factors: Array<{
    factor: string;
    impact: 'positive' | 'negative' | 'neutral';
    weight: number;
  }>;
  recommendations: string[];
}

export class ConfidenceScorer {
  /**
   * Calculate confidence score for JD analysis
   */
  calculateJDAnalysisConfidence(
    jdText: string,
    extractedData: {
      roleTitle: string;
      seniority: string;
      mustHaveSkills: string[];
      niceToHaveSkills: string[];
    }
  ): ConfidenceScore {
    const factors: Array<{ factor: string; impact: 'positive' | 'negative' | 'neutral'; weight: number }> = [];
    
    // Data quality factors
    const jdLength = jdText.length;
    const hasSufficientLength = jdLength > 500;
    factors.push({
      factor: hasSufficientLength ? 'JD length is sufficient' : 'JD is very short',
      impact: hasSufficientLength ? 'positive' : 'negative',
      weight: 0.15,
    });

    const hasClearStructure = /(requirements|qualifications|responsibilities|about)/i.test(jdText);
    factors.push({
      factor: hasClearStructure ? 'JD has clear structure' : 'JD structure unclear',
      impact: hasClearStructure ? 'positive' : 'negative',
      weight: 0.1,
    });

    // Match strength factors
    const hasSpecificSkills = extractedData.mustHaveSkills.length >= 3;
    factors.push({
      factor: hasSpecificSkills ? 'Specific skills identified' : 'Few skills found',
      impact: hasSpecificSkills ? 'positive' : 'negative',
      weight: 0.2,
    });

    const hasRoleTitle = extractedData.roleTitle && extractedData.roleTitle !== 'Unknown';
    factors.push({
      factor: hasRoleTitle ? 'Role title identified' : 'Role title unclear',
      impact: hasRoleTitle ? 'positive' : 'negative',
      weight: 0.15,
    });

    const hasSeniority = extractedData.seniority && extractedData.seniority !== 'unknown';
    factors.push({
      factor: hasSeniority ? 'Seniority level determined' : 'Seniority unclear',
      impact: hasSeniority ? 'positive' : 'negative',
      weight: 0.1,
    });

    // Calculate component scores
    const dataQuality = this.calculateDataQualityScore(factors.slice(0, 2));
    const matchStrength = this.calculateMatchStrengthScore(factors.slice(2));
    const outputQuality = this.calculateOutputQualityScore(extractedData);
    const reasoningQuality = 75; // Default for now
    const truthfulness = 80; // Default for now

    // Calculate overall score
    const overall = Math.round(
      dataQuality * 0.25 +
      matchStrength * 0.3 +
      outputQuality * 0.25 +
      reasoningQuality * 0.2
    );

    // Generate recommendations
    const recommendations = this.generateJDRecommendations(factors, extractedData);

    return {
      overall,
      components: {
        dataQuality,
        matchStrength,
        outputQuality,
        reasoningQuality,
        truthfulness,
      },
      factors,
      recommendations,
    };
  }

  /**
   * Calculate confidence score for resume tailoring
   */
  calculateTailoringConfidence(
    profile: unknown,
    requirements: unknown,
    tailoredContent: {
      summary: string;
      skills: string[];
      experience: Array<{ bullets: string[] }>;
    }
  ): ConfidenceScore {
    const factors: Array<{ factor: string; impact: 'positive' | 'negative' | 'neutral'; weight: number }> = [];

    // Content quality factors
    const hasSummary = tailoredContent.summary && tailoredContent.summary.length > 50;
    factors.push({
      factor: hasSummary ? 'Professional summary present' : 'Summary missing or too short',
      impact: hasSummary ? 'positive' : 'negative',
      weight: 0.15,
    });

    const hasSkills = tailoredContent.skills.length >= 5;
    factors.push({
      factor: hasSkills ? 'Adequate skills listed' : 'Too few skills',
      impact: hasSkills ? 'positive' : 'negative',
      weight: 0.15,
    });

    const hasExperience = tailoredContent.experience.some(e => e.bullets.length > 0);
    factors.push({
      factor: hasExperience ? 'Experience bullets present' : 'No experience content',
      impact: hasExperience ? 'positive' : 'negative',
      weight: 0.2,
    });

    // Truthfulness check (simplified)
    const truthfulnessScore = this.estimateTruthfulness(profile, tailoredContent);
    factors.push({
      factor: truthfulnessScore > 80 ? 'Content appears truthful' : 'Potential exaggeration detected',
      impact: truthfulnessScore > 80 ? 'positive' : 'negative',
      weight: 0.25,
    });

    // Calculate component scores
    const dataQuality = 80; // Assumed good if we have profile
    const matchStrength = this.calculateTailoringMatchStrength(requirements, tailoredContent);
    const outputQuality = this.calculateTailoringOutputQuality(tailoredContent);
    const reasoningQuality = 75;
    const truthfulness = 80;

    const overall = Math.round(
      dataQuality * 0.2 +
      matchStrength * 0.3 +
      outputQuality * 0.3 +
      reasoningQuality * 0.2
    );

    const recommendations = this.generateTailoringRecommendations(factors, tailoredContent);

    return {
      overall,
      components: {
        dataQuality,
        matchStrength,
        outputQuality,
        reasoningQuality,
        truthfulness,
      },
      factors,
      recommendations,
    };
  }

  /**
   * Calculate data quality score
   */
  private calculateDataQualityScore(factors: Array<{ impact: string; weight: number }>): number {
    let score = 70; // Base score
    
    for (const factor of factors) {
      if (factor.impact === 'positive') {
        score += factor.weight * 30;
      } else if (factor.impact === 'negative') {
        score -= factor.weight * 30;
      }
    }

    return Math.min(100, Math.max(0, Math.round(score)));
  }

  /**
   * Calculate match strength score
   */
  private calculateMatchStrengthScore(factors: Array<{ impact: string; weight: number }>): number {
    let score = 60; // Base score
    
    for (const factor of factors) {
      if (factor.impact === 'positive') {
        score += factor.weight * 40;
      } else if (factor.impact === 'negative') {
        score -= factor.weight * 40;
      }
    }

    return Math.min(100, Math.max(0, Math.round(score)));
  }

  /**
   * Calculate output quality score
   */
  private calculateOutputQualityScore(data: { mustHaveSkills: string[] }): number {
    let score = 70;
    
    // More skills = better extraction
    score += Math.min(data.mustHaveSkills.length * 5, 20);
    
    return Math.min(100, score);
  }

  /**
   * Calculate tailoring match strength
   */
  private calculateTailoringMatchStrength(
    requirements: unknown,
    content: { skills: string[] }
  ): number {
    // Simplified - would need actual comparison logic
    return 75;
  }

  /**
   * Calculate tailoring output quality
   */
  private calculateTailoringOutputQuality(content: {
    summary: string;
    skills: string[];
    experience: Array<{ bullets: string[] }>;
  }): number {
    let score = 70;

    // Summary quality
    if (content.summary.length > 100) score += 10;
    if (content.summary.length > 200) score += 10;

    // Skills quantity
    score += Math.min(content.skills.length * 2, 10);

    // Experience bullets
    const totalBullets = content.experience.reduce((sum, e) => sum + e.bullets.length, 0);
    score += Math.min(totalBullets * 3, 15);

    return Math.min(100, score);
  }

  /**
   * Estimate truthfulness of tailored content
   */
  private estimateTruthfulness(
    profile: unknown,
    content: { summary: string; skills: string[] }
  ): number {
    // This is a simplified check - would need more sophisticated analysis
    // Check for common exaggeration patterns
    const exaggerationPatterns = [
      /expert/gi,
      /master/gi,
      /guru/gi,
      /ninja/gi,
      /rockstar/gi,
    ];

    let penalty = 0;
    for (const pattern of exaggerationPatterns) {
      if (pattern.test(content.summary)) {
        penalty += 10;
      }
    }

    return Math.max(50, 90 - penalty);
  }

  /**
   * Generate recommendations for JD analysis
   */
  private generateJDRecommendations(
    factors: Array<{ factor: string; impact: string }>,
    data: { mustHaveSkills: string[] }
  ): string[] {
    const recommendations: string[] = [];

    const negativeFactors = factors.filter(f => f.impact === 'negative');
    
    if (negativeFactors.some(f => f.factor.includes('short'))) {
      recommendations.push('Consider finding a more detailed job description');
    }

    if (negativeFactors.some(f => f.factor.includes('unclear'))) {
      recommendations.push('JD lacks clear structure - manual review recommended');
    }

    if (data.mustHaveSkills.length < 3) {
      recommendations.push('Few skills detected - consider researching the company for more context');
    }

    if (recommendations.length === 0) {
      recommendations.push('JD analysis looks good - proceed with tailoring');
    }

    return recommendations;
  }

  /**
   * Generate recommendations for tailoring
   */
  private generateTailoringRecommendations(
    factors: Array<{ factor: string; impact: string }>,
    content: { summary: string; skills: string[] }
  ): string[] {
    const recommendations: string[] = [];

    if (content.summary.length < 100) {
      recommendations.push('Consider expanding the professional summary');
    }

    if (content.skills.length < 8) {
      recommendations.push('Add more relevant skills if applicable');
    }

    const negativeFactors = factors.filter(f => f.impact === 'negative');
    if (negativeFactors.some(f => f.factor.includes('exaggeration'))) {
      recommendations.push('Review content for potentially exaggerated claims');
    }

    if (recommendations.length === 0) {
      recommendations.push('Resume tailoring looks good - ready to use');
    }

    return recommendations;
  }

  /**
   * Get confidence level label
   */
  getConfidenceLabel(score: number): string {
    if (score >= 90) return 'Very High';
    if (score >= 80) return 'High';
    if (score >= 70) return 'Good';
    if (score >= 60) return 'Moderate';
    if (score >= 50) return 'Low';
    return 'Very Low';
  }

  /**
   * Should we ask for user review?
   */
  shouldRequestReview(confidence: ConfidenceScore): boolean {
    return confidence.overall < 70 || 
           confidence.components.truthfulness < 60 ||
           confidence.recommendations.length > 2;
  }
}
