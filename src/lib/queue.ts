/**
 * Durable job queue backed by PostgreSQL (pg-boss).
 * Jobs survive restarts and are retried with backoff by the worker.
 */
import { PgBoss } from 'pg-boss';
import { env } from './env';
import { query, queryOne } from './db';

export const QUEUE_ANALYZE = 'project-analyze';
export const QUEUE_RENDER = 'clip-render';
export const QUEUE_EXPORT = 'clip-export';

declare global {
  // eslint-disable-next-line no-var
  var __cgBoss: PgBoss | undefined;
}

export async function getBoss(): Promise<PgBoss> {
  if (!global.__cgBoss) {
    const boss = new PgBoss({
      connectionString: env.databaseUrl,
    });
    boss.on('error', (err: Error) => {
      if ((err as Error & { code?: string }).code === 'PGBOSS_QUEUE_NOT_FOUND') return;
      console.error('[queue] pg-boss error', err);
    });
    await boss.start();
    global.__cgBoss = boss;
    await ensureQueues();
  }
  return global.__cgBoss;
}

/** pg-boss v12 requires explicit queue creation (idempotent). */
export async function ensureQueues(): Promise<void> {
  const boss = global.__cgBoss;
  if (!boss) return;
  for (const q of [QUEUE_ANALYZE, QUEUE_RENDER, QUEUE_EXPORT]) {
    try {
      await boss.createQueue(q);
    } catch {
      /* already exists */
    }
  }
}

export interface AnalyzeJobData {
  projectId: string;
}

export interface RenderJobData {
  clipId: string;
  /** true when the user explicitly re-exported from the editor */
  isExport?: boolean;
  exportId?: string;
}

export async function enqueueAnalyze(projectId: string): Promise<void> {
  const boss = await getBoss();
  await boss.send(QUEUE_ANALYZE, { projectId } satisfies AnalyzeJobData, {
    priority: 1,
    retryLimit: 2,
    retryDelay: 30,
    singletonKey: projectId,
  });
  await query(
    `INSERT INTO processing_jobs (project_id, user_id, type, status, stage)
     SELECT id, user_id, 'analyze', 'queued', 'Waiting in queue' FROM projects WHERE id = $1`,
    [projectId],
  );
}

export async function enqueueRender(clipId: string, opts: { isExport?: boolean; exportId?: string } = {}): Promise<void> {
  const boss = await getBoss();
  await boss.send(
    QUEUE_RENDER,
    { clipId, isExport: opts.isExport ?? false, exportId: opts.exportId } satisfies RenderJobData,
    {
      priority: opts.isExport ? 0 : 2,
      retryLimit: 2,
      retryDelay: 20,
      singletonKey: `${clipId}:${opts.exportId ?? 'main'}`,
    },
  );
  await query(
    `INSERT INTO processing_jobs (project_id, clip_id, user_id, type, status, stage)
     SELECT project_id, id, user_id, 'render', 'queued', 'Waiting in queue' FROM clips WHERE id = $1`,
    [clipId],
  );
}

export async function updateJobForProject(
  projectId: string,
  patch: { status?: string; stage?: string; progress?: number; error?: string | null },
): Promise<void> {
  await query(
    `UPDATE processing_jobs SET
       status = COALESCE($2, status),
       stage = COALESCE($3, stage),
       progress = COALESCE($4, progress),
       error = $5,
       started_at = CASE WHEN $2 = 'running' AND started_at IS NULL THEN now() ELSE started_at END,
       finished_at = CASE WHEN $2 IN ('completed','failed','canceled') THEN now() ELSE finished_at END,
       updated_at = now()
     WHERE project_id = $1 AND type = 'analyze' AND status NOT IN ('completed','canceled')`,
    [projectId, patch.status ?? null, patch.stage ?? null, patch.progress ?? null, patch.error ?? null],
  );
}

export async function updateJobForClip(
  clipId: string,
  patch: { status?: string; stage?: string; progress?: number; error?: string | null },
): Promise<void> {
  await query(
    `UPDATE processing_jobs SET
       status = COALESCE($2, status),
       stage = COALESCE($3, stage),
       progress = COALESCE($4, progress),
       error = $5,
       attempts = attempts + CASE WHEN $2 = 'running' THEN 1 ELSE 0 END,
       started_at = CASE WHEN $2 = 'running' AND started_at IS NULL THEN now() ELSE started_at END,
       finished_at = CASE WHEN $2 IN ('completed','failed','canceled') THEN now() ELSE finished_at END,
       updated_at = now()
     WHERE id = (
       SELECT id FROM processing_jobs
       WHERE clip_id = $1 AND type = 'render' AND status NOT IN ('completed','canceled')
       ORDER BY created_at DESC LIMIT 1
     )`,
    [clipId, patch.status ?? null, patch.stage ?? null, patch.progress ?? null, patch.error ?? null],
  );
}

/** Cancel queued work for a project (used on delete). */
export async function cancelJobsForProject(projectId: string): Promise<void> {
  await query(
    `UPDATE processing_jobs SET status='canceled', updated_at=now()
     WHERE project_id = $1 AND status IN ('queued','running')`,
    [projectId],
  );
}

export async function getQueueDepth(): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT count(*)::text AS count FROM pgboss.job WHERE state = 'created'`,
  );
  return parseInt(row?.count ?? '0', 10);
}
