import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ConvertOptionsSchema,
  ConvertByUrlSchema,
  ConvertByUploadFieldsSchema,
  ListJobsQuerySchema,
  UpdateJobSchema,
} from '../src/jobSchema.js';

// ---- ConvertOptionsSchema ----

test('ConvertOptionsSchema applies sensible defaults when called with an empty object', () => {
  const result = ConvertOptionsSchema.parse({});
  assert.equal(result.engine, 'chrome');
  assert.equal(result.page_size, 'A4');
  assert.equal(result.margin_top_in, 0.75);
  assert.equal(result.margin_bottom_in, 0.75);
  assert.equal(result.include_header, false);
  assert.equal(result.include_footer, true);
});

test('ConvertOptionsSchema accepts explicit chrome engine', () => {
  const result = ConvertOptionsSchema.parse({ engine: 'chrome' });
  assert.equal(result.engine, 'chrome');
});

test('ConvertOptionsSchema accepts calibre engine (validation; API layer blocks it)', () => {
  const result = ConvertOptionsSchema.parse({ engine: 'calibre' });
  assert.equal(result.engine, 'calibre');
});

test('ConvertOptionsSchema rejects an unknown engine', () => {
  assert.throws(() => ConvertOptionsSchema.parse({ engine: 'inkscape' }), /Invalid enum value/);
});

test('ConvertOptionsSchema rejects a margin above 3 inches', () => {
  assert.throws(() => ConvertOptionsSchema.parse({ margin_top_in: 5 }), /too_big/);
});

// ---- ConvertByUrlSchema ----

test('ConvertByUrlSchema accepts a valid HTTPS file_url', () => {
  const result = ConvertByUrlSchema.parse({ file_url: 'https://example.com/book.epub' });
  assert.equal(result.file_url, 'https://example.com/book.epub');
});

test('ConvertByUrlSchema rejects an HTTP (non-HTTPS) URL', () => {
  assert.throws(() => ConvertByUrlSchema.parse({ file_url: 'http://example.com/book.epub' }));
});

test('ConvertByUrlSchema rejects a missing file_url', () => {
  assert.throws(() => ConvertByUrlSchema.parse({}));
});

test('ConvertByUrlSchema allows a callback_url', () => {
  const result = ConvertByUrlSchema.parse({
    file_url: 'https://example.com/book.epub',
    callback_url: 'https://myapp.example.com/webhook',
  });
  assert.equal(result.callback_url, 'https://myapp.example.com/webhook');
});

// ---- ListJobsQuerySchema ----

test('ListJobsQuerySchema coerces string page and page_size to numbers', () => {
  const result = ListJobsQuerySchema.parse({ page: '2', page_size: '50' });
  assert.equal(result.page, 2);
  assert.equal(result.page_size, 50);
});

test('ListJobsQuerySchema applies default page=1, page_size=20', () => {
  const result = ListJobsQuerySchema.parse({});
  assert.equal(result.page, 1);
  assert.equal(result.page_size, 20);
});

test('ListJobsQuerySchema rejects page_size above 100', () => {
  assert.throws(() => ListJobsQuerySchema.parse({ page_size: '200' }));
});

test('ListJobsQuerySchema rejects an invalid status value', () => {
  assert.throws(() => ListJobsQuerySchema.parse({ status: 'unknown' }));
});

// ---- ConvertByUploadFieldsSchema ----

test('ConvertByUploadFieldsSchema accepts empty object (both fields optional)', () => {
  const result = ConvertByUploadFieldsSchema.parse({});
  assert.equal(result.callback_url, undefined);
  assert.equal(result.options, undefined);
});

// ---- UpdateJobSchema ----

test('UpdateJobSchema accepts valid options', () => {
  const result = UpdateJobSchema.parse({ options: { page_size: 'Letter' } });
  assert.equal(result.options.page_size, 'Letter');
});
