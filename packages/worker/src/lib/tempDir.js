import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export async function createJobTempDir(jobId) {
  const base = process.env.TEMP_DIR || tmpdir();
  await import('node:fs/promises').then((fs) => fs.mkdir(base, { recursive: true }).catch(() => {}));
  return mkdtemp(path.join(base, `job-${jobId}-`));
}

export async function cleanupTempDir(dir) {
  if (!dir) return;
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}
