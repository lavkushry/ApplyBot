// Core types for ApplyPilot

export interface UserProfile {
  personal: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
    portfolio?: string;
  };
  summary: string;
  skills: {
    technical: string[];
    soft: string[];
    languages?: string[];
  };
  experience: WorkExperience[];
  education: Education[];
  projects?: Project[];
  certifications?: Certification[];
}

export interface WorkExperience {
  id: string;
  company: string;
  title: string;
  location?: string;
  startDate: string;
  endDate?: string;
  current: boolean;
  bullets: string[];
  skills: string[];
}

export interface Education {
  id: string;
  institution: string;
  degree: string;
  field?: string;
  location?: string;
  startDate: string;
  endDate?: string;
  gpa?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  url?: string;
  bullets: string[];
  skills: string[];
}

export interface Certification {
  id: string;
  name: string;
  issuer: string;
  date: string;
  url?: string;
}

export interface Achievement {
  id: string;
  category: 'work' | 'project' | 'education' | 'certification';
  context: string;
  action: string;
  result: string;
  skills: string[];
  metrics?: string[];
  tags: string[];
}

export interface TailoredResume {
  summary: string;
  skills: string[];
  experience: TailoredExperience[];
  projects?: TailoredProject[];
}

export interface TailoredExperience {
  id: string;
  bullets: string[];
}

export interface TailoredProject {
  id: string;
  bullets: string[];
}

export interface JDRequirements {
  roleTitle: string;
  company?: string;
  seniority: 'entry' | 'mid' | 'senior' | 'lead' | 'staff' | 'unknown';
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  responsibilities: string[];
  keywords: string[];
  redFlags: string[];
  location?: {
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    remote?: boolean;
  };
  remotePolicy?: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  salaryRange?: {
    min?: number;
    max?: number;
    currency?: string;
  };
}

export interface FitAnalysis {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  gaps: string[];
  recommendations: string[];
}

export interface ResumeChange {
  section: string;
  field: string;
  oldValue: string;
  newValue: string;
  reason: string;
}

export interface CompileResult {
  success: boolean;
  pdfPath: string;
  logPath: string;
  errors: string[];
  warnings: string[];
}

export interface AnswersPack {
  coverLetter: {
    short: string;
    long: string;
  };
  screeningQuestions: Record<string, string>;
  recruiterMessage: string;
  formAnswers: Record<string, string>;
  personal?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    linkedin?: string;
    portfolio?: string;
  };
  location?: {
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
  };
}

export type JDSource = 'text' | 'pdf' | 'url' | 'linkedin' | 'paste' | 'file';
