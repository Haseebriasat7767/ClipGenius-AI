import { Pool, PoolClient, QueryResultRow } from 'pg';
import { env } from './env';

declare global {
  // eslint-disable-next-line no-var
  var __cgPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!global.__cgPool) {
    global.__cgPool = new Pool({
      connectionString: env.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    global.__cgPool.on('error', (err) => {
      console.error('[db] idle client error', err.message);
    });
  }
  return global.__cgPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query<T>(text, params as never[]);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
