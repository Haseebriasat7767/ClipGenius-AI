import { requireUser } from '@/lib/auth';
import { apiHandler, ApiError } from '@/lib/api';
import { queryOne } from '@/lib/db';
import { storageGetStream, storageStat } from '@/lib/storage';
import { slugify } from '@/lib/utils';
import { Readable } from 'node:stream';

/** Download the rendered MP4 of a clip (attachment). */
export const GET = apiHandler('clips/download', async (req, ctx) => {
  const user = await requireUser(req);
  const clip = await queryOne<{
    id: string;
    user_id: string;
    title: string;
    video_path: string | null;
    status: string;
  }>(
    `SELECT id, user_id, title, video_path, status FROM clips WHERE id = $1 ${user.role === 'admin' ? '' : 'AND user_id = $2'}`,
    user.role === 'admin' ? [ctx.params.id] : [ctx.params.id, user.id],
  );
  if (!clip) throw new ApiError(404, 'Clip not found', 'not_found');
  if (!clip.video_path || clip.status !== 'ready') {
    throw new ApiError(409, 'This clip has not finished rendering yet', 'not_ready');
  }

  const stat = await storageStat(clip.video_path);
  if (!stat) throw new ApiError(404, 'Rendered file is missing from storage', 'not_found');

  const stream = (await storageGetStream(clip.video_path)) as unknown as ReadableStream;
  const filename = `${slugify(clip.title, `clip-${clip.id.slice(0, 8)}`)}.mp4`;

  return new Response(stream as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(stat.size),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, max-age=0',
    },
  });
});
