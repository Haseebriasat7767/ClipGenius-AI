import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { apiHandler, jsonOk, parseBody, ApiError } from '@/lib/api';
import { query, queryOne } from '@/lib/db';
import { storageRemove } from '@/lib/storage';

async function loadOwnedClip(userId: string, clipId: string, isAdmin = false) {
  const clip = await queryOne(
    `SELECT * FROM clips WHERE id = $1 ${isAdmin ? '' : 'AND user_id = $2'}`,
    isAdmin ? [clipId] : [clipId, userId],
  );
  if (!clip) throw new ApiError(404, 'Clip not found', 'not_found');
  return clip;
}

export const GET = apiHandler('clips/get', async (req, ctx) => {
  const user = await requireUser(req);
  const clip = await loadOwnedClip(user.id, ctx.params.id, user.role === 'admin');
  const project = await queryOne('SELECT id, title, duration_seconds, source_path FROM projects WHERE id = $1', [
    clip.project_id,
  ]);
  return jsonOk({ clip, project });
});

const patchSchema = z.object({
  title: z.string().max(180).optional(),
  hook: z.string().max(300).optional(),
  description: z.string().max(2000).optional(),
  hashtags: z.array(z.string().max(60)).max(10).optional(),
  start_time: z.number().min(0).optional(),
  end_time: z.number().min(0.5).optional(),
  style: z
    .object({
      aspect: z.enum(['9:16', '4:5', '1:1', '16:9']).optional(),
      fontFamily: z.string().max(60).optional(),
      fontSize: z.number().min(20).max(120).optional(),
      primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      highlightColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      outlineColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      position: z.enum(['top', 'middle', 'bottom']).optional(),
      uppercase: z.boolean().optional(),
      backgroundBox: z.boolean().optional(),
      animation: z.enum(['none', 'pop', 'fade', 'karaoke']).optional(),
      bold: z.boolean().optional(),
      removeSilences: z.boolean().optional(),
      removeFillers: z.boolean().optional(),
      exportHeight: z.number().min(720).max(1920).optional(),
    })
    .optional(),
  overlays: z
    .array(
      z.object({
        id: z.string(),
        text: z.string().max(200),
        start: z.number().min(0),
        end: z.number().min(0),
        position: z.enum(['top', 'middle', 'bottom']),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        size: z.number().min(40).max(200),
      }),
    )
    .max(10)
    .optional(),
  transcript_segments: z
    .array(
      z.object({
        start: z.number().min(0),
        end: z.number().min(0),
        text: z.string().max(500),
      }),
    )
    .max(500)
    .optional(),
});

export const PATCH = apiHandler('clips/update', async (req, ctx) => {
  const user = await requireUser(req);
  const clip = await loadOwnedClip(user.id, ctx.params.id, user.role === 'admin');
  const body = await parseBody(req, patchSchema);

  const sets: string[] = [];
  const params: unknown[] = [ctx.params.id];
  const push = (sql: string, val: unknown) => {
    params.push(val);
    sets.push(sql.replace('$X', `$${params.length}`));
  };

  if (body.title !== undefined) push('title = $X', body.title.trim());
  if (body.hook !== undefined) push('hook = $X', body.hook);
  if (body.description !== undefined) push('description = $X', body.description);
  if (body.hashtags !== undefined) push('hashtags = $X::jsonb', JSON.stringify(body.hashtags));
  if (body.overlays !== undefined) push('overlays = $X::jsonb', JSON.stringify(body.overlays));

  if (body.start_time !== undefined || body.end_time !== undefined) {
    const start = body.start_time ?? clip.start_time;
    const end = body.end_time ?? clip.end_time;
    if (end <= start) throw new ApiError(400, 'End time must be after start time', 'validation');
    if (end - start > 180) throw new ApiError(400, 'Clip cannot be longer than 3 minutes', 'validation');
    push('start_time = $X', start);
    push('end_time = $X', end);
    push('duration_seconds = $X', end - start);
  }

  if (body.style !== undefined) {
    push('style = style || $X::jsonb', JSON.stringify(body.style));
  }

  if (body.transcript_segments !== undefined) {
    const current = (clip.transcript ?? {}) as { segments?: unknown[]; provider?: string; language?: string | null };
    push(
      'transcript = $X::jsonb',
      JSON.stringify({
        ...current,
        segments: body.transcript_segments.map((s) => ({ start: s.start, end: s.end, text: s.text })),
      }),
    );
  }

  if (sets.length === 0) throw new ApiError(400, 'Nothing to update', 'validation');
  await query(`UPDATE clips SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, params);
  const updated = await queryOne('SELECT * FROM clips WHERE id = $1', [ctx.params.id]);
  return jsonOk({ clip: updated });
});

export const DELETE = apiHandler('clips/delete', async (req, ctx) => {
  const user = await requireUser(req);
  const clip = await loadOwnedClip(user.id, ctx.params.id, user.role === 'admin');
  if (clip.video_path) await storageRemove(clip.video_path).catch(() => {});
  if (clip.thumbnail_path) await storageRemove(clip.thumbnail_path).catch(() => {});
  await query('DELETE FROM clips WHERE id = $1', [ctx.params.id]);
  return jsonOk({ deleted: true });
});
