import { Router } from 'express';
import multer from 'multer';
import { randomUUID, randomBytes } from 'node:crypto';
import {
  ConvertByUrlSchema,
  ConvertByUploadFieldsSchema,
  LIMITS,
  errorBody,
  createStorageClient,
} from '@epub2pdf/shared';
import { createJob } from '../db/jobsRepo.js';
import { enqueueConversionJob } from '../queue/queue.js';
import { ApiError } from '../middleware/errorHandler.js';
import { requireConcurrencyHeadroom } from '../middleware/rateLimit.js';
import { jobsSubmittedTotal } from './metrics.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.MAX_EPUB_SIZE_MB * 1024 * 1024 },
});

const router = Router();

function estimateProcessingSeconds(fileSizeBytes) {
  const mb = fileSizeBytes ? fileSizeBytes / (1024 * 1024) : 5;
  return Math.min(600, Math.round(20 + mb * 3));
}

function isEpubZipMagic(buffer) {
  // ZIP local file header magic bytes "PK\x03\x04" (or empty-archive "PK\x05\x06").
  return (
    buffer.length > 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05)
  );
}

router.post('/convert', requireConcurrencyHeadroom, upload.single('file'), async (req, res, next) => {
  try {
    const isMultipart = Boolean(req.file) || req.is('multipart/form-data');
    const jobId = randomUUID();
    const storage = createStorageClient();

    let fileUrl;
    let sourceFilename = null;
    let parsedOptions;
    let callbackUrl;

    if (isMultipart) {
      if (!req.file) {
        throw new ApiError('VALIDATION_ERROR', 'multipart/form-data requests must include a "file" field.');
      }
      if (!isEpubZipMagic(req.file.buffer)) {
        throw new ApiError('UNSUPPORTED_MEDIA_TYPE');
      }
      let fields;
      try {
        fields = ConvertByUploadFieldsSchema.parse({
          callback_url: req.body.callback_url || undefined,
          options: req.body.options ? JSON.parse(req.body.options) : undefined,
        });
      } catch (err) {
        throw new ApiError('VALIDATION_ERROR', err.message);
      }
      parsedOptions = fields.options ?? {};
      callbackUrl = fields.callback_url;
      sourceFilename = req.file.originalname;

      const key = `uploads/${jobId}.epub`;
      await storage.putObject(key, req.file.buffer, { contentType: 'application/epub+zip' });
      fileUrl = `s3://${storage.bucket}/${key}`;
    } else {
      let body;
      try {
        body = ConvertByUrlSchema.parse(req.body);
      } catch (err) {
        throw new ApiError('INVALID_URL', err.issues?.[0]?.message || err.message);
      }
      fileUrl = body.file_url;
      callbackUrl = body.callback_url;
      parsedOptions = body.options ?? {};
    }

    // ADR 0004: Chrome is the sole verified production engine.
    // Reject calibre requests until the CLI flag set is validated on a real Docker host.
    if (parsedOptions.engine === 'calibre') {
      throw new ApiError(
        'VALIDATION_ERROR',
        "engine 'calibre' is not enabled in this environment; use engine 'chrome' (default).",
      );
    }

    const webhookSecret = callbackUrl ? randomBytes(32).toString('hex') : null;

    const job = await createJob({
      id: jobId,
      fileUrl,
      sourceFilename,
      options: parsedOptions,
      callbackUrl,
      webhookSecret,
      apiKeyId: req.apiKey.id,
    });

    await enqueueConversionJob(job);
    jobsSubmittedTotal.inc();

    const statusUrl = `/api/v1/status/${job.id}`;
    res.status(201).set('Location', statusUrl).json({
      job_id: job.id,
      status: job.status,
      estimated_time_seconds: estimateProcessingSeconds(req.file?.size),
      status_url: statusUrl,
    });
  } catch (err) {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json(errorBody('PAYLOAD_TOO_LARGE'));
    }
    next(err);
  }
});

export default router;
