import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDisallowedIp } from '../src/lib/ssrfGuard.js';

test('blocks IPv4 loopback, RFC1918, link-local/metadata, and reserved ranges', () => {
  const blocked = [
    '127.0.0.1',
    '10.0.0.5',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata endpoint
    '0.0.0.0',
    '100.64.0.1', // CGNAT
    '224.0.0.1', // multicast
  ];
  for (const ip of blocked) {
    assert.equal(isDisallowedIp(ip), true, `expected ${ip} to be blocked`);
  }
});

test('allows ordinary public IPv4 addresses', () => {
  const allowed = ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.255.255', '172.32.0.1'];
  for (const ip of allowed) {
    assert.equal(isDisallowedIp(ip), false, `expected ${ip} to be allowed`);
  }
});

test('blocks IPv6 loopback, link-local, and unique-local ranges', () => {
  const blocked = ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456:789a::1'];
  for (const ip of blocked) {
    assert.equal(isDisallowedIp(ip), true, `expected ${ip} to be blocked`);
  }
});

test('unwraps IPv4-mapped IPv6 addresses before checking', () => {
  assert.equal(isDisallowedIp('::ffff:127.0.0.1'), true);
  assert.equal(isDisallowedIp('::ffff:8.8.8.8'), false);
});

test('allows ordinary public IPv6 addresses', () => {
  assert.equal(isDisallowedIp('2606:4700:4700::1111'), false); // Cloudflare DNS
});
