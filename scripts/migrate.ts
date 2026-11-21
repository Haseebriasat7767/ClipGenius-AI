/**
 * SQL migration runner (idempotent, tracks applied files in schema_migrations).
 *   npm run migrate
 */
import { loadEnvFiles } from '../src/lib/loadEnv';
loadEnvFiles();

import fs from 'node:fs';
import path from 'node:path';
import { getPool, query } from '../src/lib/db';

async function main(): Promise<void> {
  const migrationsDir = path.resolve('./migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  const applied = new Set(
    (await query<{ filename: string }>('SELECT filename FROM schema_migrations')).map((r) => r.filename),
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`✓ ${file} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`✓ ${file} applied`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`✗ ${file} failed:`, err);
      throw err;
    } finally {
      client.release();
    }
  }
  console.log('Migrations complete');
  await getPool().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
