import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { apiHandler, jsonOk, parseBody, ApiError } from '@/lib/api';
import { query, queryOne } from '@/lib/db';
import { storageRemove } from '@/lib/storage';
import { cancelJobsForProject } from '@/lib/queue';

async function loadOwnedProject(userId: string, projectId: string, isAdmin = false) {
  const project = await queryOne(
    `SELECT * FROM projects WHERE id = $1 ${isAdmin ? '' : 'AND user_id = $2'}`,
    isAdmin ? [projectId] : [projectId, userId],
  );
  if (!project) throw new ApiError(404, 'Project not found', 'not_found');
  return project;
}

export const GET = apiHandler('projects/get', async (req, ctx) => {
  const user = await requireUser(req);
  const project = await loadOwnedProject(user.id, ctx.params.id, user.role === 'admin');
  const clips = await query(
    `SELECT id, title, hook, description, hashtags, start_time, end_time, duration_seconds,
            score, rank, status, error, video_path, thumbnail_path, width, height, size_bytes,
            metadata_provider, created_at
     FROM clips WHERE project_id = $1 ORDER BY rank ASC`,
    [ctx.params.id],
  );
  const jobs = await query(
    `SELECT id, type, status, progress, stage, attempts, error, created_at, started_at, finished_at
     FROM processing_jobs WHERE project_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [ctx.params.id],
  );
  return jsonOk({ project, clips, jobs });
});

const patchSchema = z.object({
  title: z.string().min(1).max(180).optional(),
  settings: z
    .object({
      clipLengthSec: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)]),
      clipCount: z.number().int().min(5).max(20),
      aspect: z.enum(['9:16', '4:5', '1:1', '16:9']),
      removeSilences: z.boolean(),
      removeFillers: z.boolean(),
    })
    .partial()
    .optional(),
});

export const PATCH = apiHandler('projects/update', async (req, ctx) => {
  const user = await requireUser(req);
  await loadOwnedProject(user.id, ctx.params.id, user.role === 'admin');
  const body = await parseBody(req, patchSchema);

  if (body.title !== undefined) {
    await query('UPDATE projects SET title = $2, updated_at = now() WHERE id = $1', [
      ctx.params.id,
      body.title.trim(),
    ]);
  }
  if (body.settings !== undefined) {
    await query('UPDATE projects SET settings = settings || $2::jsonb, updated_at = now() WHERE id = $1', [
      ctx.params.id,
      JSON.stringify(body.settings),
    ]);
  }
  const project = await queryOne('SELECT * FROM projects WHERE id = $1', [ctx.params.id]);
  return jsonOk({ project });
});

export const DELETE = apiHandler('projects/delete', async (req, ctx) => {
  const user = await requireUser(req);
  const project = await loadOwnedProject(user.id, ctx.params.id, user.role === 'admin');

  // Best-effort storage cleanup
  const clipRows = await query<{ id: string; video_path: string | null; thumbnail_path: string | null }>(
    'SELECT id, video_path, thumbnail_path FROM clips WHERE project_id = $1',
    [ctx.params.id],
  );
  for (const c of clipRows) {
    for (const key of [c.video_path, c.thumbnail_path]) {
      if (key) await storageRemove(key).catch(() => {});
    }
    await storageRemove(`users/${project.user_id}/clips/${c.id}/clip.mp4`).catch(() => {});
    await storageRemove(`users/${project.user_id}/clips/${c.id}/thumb.jpg`).catch(() => {});
  }
  if (project.source_path) await storageRemove(project.source_path).catch(() => {});

  await cancelJobsForProject(ctx.params.id);
  await query('DELETE FROM projects WHERE id = $1', [ctx.params.id]);
  return jsonOk({ deleted: true });
});
