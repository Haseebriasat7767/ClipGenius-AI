/**
 * Embedded PostgreSQL manager for local development and testing.
 *   npm run db:start   — boot the bundled Postgres (creates data/pgdata)
 *   npm run db:stop    — stop it
 *   npm run db:status  — print status
 *   npm run db:reset   — stop, wipe data, restart
 * Production should point DATABASE_URL at a managed Postgres (e.g. Supabase).
 */
import { loadEnvFiles } from '../src/lib/loadEnv';
loadEnvFiles();

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Client } from 'pg';

const DATA_DIR = path.resolve('./data/pgdata');
const DB_NAME = 'clipgenius';
const DB_PORT = parseInt(process.env.DEV_PG_PORT ?? '5432', 10);
const DB_USER = 'postgres';
const DB_PASS = 'postgres';

function initdbPath(): string {
  return path.resolve('./node_modules/@embedded-postgres/linux-x64/native/bin/initdb');
}

export function devDatabaseUrl(): string {
  return `postgres://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_NAME}`;
}

async function createInstance() {
  const EmbeddedPostgres = (await import('embedded-postgres')).default;
  return new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: DB_USER,
    password: DB_PASS,
    port: DB_PORT,
    persistent: true,
    onLog: () => {},
  });
}

async function ensureDatabase(): Promise<void> {
  const client = new Client({
    host: '127.0.0.1',
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS,
    database: 'postgres',
  });
  await client.connect();
  try {
    const res = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
    if (res.rowCount === 0) {
      await client.query(`CREATE DATABASE ${DB_NAME}`);
    }
  } finally {
    await client.end();
  }
}

function writeEnvLocal(): void {
  const envPath = path.resolve('./.env.local');
  const line = `DATABASE_URL=${devDatabaseUrl()}`;
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  if (!content.includes('DATABASE_URL=')) {
    content = `${content}${content && !content.endsWith('\n') ? '\n' : ''}${line}\n`;
    fs.writeFileSync(envPath, content, 'utf8');
  }
}

async function isRunning(): Promise<boolean> {
  const client = new Client({
    host: '127.0.0.1',
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS,
    database: 'postgres',
    connectionTimeoutMillis: 1500,
  });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? 'status';

  if (cmd === 'status') {
    const up = await isRunning();
    console.log(up ? `PostgreSQL is running on port ${DB_PORT} (${devDatabaseUrl()})` : 'PostgreSQL is not running');
    return;
  }

  if (cmd === 'stop') {
    if (!fs.existsSync(DATA_DIR)) {
      console.log('No data directory — nothing to stop');
      return;
    }
    const pg = await createInstance();
    await pg.stop();
    console.log('PostgreSQL stopped');
    return;
  }

  if (cmd === 'reset') {
    if (fs.existsSync(DATA_DIR)) {
      try {
        const pg = await createInstance();
        await pg.stop();
      } catch {
        /* already stopped */
      }
      fs.rmSync(DATA_DIR, { recursive: true, force: true });
      console.log('Data directory wiped');
    }
    // fall through to start
  }

  if (cmd === 'start' || cmd === 'reset') {
    if (await isRunning()) {
      console.log(`PostgreSQL already running on port ${DB_PORT}`);
      writeEnvLocal();
      console.log(`DATABASE_URL=${devDatabaseUrl()}`);
      return;
    }
    const pg = await createInstance();
    if (!fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
      console.log('Initializing PostgreSQL data directory...');
      fs.mkdirSync(DATA_DIR, { recursive: true });
      execFileSync(initdbPath(), ['-D', DATA_DIR, '-U', DB_USER, '--auth=trust'], {
        stdio: 'pipe',
      });
    }
    await pg.start();
    await ensureDatabase();
    writeEnvLocal();
    console.log('PostgreSQL started');
    console.log(`DATABASE_URL=${devDatabaseUrl()}`);
    return;
  }

  console.log('Usage: tsx scripts/db.ts start|stop|status|reset');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
