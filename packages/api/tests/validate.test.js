import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { validate } from '../src/middleware/validate.js';

test('validate passes through and coerces valid input', () => {
  const schema = z.object({ page: z.coerce.number().int().min(1).default(1) });
  const middleware = validate(schema, 'query');
  const req = { query: { page: '3' } };
  let nextCalled = false;
  const res = { status() { return this; }, json() {} };

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.query.page, 3);
});

test('validate returns 400 VALIDATION_ERROR on invalid input', () => {
  const schema = z.object({ file_url: z.string().url() });
  const middleware = validate(schema, 'body');
  const req = { body: { file_url: 'not-a-url' } };
  let statusCode;
  let jsonBody;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      jsonBody = body;
    },
  };

  middleware(req, res, () => {
    throw new Error('next should not be called on invalid input');
  });

  assert.equal(statusCode, 400);
  assert.equal(jsonBody.error_code, 'VALIDATION_ERROR');
});
