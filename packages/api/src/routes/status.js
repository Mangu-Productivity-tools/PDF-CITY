import { Router } from 'express';
import { createStorageClient } from '@epub2pdf/shared';
import { getJobById, toJobResponse } from '../db/jobsRepo.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

// Public endpoint — no auth required.  Mounted directly on the Express app
// (not inside the authenticated v1 sub-router) so callers can poll job status
// without an API key.  The job_id is a v4 UUID, so it acts as a capability
// token: guessing a valid UUID is not feasible.
router.get('/status/:job_id', async (req, res, next) => {
  try {
    const job = await getJobById(req.params.job_id);
    if (!job) throw new ApiError('NOT_FOUND');

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
