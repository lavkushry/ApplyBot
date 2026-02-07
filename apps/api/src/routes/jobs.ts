import { ConfigManager } from '@applypilot/core';
import { LLMJDAnalyzer } from '@applypilot/jd';
import {
  ApplicationRepository,
  DatabaseManager,
  JobRepository,
  type Job,
} from '@applypilot/tracker';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// Initialize database
const db = DatabaseManager.getInstance();
const jobRepo = new JobRepository(db.getDatabase());
const appRepo = new ApplicationRepository(db.getDatabase());

const createJobSchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  jdText: z.string().min(10),
  url: z.string().url().optional(),
  portal: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['new', 'analyzed', 'tailored', 'ready', 'applied', 'closed']),
  notes: z.string().optional(),
});

// Get all jobs
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const jobs = jobRepo.findAll();
    res.json({ jobs });
  })
);

// Get job by ID
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const job = jobRepo.findById(req.params.id);
    if (!job) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
      return;
    }
    res.json({ job });
  })
);

// Create new job
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { title, company, jdText, url, portal } = createJobSchema.parse(req.body);

    const job = jobRepo.create({
      id: `job_${Date.now()}`,
      source: (portal as 'paste' | 'file' | 'url') || 'paste',
      title,
      company,
      portal: (portal as Job['portal']) || null,
      url: url || null,
      jdText,
      requirementsJson: {} as Record<string, unknown>,
      fitScore: 0,
      status: 'new',
    });

    res.status(201).json({ job });
  })
);

// Analyze job
router.post(
  '/:id/analyze',
  asyncHandler(async (req, res) => {
    const job = jobRepo.findById(req.params.id);
    if (!job) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
      return;
    }

    // Load profile
    const config = ConfigManager.getInstance();
    // In production, load from user's profile
    const profile = {
      /* user profile */
    };

    const analyzer = new LLMJDAnalyzer();
    const analysis = await analyzer.quickAnalyze(job.jdText, job.id);

    // Update job with analysis
    jobRepo.update(job.id, {
      requirementsJson: analysis.requirements as unknown as Record<string, unknown>,
      fitScore: 0, // Would calculate from full analysis
      status: 'analyzed',
    });

    res.json({
      job: jobRepo.findById(job.id),
      analysis: analysis.requirements,
      cost: analysis.cost,
    });
  })
);

// Update job status
router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { status, notes } = updateStatusSchema.parse(req.body);

    const job = jobRepo.findById(req.params.id);
    if (!job) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
      return;
    }

    jobRepo.update(job.id, { status });

    // Create or update application record
    const existingApp = appRepo.findByJobId(job.id);
    if (existingApp) {
      appRepo.update(existingApp.id, {
        status: status as
          | 'drafted'
          | 'ready'
          | 'submitted'
          | 'interview'
          | 'rejected'
          | 'offer'
          | 'no_reply'
          | 'withdrawn',
        notes: notes || null,
      });
    } else {
      appRepo.create({
        id: `app_${Date.now()}`,
        jobId: job.id,
        resumeBuildId: null,
        status: status as
          | 'drafted'
          | 'ready'
          | 'submitted'
          | 'interview'
          | 'rejected'
          | 'offer'
          | 'no_reply'
          | 'withdrawn',
        appliedAt: null,
        notes: notes || null,
        followUpDate: null,
      });
    }

    res.json({ job: jobRepo.findById(job.id) });
  })
);

// Delete job
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const job = jobRepo.findById(req.params.id);
    if (!job) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
      return;
    }

    jobRepo.delete(job.id);
    res.status(204).send();
  })
);

export { router as jobsRouter };
