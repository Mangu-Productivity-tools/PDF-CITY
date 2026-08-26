import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashApiKey, generateApiKey } from '../src/lib/apiKeys.js';

test('hashApiKey returns a 64-char hex string (sha256)', () => {
  const hash = hashApiKey('sk_abc123');
  assert.equal(typeof hash, 'string');
  assert.equal(hash.length, 64);
  assert.ok(/^[0-9a-f]+$/.test(hash), 'must be lowercase hex');
});

test('hashApiKey is deterministic', () => {
  assert.equal(hashApiKey('mykey'), hashApiKey('mykey'));
});

test('hashApiKey differs for different keys', () => {
  assert.notEqual(hashApiKey('key-a'), hashApiKey('key-b'));
});

test('generateApiKey returns a raw key with sk_ prefix', () => {
  const { raw, prefix: _prefix } = generateApiKey();
  assert.ok(raw.startsWith('sk_'), `expected sk_ prefix, got ${raw}`);
  // 'sk_' (3 chars) + 48 hex chars from randomBytes(24)
  assert.equal(raw.length, 3 + 48);
});

test('generateApiKey prefix matches the first 11 characters of raw', () => {
  const { raw, prefix } = generateApiKey();
  assert.equal(prefix, raw.slice(0, 11));
});

test('generateApiKey produces unique keys on each call', () => {
  const a = generateApiKey().raw;
  const b = generateApiKey().raw;
  assert.notEqual(a, b);
});
