import { signWebhookPayload, createStorageClient } from '@epub2pdf/shared';
import { getJobById, recordWebhookAttempt } from '../db/jobsRepo.js';
import { logger } from './logger.js';

/**
 * POST the job's current state to its callback_url, HMAC-signed.
 * Called by the webhook-delivery BullMQ worker; BullMQ itself provides the
 * "up to 5 attempts, exponential backoff" retry envelope (spec).
 */
export async function deliverWebhook(jobId, attemptNumber) {
  const job = await getJobById(jobId);
  if (!job || !job.callback_url) return;

  let downloadUrl = null;
  if (job.status === 'completed' && job.output_key) {
    const storage = createStorageClient();
    downloadUrl = await storage.getSignedDownloadUrl(job.output_key);
  }

  const payload = JSON.stringify({
    job_id: job.id,
    status: job.status,
    progress: job.progress,
    metadata: job.metadata,
    download_url: downloadUrl,
    expires_at: job.expires_at,
    error: job.error_code ? { error_code: job.error_code, message: job.error_message } : null,
  });

  const signature = signWebhookPayload(payload, job.webhook_secret || '');

  let statusCode;
  let succeeded = false;
  let errorMessage;
  try {
    const res = await fetch(job.callback_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Signature': signature },
      body: payload,
    });
    statusCode = res.status;
    succeeded = res.ok;
    if (!succeeded) errorMessage = `Webhook endpoint responded ${res.status}`;
  } catch (err) {
    errorMessage = err.message;
  }

  await recordWebhookAttempt(job.id, { attempt: attemptNumber, statusCode, succeeded, error: errorMessage });

  if (!succeeded) {
    logger.warn({ jobId: job.id, attemptNumber, statusCode, errorMessage }, 'webhook delivery attempt failed');
    throw new Error(errorMessage || 'Webhook delivery failed');
  }
}
