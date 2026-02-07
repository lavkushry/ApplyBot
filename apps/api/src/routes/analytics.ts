import { Router } from 'express';
import { getCostTracker } from '@applypilot/core';
import { DatabaseManager, ApplicationRepository } from '@applypilot/tracker';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

const db = DatabaseManager.getInstance();
const appRepo = new ApplicationRepository(db.getDatabase());

// Get dashboard stats
router.get('/dashboard', asyncHandler(async (req, res) => {
  const stats = appRepo.getStats();
  
  // Get cost data
  const costTracker = getCostTracker();
  const costSummary = costTracker.getSummary();
  
  res.json({
    applications: stats,
    costs: {
      total: costSummary.totalCost,
      thisMonth: costTracker.getCurrentMonthCost(),
    },
  });
}));

// Get application funnel
router.get('/funnel', asyncHandler(async (req, res) => {
  const stats = appRepo.getStats();
  
  const funnel = [
    { stage: 'Submitted', count: stats.submitted + stats.interview + stats.offer + stats.rejected },
    { stage: 'Phone Screen', count: stats.interview + stats.offer },
    { stage: 'Interview', count: stats.interview + stats.offer },
    { stage: 'Offer', count: stats.offer },
  ];
  
  res.json({ funnel });
}));

// Get cost analytics
router.get('/costs', asyncHandler(async (req, res) => {
  const costTracker = getCostTracker();
  const summary = costTracker.getSummary();
  
  res.json({
    summary,
    byProvider: summary.byProvider,
    byModel: summary.byModel,
    byDay: summary.byDay,
  });
}));

// Get success metrics
router.get('/success', asyncHandler(async (req, res) => {
  const stats = appRepo.getStats();
  const total = stats.total;
  
  const metrics = {
    totalApplications: total,
    offers: stats.offer,
    interviews: stats.interview,
    successRate: total > 0 ? Math.round((stats.offer / total) * 100) : 0,
    interviewRate: total > 0 ? Math.round((stats.interview / total) * 100) : 0,
  };
  
  res.json({ metrics });
}));

export { router as analyticsRouter };
