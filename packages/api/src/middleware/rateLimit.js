import rateLimit from 'express-rate-limit';
import { RATE_LIMIT, errorBody } from '@epub2pdf/shared';
import { countActiveJobsForKey } from '../db/jobsRepo.js';

export const requestRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: RATE_LIMIT.REQUESTS_PER_MINUTE,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.apiKey?.id || req.ip,
  handler: (req, res) => {
    res.set('Retry-After', '60');
    res.status(429).json(errorBody('RATE_LIMITED'));
  },
});

export async function requireConcurrencyHeadroom(req, res, next) {
  try {
    const active = await countActiveJobsForKey(req.apiKey.id);
    if (active >= RATE_LIMIT.MAX_CONCURRENT_JOBS_PER_USER) {
      res.set('Retry-After', '30');
      return res.status(429).json(errorBody('CONCURRENCY_LIMIT'));
    }
    next();
  } catch (err) {
    next(err);
  }
}
