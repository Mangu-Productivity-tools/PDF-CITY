import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { logger } from './lib/logger.js';
import { requireAuth, requireScope } from './middleware/auth.js';
import { requestRateLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import convertRoute from './routes/convert.js';
import statusRoute from './routes/status.js';
import jobsRoutes from './routes/jobs.js';
import healthRoutes from './routes/health.js';
import metricsRoutes, { httpRequestDuration } from './routes/metrics.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: (process.env.CORS_ALLOWED_ORIGINS || '').split(',').filter(Boolean) || false,
    }),
  );
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '1mb' })); // JSON bodies only; multipart handled per-route by multer

  // Record request duration by matched route (not raw URL, to avoid a
  // cardinality explosion from path params like /status/{job_id}). req.route
  // is only populated once Express finds a match, so this reads it in the
  // `finish` handler rather than up front.
  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const route = req.route ? `${req.baseUrl}${req.route.path}` : 'unmatched';
      const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      httpRequestDuration.observe({ method: req.method, route, status_code: res.statusCode }, seconds);
    });
    next();
  });

  // Unauthenticated: liveness/readiness/metrics (restrict at the network/ingress layer in prod).
  app.use(healthRoutes);
  app.use(metricsRoutes);

  const v1 = express.Router();
  v1.use(requireAuth);
  v1.use(requireScope('convert'));
  v1.use(requestRateLimiter);
  v1.use(convertRoute); // declares POST /convert itself; concurrency check is applied inside the route
  v1.use(statusRoute);
  v1.use(jobsRoutes);

  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
