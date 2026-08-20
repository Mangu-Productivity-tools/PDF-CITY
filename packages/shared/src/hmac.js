import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Sign a webhook payload per spec: "HMAC-SHA256 signature in X-Hub-Signature
 * header computed over payload with shared secret."
 * @param {string|Buffer} rawBody - the exact bytes that will be sent as the request body
 * @param {string} secret
 * @returns {string} e.g. "sha256=<hex>"
 */
export function signWebhookPayload(rawBody, secret) {
  const digest = createHmac('sha256', secret).update(rawBody).digest('hex');
  return `sha256=${digest}`;
}

/**
 * Constant-time verification of an inbound/echoed signature. Use this on
 * the receiving side (or in tests) to confirm a payload wasn't tampered with.
 */
export function verifyWebhookSignature(rawBody, secret, signatureHeader) {
  if (!signatureHeader) return false;
  const expected = signWebhookPayload(rawBody, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
