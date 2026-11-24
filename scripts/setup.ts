/**
 * One-command setup: verify the database is reachable, run migrations, seed.
 *   npm run setup
 * Start the local dev database first with `npm run db:start` (separate terminal),
 * or point DATABASE_URL at a managed Postgres such as Supabase.
 */
import { loadEnvFiles } from '../src/lib/loadEnv';
loadEnvFiles();

import { spawnSync } from 'node:child_process';
import { getPool } from '../src/lib/db';

async function main(): Promise<void> {
  console.log('ClipGenius AI — setup');
  console.log('---------------------');

  try {
    await getPool().query('SELECT 1');
    console.log('✓ Database reachable');
  } catch (err) {
    console.error('✗ Database not reachable.');
    console.error('  Run `npm run db:start` for the bundled dev Postgres, or set DATABASE_URL.');
    process.exit(1);
  }

  console.log('· Running migrations…');
  const migrate = spawnSync('npx', ['tsx', 'scripts/migrate.ts'], { stdio: 'inherit' });
  if (migrate.status !== 0) process.exit(1);

  console.log('· Seeding admin account…');
  const seed = spawnSync('npx', ['tsx', 'scripts/seed.ts'], { stdio: 'inherit' });
  if (seed.status !== 0) process.exit(1);

  console.log('\nSetup complete. Next steps:');
  console.log('  npm run dev      # web app on http://localhost:3000');
  console.log('  npm run worker   # background processing worker');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
