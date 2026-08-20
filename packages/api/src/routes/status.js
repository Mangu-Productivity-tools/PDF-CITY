import { Router } from 'express';
import { createStorageClient } from '@epub2pdf/shared';
import { getJobById, toJobResponse } from '../db/jobsRepo.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

router.get('/status/:job_id', async (req, res, next) => {
  try {
    const job = await getJobById(req.params.job_id);
    if (!job || job.api_key_id !== req.apiKey.id) {
      throw new ApiError('NOT_FOUND');
    }

    let downloadUrl;
    if (job.status === 'completed' && job.output_key) {
      const storage = createStorageClient();
      downloadUrl = await storage.getSignedDownloadUrl(job.output_key);
    }

    res.json(toJobResponse(job, { downloadUrl }));
  } catch (err) {
    next(err);
  }
});

export default router;
