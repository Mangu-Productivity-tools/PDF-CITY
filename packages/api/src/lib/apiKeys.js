import { createHash, randomBytes } from 'node:crypto';
import { getPool } from '../db/pool.js';

export function hashApiKey(rawKey) {
  return createHash('sha256').update(rawKey).digest('hex');
}

export function generateApiKey() {
  const raw = `sk_${randomBytes(24).toString('hex')}`;
  return { raw, prefix: raw.slice(0, 11) };
}

export async function findApiKeyByRawValue(rawKey) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT * FROM api_keys
     WHERE key_hash = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
    [hashApiKey(rawKey)],
  );
  return rows[0] ?? null;
}

/**
 * Dev/Phase-1 convenience: seed raw keys from API_KEYS_BOOTSTRAP (comma
 * separated) if the api_keys table is empty. Production key issuance is a
 * Phase 2 admin endpoint (see docs/ROADMAP.md) - for now, insert real keys
 * directly via SQL and hand the raw value to the customer out of band.
 */
export async function bootstrapDevKeys() {
  const raw = process.env.API_KEYS_BOOTSTRAP;
  if (!raw) return;
  const pool = getPool();
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM api_keys');
  if (rows[0].n > 0) return;

  for (const key of raw.split(',').map((k) => k.trim()).filter(Boolean)) {
    await pool.query(
      `INSERT INTO api_keys (name, key_prefix, key_hash, scope) VALUES ($1, $2, $3, 'convert')
       ON CONFLICT DO NOTHING`,
      ['bootstrap', key.slice(0, 11), hashApiKey(key)],
    );
    // eslint-disable-next-line no-console
    console.log(`[api-keys] bootstrapped dev key: ${key}`);
  }
}
