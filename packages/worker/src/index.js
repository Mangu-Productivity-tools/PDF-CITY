import 'dotenv/config';
import { Worker, Queue } from 'bullmq';
import { QUEUE_NAME, WEBHOOK_QUEUE_NAME } from '@epub2pdf/shared';
import { getRedisConnection, closeRedisConnection } from './queue/connection.js';
import { closeWebhookQueue } from './queue/webhookQueue.js';
import { processConversionJob } from './processConversionJob.js';
import { deliverWebhook } from './lib/webhook.js';
import { getPool, closePool } from './db/pool.js';
import { startHealthServer } from './healthServer.js';
import { logger } from './lib/logger.js';
import { isCalibreAvailable } from './engines/calibre.js';
import { queueLengthGauge } from './metrics.js';

const concurrency = Number(process.env.MAX_CONCURRENT_JOBS || 10);
const healthPort = Number(process.env.WORKER_HEALTH_PORT || 3001);
const QUEUE_LENGTH_POLL_MS = 15_000;

async function main() {
  await getPool().query('SELECT 1'); // fail fast if Postgres is unreachable

  const calibreOk = await isCalibreAvailable();
  logger.info({ calibreAvailable: calibreOk }, calibreOk ? 'Calibre engine ready' : 'Calibre not found - "calibre" engine jobs will fail until it is installed (see Dockerfile)');

  // Shared queue handle for the queue_length Prometheus gauge (KEDA scaling).
  const conversionQueue = new Queue(QUEUE_NAME, { connection: getRedisConnection() });

  const conversionWorker = new Worker(QUEUE_NAME, processConversionJob, {
    connection: getRedisConnection(),
    concurrency,
  });

  const webhookWorker = new Worker(
    WEBHOOK_QUEUE_NAME,
    async (bullJob) => deliverWebhook(bullJob.data.jobId, bullJob.attemptsMade + 1),
    { connection: getRedisConnection(), concurrency: Math.max(2, Math.floor(concurrency / 2)) },
  );

  conversionWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.data?.jobId, err: err?.message }, 'conversion job attempt failed');
  });
  conversionWorker.on('completed', (job) => {
    logger.info({ jobId: job?.data?.jobId }, 'conversion job completed');
  });

  // Poll BullMQ's waiting-job count and publish it as the queue_length metric
  // so the KEDA ScaledObject (infra/k8s/20-worker.yaml) can scale on it.
  async function refreshQueueLength() {
    try {
      const waiting = await conversionQueue.getWaitingCount();
      queueLengthGauge.set(waiting);
    } catch {
      // Non-fatal: KEDA falls back to CPU-based scaling if this is stale.
    }
  }
  await refreshQueueLength();
  const queuePollTimer = setInterval(refreshQueueLength, QUEUE_LENGTH_POLL_MS);

  const healthServer = startHealthServer(healthPort);
  logger.info({ concurrency, healthPort }, 'worker started');

  const shutdown = async (signal) => {
    logger.info({ signal }, 'shutting down (waiting for in-flight jobs to finish)');
    clearInterval(queuePollTimer);
    await Promise.all([conversionWorker.close(), webhookWorker.close()]);
    await conversionQueue.close();
    await closeWebhookQueue();
    await closeRedisConnection();
    await closePool();
    healthServer.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'fatal worker startup error');
  process.exit(1);
});
