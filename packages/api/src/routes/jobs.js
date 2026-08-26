import { Router } from 'express';
import { createStorageClient, ListJobsQuerySchema, UpdateJobSchema } from '@epub2pdf/shared';
import {
  listJobs,
  getJobById,
  cancelJob,
  deleteJobRecord,
  updateJobOptions,
  toJobResponse,
  writeAuditLog,
} from '../db/jobsRepo.js';
import { validate } from '../middleware/validate.js';
import { ApiError } from '../middleware/errorHandler.js';
import { enqueueWebhookDelivery } from '../queue/queue.js';

const router = Router();

router.get('/jobs', validate(ListJobsQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { status, from, to, page, page_size: pageSize } = req.query;
    const { rows, total } = await listJobs({ apiKeyId: req.apiKey.id, status, from, to, page, pageSize });

    // Generate signed download URLs for completed jobs in parallel.
    const storage = createStorageClient();
    const jobResponses = await Promise.all(
      rows.map(async (r) => {
        let downloadUrl;
        if (r.status === 'completed' && r.output_key) {
          downloadUrl = await storage.getSignedDownloadUrl(r.output_key).catch(() => null);
        }
        return toJobResponse(r, { downloadUrl });
      }),
    );

    res.json({
      jobs: jobResponses,
      page,
      page_size: pageSize,
      total,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/jobs/:job_id', async (req, res, next) => {
  try {
    const job = await getJobById(req.params.job_id);
    if (!job || job.api_key_id !== req.apiKey.id) throw new ApiError('NOT_FOUND');
    res.json(toJobResponse(job));
  } catch (err) {
    next(err);
  }
});

router.get('/jobs/:job_id/download', async (req, res, next) => {
  try {
    const job = await getJobById(req.params.job_id);
    if (!job || job.api_key_id !== req.apiKey.id) throw new ApiError('NOT_FOUND');
    if (job.status !== 'completed' || !job.output_key) {
      throw new ApiError('VALIDATION_ERROR', 'Job is not completed yet.');
    }
    const storage = createStorageClient();
    const url = await storage.getSignedDownloadUrl(job.output_key);
    if (req.accepts(['html', 'json']) === 'json') {
      return res.json({ download_url: url });
    }
    res.redirect(302, url);
  } catch (err) {
    next(err);
  }
});

router.delete('/jobs/:job_id', async (req, res, next) => {
  try {
    const job = await getJobById(req.params.job_id);
    if (!job || job.api_key_id !== req.apiKey.id) throw new ApiError('NOT_FOUND');

    if (['queued', 'processing'].includes(job.status)) {
      const cancelled = await cancelJob(job.id);
      // Cancellation is a terminal state change the API knows about immediately -
      // notify the callback the same way completion/failure do, rather than
      // leaving cancelled jobs silently un-notified.
      if (cancelled?.callback_url) {
        await enqueueWebhookDelivery(cancelled.id).catch((err) => req.log?.error({ err }, 'failed to enqueue cancellation webhook'));
      }
      await writeAuditLog(req.apiKey.key_prefix, 'job.cancelled', 'conversion_job', job.id, {}).catch(() => {});
    } else {
      if (job.output_key) {
        const storage = createStorageClient();
        await storage.deleteObject(job.output_key).catch(() => {});
      }
      await deleteJobRecord(job.id);
      await writeAuditLog(req.apiKey.key_prefix, 'job.deleted', 'conversion_job', job.id, {}).catch(() => {});
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.patch('/jobs/:job_id', validate(UpdateJobSchema, 'body'), async (req, res, next) => {
  try {
    const updated = await updateJobOptions(req.params.job_id, req.body.options, req.apiKey.id);
    if (!updated) {
      // Either it doesn't exist, or it already left the `queued` state.
      const existing = await getJobById(req.params.job_id);
      if (!existing || existing.api_key_id !== req.apiKey.id) throw new ApiError('NOT_FOUND');
      throw new ApiError('VALIDATION_ERROR', 'Job already started; options can only be updated while queued.');
    }
    await writeAuditLog(req.apiKey.key_prefix, 'job.updated', 'conversion_job', updated.id, {
      engine: updated.engine,
    }).catch(() => {});
    res.json(toJobResponse(updated));
  } catch (err) {
    next(err);
  }
});

export default router;
