import { UnrecoverableError } from 'bullmq';

/** Error codes that should NOT burn through BullMQ's retry attempts. */
const NON_RETRYABLE = new Set([
  'INVALID_URL',
  'INVALID_EPUB',
  'DRM_NOT_SUPPORTED',
  'UNZIP_FAILED',
  'PARSE_FAILED',
]);

export class WorkerError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

/** Convert a WorkerError into the right throw-shape for a BullMQ processor. */
export function toBullMqThrow(err) {
  const code = err instanceof WorkerError ? err.code : 'INTERNAL_ERROR';
  const message = err.message;
  if (NON_RETRYABLE.has(code)) {
    const unrecoverable = new UnrecoverableError(message);
    unrecoverable.code = code;
    return unrecoverable;
  }
  const wrapped = err instanceof WorkerError ? err : new WorkerError('INTERNAL_ERROR', message);
  return wrapped;
}
