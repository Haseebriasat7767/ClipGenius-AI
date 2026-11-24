import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { apiHandler, jsonOk } from '@/lib/api';
import { query } from '@/lib/db';

export const GET = apiHandler('clips/list', async (req: NextRequest) => {
  const user = await requireUser(req);
  const status = req.nextUrl.searchParams.get('status') ?? '';
  const clips = await query(
    `SELECT c.id, c.project_id, c.title, c.hook, c.description, c.hashtags, c.duration_seconds,
            c.score, c.rank, c.status, c.error, c.thumbnail_path, c.video_path,
            c.metadata_provider, c.created_at, p.title AS project_title
     FROM clips c JOIN projects p ON p.id = c.project_id
     WHERE c.user_id = $1 AND ($2 = '' OR c.status = $2)
     ORDER BY c.created_at DESC
     LIMIT 300`,
    [user.id, status],
  );
  return jsonOk({ clips });
});
