import path from 'node:path';
import { readdir, stat, readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { createStorageClient, LIMITS } from '@epub2pdf/shared';
import { createJobTempDir, cleanupTempDir } from './lib/tempDir.js';
import { downloadSource } from './lib/download.js';
import { extractEpub } from './epub/extract.js';
import { parseContainer, detectDrm } from './epub/container.js';
import { parseOpf } from './epub/opf.js';
import { assembleHtml } from './epub/assemble.js';
import { render } from './engines/index.js';
import { WorkerError, toBullMqThrow } from './lib/errors.js';
import {
  markProcessing,
  setProgress,
  markCompleted,
  markFailed,
  recordAttemptError,
  getJobById,
  logEvent,
  writeAuditLog,
} from './db/jobsRepo.js';
import { enqueueWebhookDelivery } from './queue/webhookQueue.js';
import {
  conversionJobsStarted,
  conversionJobsProcessed,
  conversionJobsFailed,
  conversionJobDuration,
  engineUsageCounter,
  activeJobsGauge,
  renderingMemoryBytesGauge,
} from './metrics.js';
import { logger } from './lib/logger.js';

const FONT_EXTENSIONS = new Set(['.woff', '.woff2', '.ttf', '.otf', '.eot']);

async function sumFontBytes(dir) {
  let total = 0;
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (entry.isFile() && FONT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      const filePath = path.join(entry.parentPath ?? entry.path, entry.name);
      const { size } = await stat(filePath);
      total += size;
    }
  }
  return total;
}

/**
 * BullMQ processor for the `epub-conversion` queue. One call = one attempt
 * at converting one job. Throwing lets BullMQ's own attempts/backoff
 * (JOB_ATTEMPTS, JOB_BACKOFF_BASE_MS) decide whether there's a next attempt;
 * we only flip the DB row to a terminal state when we know this was the
 * last one (or the error is inherently non-retryable).
 */
export async function processConversionJob(bullJob) {
  const { jobId } = bullJob.data;
  const startedAt = Date.now();
  const workerId = `${process.env.HOSTNAME || 'worker'}-${process.pid}`;
  const log = logger.child({ jobId, correlationId: bullJob.id, attempt: bullJob.attemptsMade + 1 });
  let tempDir;

  const job = await getJobById(jobId);
  if (!job || job.status === 'cancelled') {
    log.info('job missing or already cancelled; skipping');
    return;
  }

  activeJobsGauge.inc();
  conversionJobsStarted.inc();

  const maxAttempts = bullJob.opts?.attempts ?? 1;
  const isLastAttempt = bullJob.attemptsMade + 1 >= maxAttempts;

  try {
    await markProcessing(jobId, workerId);
    await logEvent(jobId, 'info', 'Job started', bullJob.id);

    tempDir = await createJobTempDir(jobId);
    const epubPath = path.join(tempDir, 'source.epub');

    await downloadSource(job.file_url, epubPath);
    await setProgress(jobId, 20);

    extractEpub(epubPath, tempDir);
    if (detectDrm(tempDir)) {
      throw new WorkerError('DRM_NOT_SUPPORTED', 'This EPUB is DRM-protected and cannot be converted.');
    }

    const fontBytes = await sumFontBytes(tempDir);
    const fontLimitBytes = LIMITS.MAX_FONT_SIZE_MB * 1024 * 1024;
    if (fontBytes > fontLimitBytes) {
      throw new WorkerError(
        'CONVERSION_FAILED',
        `Embedded fonts total ${(fontBytes / 1024 / 1024).toFixed(1)} MB, exceeding the ${LIMITS.MAX_FONT_SIZE_MB} MB limit.`,
      );
    }
    await setProgress(jobId, 30);

    const opfRelPath = parseContainer(tempDir);
    const { opfDir, title, creator, identifier, manifest, spine } = parseOpf(tempDir, opfRelPath);
    await setProgress(jobId, 40);

    const { htmlPath, chapterCount } = assembleHtml({ opfDir, manifest, spine, title });
    await setProgress(jobId, 55);

    const engineName = job.engine || 'chrome';
    engineUsageCounter.inc({ engine: engineName });
    const outputPdfPath = path.join(tempDir, 'output.pdf');
    await render(engineName, { htmlPath, outputPdfPath, options: job.options || {} });
    await setProgress(jobId, 80);

    const pdfBytes = await readFile(outputPdfPath);
    let pageCount = null;
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
      pageCount = pdfDoc.getPageCount();
    } catch (err) {
      log.warn({ err }, 'could not introspect generated PDF page count');
    }
    if (pageCount !== null && pageCount > LIMITS.MAX_PAGE_COUNT) {
      throw new WorkerError(
        'CONVERSION_FAILED',
        `Generated PDF has ${pageCount} pages, which exceeds the maximum of ${LIMITS.MAX_PAGE_COUNT}.`,
      );
    }

    const storage = createStorageClient();
    const outputKey = `conversions/${jobId}.pdf`;
    try {
      await storage.putObject(outputKey, pdfBytes, {
        contentType: 'application/pdf',
        metadata: { 'job-id': jobId, engine: engineName },
      });
    } catch (err) {
      throw new WorkerError('UPLOAD_FAILED', err.message);
    }
    await setProgress(jobId, 95);

    const metadata = {
      title,
      creator,
      identifier,
      page_count: pageCount,
      chapter_count: chapterCount,
      engine: engineName,
    };
    await markCompleted(jobId, { outputKey, metadata });
    await logEvent(jobId, 'info', 'Job completed', bullJob.id);
    await writeAuditLog(workerId, 'job.completed', 'conversion_job', jobId, { engine: engineName, page_count: metadata.page_count }).catch(() => {});
    await enqueueWebhookDelivery(jobId);

    conversionJobsProcessed.inc();
    conversionJobDuration.observe((Date.now() - startedAt) / 1000);
  } catch (err) {
    const thrown = toBullMqThrow(err instanceof WorkerError ? err : new WorkerError('INTERNAL_ERROR', err.message));
    const code = thrown.code || 'INTERNAL_ERROR';
    const terminal = isLastAttempt || thrown.name === 'UnrecoverableError';

    await logEvent(jobId, 'error', `Attempt failed: ${code} - ${thrown.message}`, bullJob.id).catch(() => {});

    if (terminal) {
      await markFailed(jobId, { code, message: thrown.message }).catch(() => {});
      await writeAuditLog(workerId, 'job.failed', 'conversion_job', jobId, { code, attempt: bullJob.attemptsMade + 1 }).catch(() => {});
      conversionJobsFailed.inc({ error_code: code });
      await enqueueWebhookDelivery(jobId).catch((e) => log.error({ err: e }, 'failed to enqueue webhook'));
      log.error({ code }, 'job failed (terminal)');
    } else {
      await recordAttemptError(jobId, { code, message: thrown.message }).catch(() => {});
      log.warn({ code }, 'job attempt failed; will retry');
    }

    throw thrown;
  } finally {
    await cleanupTempDir(tempDir);
    activeJobsGauge.dec();
    renderingMemoryBytesGauge.set(process.memoryUsage().rss);
  }
}
