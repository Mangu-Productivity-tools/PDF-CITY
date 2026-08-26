import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UnrecoverableError } from 'bullmq';
import { WorkerError, toBullMqThrow } from '../src/lib/errors.js';

test('WorkerError stores code and message', () => {
  const err = new WorkerError('DRM_NOT_SUPPORTED', 'DRM protected');
  assert.equal(err.code, 'DRM_NOT_SUPPORTED');
  assert.equal(err.message, 'DRM protected');
  assert.ok(err instanceof Error);
});

test('toBullMqThrow returns UnrecoverableError for non-retryable codes', () => {
  const NON_RETRYABLE = ['INVALID_URL', 'INVALID_EPUB', 'DRM_NOT_SUPPORTED', 'UNZIP_FAILED', 'PARSE_FAILED', 'CONVERSION_FAILED'];
  for (const code of NON_RETRYABLE) {
    const result = toBullMqThrow(new WorkerError(code, 'msg'));
    assert.ok(result instanceof UnrecoverableError, `${code} must produce UnrecoverableError`);
    assert.equal(result.code, code);
  }
});

test('toBullMqThrow returns WorkerError (retryable) for non-terminal codes', () => {
  const err = toBullMqThrow(new WorkerError('UPLOAD_FAILED', 'S3 error'));
  assert.ok(!(err instanceof UnrecoverableError), 'UPLOAD_FAILED must be retryable');
  assert.ok(err instanceof WorkerError);
  assert.equal(err.code, 'UPLOAD_FAILED');
});

test('toBullMqThrow wraps a generic Error as INTERNAL_ERROR (retryable)', () => {
  const err = toBullMqThrow(new Error('boom'));
  assert.ok(!(err instanceof UnrecoverableError));
  assert.equal(err.code, 'INTERNAL_ERROR');
});
