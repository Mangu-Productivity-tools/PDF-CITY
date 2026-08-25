#!/usr/bin/env node
// Minimal, dependency-light migration runner: applies db/migrations/*.sql
// in filename order, once each, tracked in schema_migrations.
// Deliberately not Flyway/Prisma - the spec mentions those as options; this
// keeps Phase 1 runnable without extra infra. Swap in a real migration tool
// when the team standardizes on one (see docs/ROADMAP.md).

import pg from 'pg';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  'postgres://postgres:postgres@localhost:5432/epub2pdf';

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const applied = new Set(
      (await client.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename),
    );

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[migrate] skip (already applied): ${file}`);
        continue;
      }
      const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`[migrate] applying: ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }
    console.log('[migrate] up to date.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
