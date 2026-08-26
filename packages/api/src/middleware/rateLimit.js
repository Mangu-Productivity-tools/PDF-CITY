import rateLimit from 'express-rate-limit';
import { RATE_LIMIT, errorBody } from '@epub2pdf/shared';
import { countActiveJobsForKey } from '../db/jobsRepo.js';
import { getRedisConnection } from '../queue/queue.js';

/**
 * Redis sliding-window store for express-rate-limit v7.
 *
 * Each API-key gets a sorted set `ratelimit:{key}` where members are unique
 * per-request strings scored by their arrival timestamp (ms).  On each
 * increment we:
 *   1. Remove members older than the window.
 *   2. Add a new member for this request.
 *   3. Return the post-add cardinality as `totalHits`.
 *
 * The sorted set expires automatically after `windowMs` of inactivity,
 * so there is no stale-key leak.  Errors fall open: if Redis is
 * unreachable, callers get a store that increments an in-memory counter
 * so the instance stays available.
 */
class RedisRateLimitStore {
  constructor({ windowMs }) {
    this.windowMs = windowMs;
    // Lazy — avoids import-time circular dep on the queue module.
    this._redis = null;
  }

  _getRedis() {
    if (!this._redis) {
      try {
        this._redis = getRedisConnection();
      } catch {
        return null;
      }
    }
    return this._redis;
  }

  async increment(key) {
    const now = Date.now();
    const member = `${now}:${Math.random().toString(36).slice(2, 10)}`;
    const resetTime = new Date(now + this.windowMs);

    const redis = this._getRedis();
    if (!redis) {
      return { totalHits: 1, resetTime };
    }

    try {
      const [, , totalHits] = await redis
        .pipeline()
        .zremrangebyscore(key, '-inf', now - this.windowMs)
        .zadd(key, now, member)
        .zcard(key)
        .pexpire(key, this.windowMs)
        .exec()
        .then((results) => results.map(([, v]) => v));

      return { totalHits: Number(totalHits), resetTime };
    } catch {
      // Fail open: Redis error must not deny legitimate traffic.
      return { totalHits: 1, resetTime };
    }
  }

  async decrement(_key) {
    // Sliding window has no decrement — a request that already slid into
    // the window cannot be "un-counted".
  }

  async resetKey(key) {
    const redis = this._getRedis();
    if (redis) await redis.del(key).catch(() => {});
  }

  async resetAll() {
    // Not feasible without a key scan — omit so callers fall back to per-key resets.
  }
}

export const requestRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: RATE_LIMIT.REQUESTS_PER_MINUTE,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `rl:${req.apiKey?.id || req.ip}`,
  store: new RedisRateLimitStore({ windowMs: 60 * 1000 }),
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
