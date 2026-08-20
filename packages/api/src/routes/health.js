import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { getRedisConnection } from '../queue/queue.js';

const router = Router();

// Liveness: process is up. No dependency checks.
router.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Readiness: can we actually serve traffic (DB + Redis reachable)?
router.get('/ready', async (req, res) => {
  const checks = {};
  try {
    await getPool().query('SELECT 1');
    checks.postgres = true;
  } catch {
    checks.postgres = false;
  }
  try {
    checks.redis = (await getRedisConnection().ping()) === 'PONG';
  } catch {
    checks.redis = false;
  }
  const ready = Object.values(checks).every(Boolean);
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks });
});

export default router;
