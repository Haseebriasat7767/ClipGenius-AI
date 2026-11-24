import { requireUser } from '@/lib/auth';
import { apiHandler, jsonOk, ApiError } from '@/lib/api';
import { query, queryOne } from '@/lib/db';
import { enqueueAnalyze, cancelJobsForProject } from '@/lib/queue';
import { getPlan, assertClipQuota, type UsageSnapshot } from '@/lib/plans';
import { currentMonth } from '@/lib/db';

/** Re-run analysis for a project (e.g. after changing clip settings). */
export const POST = apiHandler('projects/process', async (req, ctx) => {
  const user = await requireUser(req);
  const project = await queryOne<{ id: string; user_id: string; status: string; settings: { clipCount?: number } }>(
    `SELECT id, user_id, status, settings FROM projects WHERE id = $1 ${user.role === 'admin' ? '' : 'AND user_id = $2'}`,
    user.role === 'admin' ? [ctx.params.id] : [ctx.params.id, user.id],
  );
  if (!project) throw new ApiError(404, 'Project not found', 'not_found');
  if (project.status === 'processing' || project.status === 'queued') {
    throw new ApiError(409, 'This project is already being processed', 'conflict');
  }

  const plan = getPlan(user.plan);
  const usageRow = await queryOne<{ clips_generated: number }>(
    'SELECT clips_generated FROM usage_counters WHERE user_id = $1 AND month = $2',
    [user.id, currentMonth()],
  );
  const usage: UsageSnapshot = {
    clips_generated: usageRow?.clips_generated ?? 0,
    minutes_processed: 0,
    renders: 0,
    storage_bytes: 0,
    projects_this_month: 0,
  };
  assertClipQuota(plan, usage, project.settings?.clipCount ?? 8);

  // Fresh analysis replaces old clips.
  await query('DELETE FROM clips WHERE project_id = $1', [project.id]);
  await cancelJobsForProject(project.id);
  await query(
    `UPDATE projects SET status='queued', progress=0, stage='Waiting in queue', error=NULL,
       clips_count=0, analysis='{}'::jsonb, updated_at=now() WHERE id=$1`,
    [project.id],
  );
  await enqueueAnalyze(project.id);
  return jsonOk({ queued: true });
});
