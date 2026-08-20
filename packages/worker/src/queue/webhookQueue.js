import { Queue } from 'bullmq';
import { WEBHOOK_QUEUE_NAME, WEBHOOK_MAX_ATTEMPTS, WEBHOOK_BACKOFF_BASE_MS } from '@epub2pdf/shared';
import { getRedisConnection } from './connection.js';

let webhookQueue;

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

export async function closeWebhookQueue() {
  await webhookQueue?.close();
}
