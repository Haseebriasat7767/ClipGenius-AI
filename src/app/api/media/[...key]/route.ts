/**
 * Authenticated media streaming with HTTP Range support (required for
 * seeking in <video> elements). Enforces per-user data isolation.
 */
import { requireUser } from '@/lib/auth';
import { apiHandler, ApiError } from '@/lib/api';
import { storageGetStream, storageStat } from '@/lib/storage';
import type { Readable } from 'node:stream';

const CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.m4v': 'video/x-m4v',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export const GET = apiHandler('media/serve', async (req, ctx) => {
  const user = await requireUser(req);
  const rawKey = ctx.params.key as unknown as string | string[];
  const key = Array.isArray(rawKey) ? rawKey.join('/') : String(rawKey ?? '');
  if (!key) throw new ApiError(404, 'Not found', 'not_found');

  // Ownership: keys are namespaced users/{userId}/...
  const ownerMatch = /^users\/([^/]+)\//.exec(key);
  if (!ownerMatch) throw new ApiError(403, 'Forbidden', 'forbidden');
  if (ownerMatch[1] !== user.id && user.role !== 'admin') {
    throw new ApiError(403, 'Forbidden', 'forbidden');
  }

  const stat = await storageStat(key);
  if (!stat) throw new ApiError(404, 'File not found', 'not_found');

  const ext = key.slice(key.lastIndexOf('.')).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';

  const rangeHeader = req.headers.get('range');
  if (rangeHeader) {
    const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? Math.min(parseInt(m[2], 10), stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${stat.size}` },
        });
      }
      const stream = (await storageGetStream(key, { start, end })) as Readable;
      return new Response(stream as unknown as BodyInit, {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }
  }

  const stream = (await storageGetStream(key)) as Readable;
  return new Response(stream as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(stat.size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    },
  });
});
