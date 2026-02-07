/**
 * Built-in Job Analysis Skills
 *
 * Skills for analyzing job descriptions, companies, and matching requirements.
 */

import type { Skill, SkillResult, SkillContext } from '../types.js';

export const parseJobDescriptionSkill: Skill = {
  id: 'job.parse_description',
  name: 'Parse Job Description',
  description: 'Extracts structured data from job description text including role, requirements, skills, and compensation',
  version: '1.0.0',
  category: 'analysis',
  tags: ['job', 'parsing', 'analysis', 'requirements'],
  parameters: [
    {
      name: 'job_description',
      type: 'string',
      description: 'Full job description text to parse',
      required: true,
      validation: { minLength: 50, maxLength: 50000 }
    },
    {
      name: 'source',
      type: 'string',
      description: 'Source of the job description (linkedin, indeed, company_website, etc.)',
      required: false,
      default: 'unknown'
    }
  ],
  returns: {
    type: 'object',
    description: 'Structured job data with role, requirements, skills, and compensation'
  },
  examples: [
    {
      name: 'Parse LinkedIn Job',
      description: 'Parse a job description from LinkedIn',
      parameters: {
        job_description: 'We are seeking a Senior Software Engineer with 5+ years of experience in Python...',
        source: 'linkedin'
      },
      expectedResult: {
        role: 'Senior Software Engineer',
        level: 'Senior',
        must_have_skills: ['Python', '5+ years experience'],
        nice_to_have_skills: ['Kubernetes', 'AWS']
      }
    }
  ],
  handler: async (params, context): Promise<SkillResult> => {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      const { job_description, source = 'unknown' } = params;

      logs.push(`Parsing job description from ${source}`);
      logs.push(`Input length: ${(job_description as string).length} characters`);

      // Simple parsing logic (in production, use LLM for better extraction)
      const jd = job_description as string;

      // Extract role
      const roleMatch = jd.match(/(?:We are seeking|Looking for|Hiring)\s+(?:a|an)?\s+([^,.]+)/i);
      const role = roleMatch ? roleMatch[1].trim() : 'Unknown Role';

      // Extract level
      let level = 'Unknown';
      if (jd.match(/senior|sr\.?/i)) level = 'Senior';
      else if (jd.match(/junior|jr\.?|entry/i)) level = 'Junior';
      else if (jd.match(/mid|intermediate/i)) level = 'Mid-level';
      else if (jd.match(/lead|principal|staff/i)) level = 'Lead';

      // Extract skills
      const skillPatterns = [
        /(?:skills|technologies|stack|requirements)[\s\S]*?(?:\n\n|\n[A-Z]|$)/i,
        /(?:proficient|experience)\s+(?:in|with)\s+([^,.]+)/gi
      ];

      const mustHaveSkills: string[] = [];
      const niceToHaveSkills: string[] = [];

      // Simple skill extraction
      const commonSkills = ['Python', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'AWS', 'Docker', 'Kubernetes', 'SQL', 'Git'];
      for (const skill of commonSkills) {
        if (jd.toLowerCase().includes(skill.toLowerCase())) {
          if (jd.match(new RegExp(`(required|must|essential|necessary).*${skill}`, 'i'))) {
            mustHaveSkills.push(skill);
          } else {
            niceToHaveSkills.push(skill);
          }
        }
      }

      // Extract experience requirements
      const expMatch = jd.match(/(\d+)\+?\s*years?\s+(?:of\s+)?experience/i);
      const experienceYears = expMatch ? parseInt(expMatch[1]) : null;

      // Extract salary
      const salaryMatch = jd.match(/\$?(\d{2,3})[kK]?\s*[-–]\s*\$?(\d{2,3})[kK]?/);
      const salaryRange = salaryMatch ? {
        min: parseInt(salaryMatch[1]) * (salaryMatch[1].length > 2 ? 1 : 1000),
        max: parseInt(salaryMatch[2]) * (salaryMatch[2].length > 2 ? 1 : 1000),
        currency: 'USD'
      } : null;

      const result = {
        role,
        level,
        must_have_skills: mustHaveSkills,
        nice_to_have_skills: niceToHaveSkills,
        experience_years: experienceYears,
        salary_range: salaryRange,
        source,
        parsed_at: new Date().toISOString()
      };

      // Log to memory
      context.memory.addEntry(
        `Parsed job description for ${role} from ${source}`,
        'observation',
        { tags: ['job-parsing', 'skill-execution'], metadata: { skill: 'job.parse_description' } }
      );

      return {
        success: true,
        data: result,
        metadata: {
          executionTimeMs: Date.now() - startTime,
          startTime: new Date(startTime),
          endTime: new Date(),
          parameters: params as Record<string, unknown>,
          logs
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'PARSE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to parse job description',
          retryable: false
        },
        metadata: {
          executionTimeMs: Date.now() - startTime,
          startTime: new Date(startTime),
          endTime: new Date(),
          parameters: params as Record<string, unknown>,
          logs
        }
      };
    }
  },
  requiresApproval: false,
  timeoutMs: 10000,
  metadata: {
    author: 'ApplyPilot',
    createdAt: new Date(),
    updatedAt: new Date()
  }
};

export const analyzeCompanySkill: Skill = {
  id: 'job.analyze_company',
  name: 'Analyze Company',
  description: 'Researches company background, culture, and reputation to provide insights for job applications',
  version: '1.0.0',
  category: 'research',
  tags: ['company', 'research', 'culture', 'reputation'],
  parameters: [
    {
      name: 'company_name',
      type: 'string',
      description: 'Name of the company to research',
      required: true,
      validation: { minLength: 2, maxLength: 100 }
    },
    {
      name: 'include_reviews',
      type: 'boolean',
      description: 'Include employee reviews analysis',
      required: false,
      default: true
    }
  ],
  returns: {
    type: 'object',
    description: 'Company analysis including culture, reputation, and key insights'
  },
  examples: [
    {
      name: 'Analyze Tech Company',
      description: 'Research a technology company',
      parameters: {
        company_name: 'TechCorp',
        include_reviews: true
      },
      expectedResult: {
        name: 'TechCorp',
        industry: 'Technology',
        culture_score: 8.5,
        work_life_balance: 7.5
      }
    }
  ],
  handler: async (params, context): Promise<SkillResult> => {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      const { company_name, include_reviews = true } = params;

      logs.push(`Analyzing company: ${company_name}`);
      logs.push(`Include reviews: ${include_reviews}`);

      // Placeholder implementation - in production, integrate with company data APIs
      const result = {
        name: company_name,
        industry: 'Technology',
        size: 'Unknown',
        culture_score: 7.5,
        work_life_balance: 7.0,
        career_growth: 8.0,
        reviews_summary: include_reviews ? 'Analysis would include real employee reviews' : 'Reviews not requested',
        key_insights: [
          'Company analysis requires integration with external data sources',
          'Consider using Glassdoor, LinkedIn, or Crunchbase APIs for real data'
        ],
        analyzed_at: new Date().toISOString()
      };

      context.memory.addEntry(
        `Analyzed company: ${company_name}`,
        'research',
        { tags: ['company-analysis', 'skill-execution'], metadata: { skill: 'job.analyze_company' } }
      );

      return {
        success: true,
        data: result,
        metadata: {
          executionTimeMs: Date.now() - startTime,
          startTime: new Date(startTime),
          endTime: new Date(),
          parameters: params as Record<string, unknown>,
          logs
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'ANALYSIS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to analyze company',
          retryable: true
        },
        metadata: {
          executionTimeMs: Date.now() - startTime,
          startTime: new Date(startTime),
          endTime: new Date(),
          parameters: params as Record<string, unknown>,
          logs
        }
      };
    }
  },
  requiresApproval: false,
  timeoutMs: 15000,
  metadata: {
    author: 'ApplyPilot',
    createdAt: new Date(),
    updatedAt: new Date()
  }
};

export const calculateMatchScoreSkill: Skill = {
  id: 'job.calculate_match_score',
  name: 'Calculate Match Score',
  description: 'Calculates how well a candidate profile matches a job description',
  version: '1.0.0',
  category: 'analysis',
  tags: ['matching', 'scoring', 'analysis', 'resume'],
  parameters: [
    {
      name: 'resume_text',
      type: 'string',
      description: 'Candidate resume text',
      required: true
    },
    {
      name: 'job_requirements',
      type: 'object',
      description: 'Parsed job requirements from parse_job_description skill',
      required: true
    }
  ],
  returns: {
    type: 'object',
    description: 'Match score breakdown and recommendations'
  },
  examples: [
    {
      name: 'Calculate Match',
      description: 'Calculate match between resume and job',
      parameters: {
        resume_text: 'Experienced Python developer with 5 years...',
        job_requirements: { must_have_skills: ['Python', 'AWS'], experience_years: 3 }
      },
      expectedResult: {
        overall_score: 85,
        skills_match: 90,
        experience_match: 80
      }
    }
  ],
  handler: async (params, context): Promise<SkillResult> => {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      const { resume_text, job_requirements } = params;
      const resume = (resume_text as string).toLowerCase();
      const requirements = job_requirements as { must_have_skills?: string[]; nice_to_have_skills?: string[]; experience_years?: number };

      logs.push('Calculating match score');

      // Calculate skills match
      let skillsMatched = 0;
      let totalSkills = 0;
      const matchingSkills: string[] = [];
      const missingSkills: string[] = [];

      if (requirements.must_have_skills) {
        totalSkills += requirements.must_have_skills.length;
        for (const skill of requirements.must_have_skills) {
          if (resume.includes(skill.toLowerCase())) {
            skillsMatched++;
            matchingSkills.push(skill);
          } else {
            missingSkills.push(skill);
          }
        }
      }

      if (requirements.nice_to_have_skills) {
        totalSkills += requirements.nice_to_have_skills.length;
        for (const skill of requirements.nice_to_have_skills) {
          if (resume.includes(skill.toLowerCase())) {
            skillsMatched += 0.5; // Nice-to-have skills count half
            matchingSkills.push(skill);
          }
        }
      }

      const skillsMatch = totalSkills > 0 ? (skillsMatched / totalSkills) * 100 : 100;

      // Calculate experience match
      const expMatch = resume.match(/(\d+)\+?\s*years?/);
      const candidateYears = expMatch ? parseInt(expMatch[1]) : 0;
      const requiredYears = requirements.experience_years || 0;
      const experienceMatch = requiredYears > 0
        ? Math.min((candidateYears / requiredYears) * 100, 100)
        : 100;

      // Overall score (weighted average)
      const overallScore = Math.round((skillsMatch * 0.6) + (experienceMatch * 0.4));

      const result = {
        overall_score: overallScore,
        skills_match: Math.round(skillsMatch),
        experience_match: Math.round(experienceMatch),
        matching_skills: matchingSkills,
        missing_skills: missingSkills,
        candidate_experience_years: candidateYears,
        required_experience_years: requiredYears,
        recommendations: missingSkills.length > 0
          ? [`Consider highlighting experience with: ${missingSkills.join(', ')}`]
          : ['Great match! Your profile aligns well with this role.']
      };

      context.memory.addEntry(
        `Calculated match score: ${overallScore}%`,
        'analysis',
        { tags: ['match-score', 'skill-execution'], metadata: { skill: 'job.calculate_match_score', score: overallScore } }
      );

      return {
        success: true,
        data: result,
        metadata: {
          executionTimeMs: Date.now() - startTime,
          startTime: new Date(startTime),
          endTime: new Date(),
          parameters: params as Record<string, unknown>,
          logs
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CALCULATION_ERROR',
          message: error instanceof Error ? error.message : 'Failed to calculate match score',
          retryable: false
        },
        metadata: {
          executionTimeMs: Date.now() - startTime,
          startTime: new Date(startTime),
          endTime: new Date(),
          parameters: params as Record<string, unknown>,
          logs
        }
      };
    }
  },
  requiresApproval: false,
  timeoutMs: 5000,
  metadata: {
    author: 'ApplyPilot',
    createdAt: new Date(),
    updatedAt: new Date()
  }
};
