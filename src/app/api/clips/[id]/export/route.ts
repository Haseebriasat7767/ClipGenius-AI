import { requireUser } from '@/lib/auth';
import { apiHandler, jsonOk, ApiError } from '@/lib/api';
import { queryOne, query } from '@/lib/db';
import { enqueueRender } from '@/lib/queue';

/**
 * Export / re-render a clip with its current editor state
 * (trims, caption style, overlays). Renders run on the durable job queue.
 */
export const POST = apiHandler('clips/export', async (req, ctx) => {
  const user = await requireUser(req);
  const clip = await queryOne<{ id: string; user_id: string; status: string }>(
    `SELECT id, user_id, status FROM clips WHERE id = $1 ${user.role === 'admin' ? '' : 'AND user_id = $2'}`,
    user.role === 'admin' ? [ctx.params.id] : [ctx.params.id, user.id],
  );
  if (!clip) throw new ApiError(404, 'Clip not found', 'not_found');
  if (clip.status === 'rendering') {
    throw new ApiError(409, 'This clip is already rendering', 'conflict');
  }

  const exportRow = await queryOne<{ id: string }>(
    `INSERT INTO exports (clip_id, user_id, status, settings)
     VALUES ($1, $2, 'queued', '{}'::jsonb) RETURNING id`,
    [clip.id, user.id],
  );
  await query(`UPDATE clips SET status='pending', error=NULL, updated_at=now() WHERE id=$1`, [clip.id]);
  await enqueueRender(clip.id, { isExport: true, exportId: exportRow!.id });

  return jsonOk({ exportId: exportRow!.id, queued: true }, { status: 201 });
});
