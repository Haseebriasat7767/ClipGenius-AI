import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { apiHandler, jsonOk, ApiError } from '@/lib/api';
import { query, queryOne } from '@/lib/db';
import { enqueueAnalyze, enqueueRender } from '@/lib/queue';

export const GET = apiHandler('admin/jobs', async (req: NextRequest) => {
  await requireAdmin(req);
  const status = req.nextUrl.searchParams.get('status') ?? '';
  const type = req.nextUrl.searchParams.get('type') ?? '';
  const limit = Math.min(200, parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10));

  const jobs = await query(
    `SELECT j.*, u.email AS user_email, p.title AS project_title
     FROM processing_jobs j
     LEFT JOIN users u ON u.id = j.user_id
     LEFT JOIN projects p ON p.id = j.project_id
     WHERE ($1 = '' OR j.status = $1) AND ($2 = '' OR j.type = $2)
     ORDER BY j.created_at DESC
     LIMIT $3`,
    [status, type, limit],
  );
  return jsonOk({ jobs });
});

export const POST = apiHandler('admin/jobs/action', async (req: NextRequest) => {
  await requireAdmin(req);
  const body = (await req.json()) as { jobId?: string; action?: 'retry' | 'cancel' };
  if (!body.jobId || !body.action) throw new ApiError(400, 'jobId and action are required', 'validation');

  const job = await queryOne<{ id: string; type: string; status: string; project_id: string | null; clip_id: string | null }>(
    'SELECT id, type, status, project_id, clip_id FROM processing_jobs WHERE id = $1',
    [body.jobId],
  );
  if (!job) throw new ApiError(404, 'Job not found', 'not_found');

  if (body.action === 'cancel') {
    await query(
      `UPDATE processing_jobs SET status='canceled', finished_at=now(), updated_at=now() WHERE id=$1`,
      [job.id],
    );
    return jsonOk({ canceled: true });
  }

  // retry
  if (job.type === 'analyze' && job.project_id) {
    await query(
      `UPDATE processing_jobs SET status='queued', progress=0, error=NULL, attempts=0, started_at=NULL, finished_at=NULL, updated_at=now() WHERE id=$1`,
      [job.id],
    );
    await query(`UPDATE projects SET status='queued', error=NULL, updated_at=now() WHERE id=$1`, [job.project_id]);
    await enqueueAnalyze(job.project_id);
  } else if (job.type === 'render' && job.clip_id) {
    await query(
      `UPDATE processing_jobs SET status='queued', progress=0, error=NULL, attempts=0, started_at=NULL, finished_at=NULL, updated_at=now() WHERE id=$1`,
      [job.id],
    );
    await query(`UPDATE clips SET status='pending', error=NULL, updated_at=now() WHERE id=$1`, [job.clip_id]);
    await enqueueRender(job.clip_id);
  } else {
    throw new ApiError(400, 'This job cannot be retried', 'validation');
  }
  return jsonOk({ retried: true });
});
