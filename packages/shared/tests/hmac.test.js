import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signWebhookPayload, verifyWebhookSignature } from '../src/hmac.js';

test('signWebhookPayload produces a well-formed sha256= signature', () => {
  const sig = signWebhookPayload('{"a":1}', 'secret');
  assert.match(sig, /^sha256=[0-9a-f]{64}$/);
});

test('verifyWebhookSignature accepts a matching signature', () => {
  const body = JSON.stringify({ hello: 'world' });
  const sig = signWebhookPayload(body, 'topsecret');
  assert.equal(verifyWebhookSignature(body, 'topsecret', sig), true);
});

test('verifyWebhookSignature rejects a tampered body', () => {
  const body = JSON.stringify({ hello: 'world' });
  const sig = signWebhookPayload(body, 'topsecret');
  assert.equal(verifyWebhookSignature('{"hello":"WORLD"}', 'topsecret', sig), false);
});

test('verifyWebhookSignature rejects the wrong secret', () => {
  const body = JSON.stringify({ hello: 'world' });
  const sig = signWebhookPayload(body, 'topsecret');
  assert.equal(verifyWebhookSignature(body, 'wrong-secret', sig), false);
});

test('verifyWebhookSignature rejects a missing signature header', () => {
  assert.equal(verifyWebhookSignature('body', 'secret', undefined), false);
});
