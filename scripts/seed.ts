/**
 * Seed script — creates the admin account (idempotent).
 *   npm run seed
 * Admin email comes from ADMIN_EMAILS (first entry) or defaults to
 * admin@clipgenius.ai. A random password is generated and printed on first run.
 */
import { loadEnvFiles } from '../src/lib/loadEnv';
loadEnvFiles();

import { randomBytes } from 'node:crypto';
import { queryOne, getPool } from '../src/lib/db';
import { hashPassword } from '../src/lib/auth';

async function main(): Promise<void> {
  const emails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const adminEmail = emails[0] ?? 'admin@clipgenius.ai';

  const existing = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = $1', [adminEmail]);
  if (existing) {
    console.log(`Admin user already exists: ${adminEmail}`);
  } else {
    const password = `Cg!${randomBytes(9).toString('base64url')}`;
    const user = await queryOne<{ id: string }>(
      `INSERT INTO users (email, password_hash, name, role, plan)
       VALUES ($1, $2, 'Administrator', 'admin', 'agency')
       RETURNING id`,
      [adminEmail, await hashPassword(password)],
    );
    await queryOne(
      `INSERT INTO subscriptions (user_id, plan, status) VALUES ($1, 'agency', 'active')`,
      [user!.id],
    );
    console.log('Admin user created:');
    console.log(`  email:    ${adminEmail}`);
    console.log(`  password: ${password}`);
    console.log('  (change it after first sign-in)');
  }

  await getPool().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
