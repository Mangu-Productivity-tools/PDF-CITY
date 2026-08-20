import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import {
  QUEUE_NAME,
  JOB_ATTEMPTS,
  JOB_BACKOFF_BASE_MS,
  WEBHOOK_QUEUE_NAME,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_BACKOFF_BASE_MS,
} from '@epub2pdf/shared';

let connection;
let conversionQueue;
let webhookQueue;

export function getRedisConnection() {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null, // required by BullMQ
    });
  }
  return connection;
}

export function getConversionQueue() {
  if (!conversionQueue) {
    conversionQueue = new Queue(QUEUE_NAME, { connection: getRedisConnection() });
  }
  return conversionQueue;
}

export async function enqueueConversionJob(jobRow) {
  const queue = getConversionQueue();
  await queue.add(
    'convert',
    { jobId: jobRow.id },
    {
      jobId: jobRow.id, // idempotent: one BullMQ job per DB row
      attempts: JOB_ATTEMPTS,
      backoff: { type: 'exponential', delay: JOB_BACKOFF_BASE_MS },
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 7 * 24 * 3600 }, // 7-day dead-letter retention per spec
    },
  );
}

/**
 * The API doesn't process webhook deliveries itself (the worker does, via
 * packages/worker/src/queue/webhookQueue.js) but it does need to be able to
 * *trigger* one directly - e.g. when a user cancels a job, that's a terminal
 * state change the API knows about immediately and the worker may never see.
 * Same queue name/options as the worker side so both producers land in the
 * one `webhook-delivery` queue.
 */
export function getWebhookQueue() {
  if (!webhookQueue) {
    webhookQueue = new Queue(WEBHOOK_QUEUE_NAME, { connection: getRedisConnection() });
  }
  return webhookQueue;
}

export async function enqueueWebhookDelivery(jobId) {
  const queue = getWebhookQueue();
  await queue.add(
    'deliver',
    { jobId },
    {
      attempts: WEBHOOK_MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: WEBHOOK_BACKOFF_BASE_MS },
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  );
}

export async function closeQueue() {
  await conversionQueue?.close();
  await webhookQueue?.close();
  await connection?.quit();
}
