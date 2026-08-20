import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorBody, statusForCode, ErrorCodes } from '../src/errorCodes.js';

test('errorBody returns the canonical message for a known code', () => {
  const body = errorBody('INVALID_URL');
  assert.equal(body.error_code, 'INVALID_URL');
  assert.equal(body.message, ErrorCodes.INVALID_URL.message);
});

test('errorBody supports an override message', () => {
  const body = errorBody('VALIDATION_ERROR', 'custom detail');
  assert.equal(body.message, 'custom detail');
});

test('errorBody falls back to INTERNAL_ERROR for an unknown code', () => {
  const body = errorBody('NOT_A_REAL_CODE');
  assert.equal(body.error_code, 'INTERNAL_ERROR');
});

test('statusForCode maps codes to the documented HTTP status', () => {
  assert.equal(statusForCode('RATE_LIMITED'), 429);
  assert.equal(statusForCode('NOT_FOUND'), 404);
  assert.equal(statusForCode('TIMEOUT'), 504);
  assert.equal(statusForCode('INVALID_EPUB'), 422);
});
