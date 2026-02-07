import { Router } from 'express';
import { z } from 'zod';
import { LLMResumeTailor, CoverLetterGenerator, AnswersPackGenerator } from '@applypilot/resume';
import { DatabaseManager, JobRepository } from '@applypilot/tracker';
import type { JDRequirements, UserProfile } from '@applypilot/core';
import { asyncHandler } from '../middleware/errorHandler.js';
import { broadcastProgress } from '../websocket/handler.js';

const router = Router();

const db = DatabaseManager.getInstance();
const jobRepo = new JobRepository(db.getDatabase());

const tailorSchema = z.object({
  jobId: z.string(),
  options: z.object({
    includeCoverLetter: z.boolean().default(true),
    includeAnswers: z.boolean().default(true),
  }).optional(),
});

// Helper to convert requirements
const convertRequirements = (json: Record<string, unknown>): JDRequirements => ({
  roleTitle: String(json.roleTitle || 'Unknown'),
  seniority: (json.seniority as 'entry' | 'mid' | 'senior' | 'lead' | 'staff' | 'unknown') || 'unknown',
  mustHaveSkills: (json.mustHaveSkills as string[]) || [],
  niceToHaveSkills: (json.niceToHaveSkills as string[]) || [],
  responsibilities: (json.responsibilities as string[]) || [],
  keywords: (json.keywords as string[]) || [],
  redFlags: (json.redFlags as string[]) || [],
  company: json.company as string | undefined,
  location: json.location as { city?: string; state?: string; country?: string; postalCode?: string; remote?: boolean } | undefined,
  remotePolicy: json.remotePolicy as 'remote' | 'hybrid' | 'onsite' | 'unknown' | undefined,
  salaryRange: json.salaryRange as { min?: number; max?: number; currency?: string } | undefined,
});

// Mock profile for now
const mockProfile: UserProfile = {
  personal: {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
  },
  summary: 'Software Engineer',
  skills: {
    technical: ['JavaScript', 'TypeScript'],
    soft: ['Communication'],
  },
  experience: [],
  education: [],
};

// Tailor resume for a job
router.post('/resume', asyncHandler(async (req, res) => {
  const { jobId } = tailorSchema.parse(req.body);
  
  const job = jobRepo.findById(jobId);
  if (!job) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
    return;
  }
  
  // Broadcast start
  broadcastProgress(jobId, { step: 'start', message: 'Starting resume tailoring...' });
  
  const requirements = convertRequirements(job.requirementsJson);
  
  // Tailor resume
  broadcastProgress(jobId, { step: 'analyzing', message: 'Analyzing job requirements...' });
  const tailor = new LLMResumeTailor();
  const result = await tailor.tailor(mockProfile, requirements, jobId);
  
  broadcastProgress(jobId, { 
    step: 'complete', 
    message: 'Resume tailoring complete',
    data: {
      changes: result.changes.length,
      cost: result.cost,
    }
  });
  
  // Update job status
  jobRepo.update(jobId, { status: 'tailored' });
  
  res.json({
    success: true,
    tailored: result.tailored,
    changes: result.changes,
    latex: result.latex,
    cost: result.cost,
  });
}));

// Generate cover letter
router.post('/cover-letter', asyncHandler(async (req, res) => {
  const { jobId } = tailorSchema.parse(req.body);
  
  const job = jobRepo.findById(jobId);
  if (!job) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
    return;
  }
  
  broadcastProgress(jobId, { step: 'cover-letter', message: 'Generating cover letter...' });
  
  const requirements = convertRequirements(job.requirementsJson);
  
  const generator = new CoverLetterGenerator();
  const result = await generator.generate(mockProfile, requirements, jobId);
  
  res.json({
    success: true,
    coverLetter: {
      short: result.short,
      long: result.long,
    },
    cost: result.cost,
  });
}));

// Generate answers pack
router.post('/answers', asyncHandler(async (req, res) => {
  const { jobId } = tailorSchema.parse(req.body);
  
  const job = jobRepo.findById(jobId);
  if (!job) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
    return;
  }
  
  broadcastProgress(jobId, { step: 'answers', message: 'Generating answers pack...' });
  
  const requirements = convertRequirements(job.requirementsJson);
  
  const generator = new AnswersPackGenerator();
  const result = await generator.generate(mockProfile, requirements, jobId);
  
  res.json({
    success: true,
    answers: {
      screening: result.screeningQuestions,
      form: result.formAnswers,
    },
    cost: result.cost,
  });
}));

// Full tailoring pipeline
router.post('/full', asyncHandler(async (req, res) => {
  const { jobId, options = {} } = tailorSchema.parse(req.body);
  
  const job = jobRepo.findById(jobId);
  if (!job) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
    return;
  }
  
  const opts = options as { includeCoverLetter?: boolean; includeAnswers?: boolean };
  
  const results: {
    resume?: unknown;
    coverLetter?: unknown;
    answers?: unknown;
    totalCost: number;
  } = { totalCost: 0 };
  
  const requirements = convertRequirements(job.requirementsJson);
  
  // Resume
  broadcastProgress(jobId, { step: 'resume', message: 'Tailoring resume...' });
  const tailor = new LLMResumeTailor();
  const tailored = await tailor.tailor(mockProfile, requirements, jobId);
  results.resume = tailored.tailored;
  results.totalCost += tailored.cost;
  
  // Cover letter
  if (opts.includeCoverLetter !== false) {
    broadcastProgress(jobId, { step: 'cover-letter', message: 'Generating cover letter...' });
    const coverGen = new CoverLetterGenerator();
    const coverLetters = await coverGen.generate(mockProfile, requirements, jobId);
    results.coverLetter = coverLetters;
    results.totalCost += coverLetters.cost;
  }
  
  // Answers
  if (opts.includeAnswers !== false) {
    broadcastProgress(jobId, { step: 'answers', message: 'Generating answers pack...' });
    const answersGen = new AnswersPackGenerator();
    const answers = await answersGen.generate(mockProfile, requirements, jobId);
    results.answers = answers;
    results.totalCost += answers.cost;
  }
  
  broadcastProgress(jobId, { 
    step: 'complete', 
    message: 'All tailoring complete!',
    data: { totalCost: results.totalCost }
  });
  
  // Update job status
  jobRepo.update(jobId, { status: 'tailored' });
  
  res.json({
    success: true,
    results,
  });
}));

export { router as tailorRouter };
