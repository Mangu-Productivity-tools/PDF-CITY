import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signWebhookPayload, verifyWebhookSignature } from '../src/hmac.js';

test('signWebhookPayload returns sha256=<hex> prefix', () => {
  const sig = signWebhookPayload('hello', 'secret');
  assert.ok(sig.startsWith('sha256='), `expected sha256= prefix, got ${sig}`);
  assert.equal(sig.length, 'sha256='.length + 64); // 64 hex chars = 32 bytes
});

test('signWebhookPayload is deterministic for same input', () => {
  const a = signWebhookPayload('payload', 'mysecret');
  const b = signWebhookPayload('payload', 'mysecret');
  assert.equal(a, b);
});

test('signWebhookPayload produces different values for different secrets', () => {
  const a = signWebhookPayload('payload', 'secret1');
  const b = signWebhookPayload('payload', 'secret2');
  assert.notEqual(a, b);
});

test('signWebhookPayload produces different values for different payloads', () => {
  const a = signWebhookPayload('payload-a', 'secret');
  const b = signWebhookPayload('payload-b', 'secret');
  assert.notEqual(a, b);
});

test('verifyWebhookSignature returns true for a matching signature', () => {
  const body = JSON.stringify({ job_id: '123', status: 'completed' });
  const secret = 'test-secret';
  const sig = signWebhookPayload(body, secret);
  assert.equal(verifyWebhookSignature(body, secret, sig), true);
});

test('verifyWebhookSignature returns false for a tampered payload', () => {
  const secret = 'secret';
  const sig = signWebhookPayload('original', secret);
  assert.equal(verifyWebhookSignature('tampered', secret, sig), false);
});

test('verifyWebhookSignature returns false for a missing/empty signature header', () => {
  assert.equal(verifyWebhookSignature('body', 'secret', ''), false);
  assert.equal(verifyWebhookSignature('body', 'secret', null), false);
  assert.equal(verifyWebhookSignature('body', 'secret', undefined), false);
});

test('verifyWebhookSignature returns false for a wrong secret', () => {
  const body = 'payload';
  const sig = signWebhookPayload(body, 'correct-secret');
  assert.equal(verifyWebhookSignature(body, 'wrong-secret', sig), false);
});
