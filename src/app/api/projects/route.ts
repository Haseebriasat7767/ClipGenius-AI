import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { apiHandler, jsonOk, parseBody, ApiError } from '@/lib/api';
import { checkRateLimit } from '@/lib/rate-limit';
import { query, queryOne, currentMonth } from '@/lib/db';
import {
  getPlan,
  assertProjectQuota,
  assertClipQuota,
  type UsageSnapshot,
} from '@/lib/plans';
import { enqueueAnalyze } from '@/lib/queue';
import { checkVideoUrl } from '@/lib/download';
import { storageStat } from '@/lib/storage';

const settingsSchema = z.object({
  clipLengthSec: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)]).default(30),
  clipCount: z.number().int().min(5).max(20).default(8),
  aspect: z.enum(['9:16', '4:5', '1:1', '16:9']).default('9:16'),
  removeSilences: z.boolean().default(true),
  removeFillers: z.boolean().default(false),
});

const createSchema = z
  .object({
    title: z.string().min(1).max(180),
    uploadKey: z.string().min(1).max(400).optional(),
    url: z.string().url().max(2000).optional(),
    settings: settingsSchema.default({}),
  })
  .refine((v) => !!v.uploadKey || !!v.url, { message: 'Provide either uploadKey or url' });

async function loadUsage(userId: string): Promise<UsageSnapshot> {
  const u = await queryOne<{
    clips_generated: number;
    minutes_processed: number;
    renders: number;
    storage_bytes: number;
  }>(
    `SELECT clips_generated, minutes_processed, renders, storage_bytes
     FROM usage_counters WHERE user_id = $1 AND month = $2`,
    [userId, currentMonth()],
  );
  const p = await queryOne<{ count: string }>(
    `SELECT count(*)::text AS count FROM projects WHERE user_id = $1 AND created_at >= date_trunc('month', now())`,
    [userId],
  );
  return {
    clips_generated: u?.clips_generated ?? 0,
    minutes_processed: Number(u?.minutes_processed ?? 0),
    renders: u?.renders ?? 0,
    storage_bytes: Number(u?.storage_bytes ?? 0),
    projects_this_month: parseInt(p?.count ?? '0', 10),
  };
}

export const GET = apiHandler('projects/list', async (req: NextRequest) => {
  const user = await requireUser(req);
  const rows = await query(
    `SELECT id, title, status, source_type, source_url, source_filename, size_bytes,
            duration_seconds, width, height, clips_count, error, settings, stage, progress,
            created_at, updated_at
     FROM projects WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [user.id],
  );
  return jsonOk({ projects: rows });
});

export const POST = apiHandler('projects/create', async (req: NextRequest) => {
  checkRateLimit(req, 30);
  const user = await requireUser(req);
  const body = await parseBody(req, createSchema);
  const plan = getPlan(user.plan);
  const usage = await loadUsage(user.id);
  assertProjectQuota(plan, usage);
  // The requested clip count must fit the monthly clip budget.
  assertClipQuota(plan, usage, body.settings.clipCount);

  let sourcePath: string | null = null;
  let sourceUrl: string | null = null;
  let sourceFilename: string | null = null;
  let sizeBytes: number | null = null;
  let sourceType: 'upload' | 'url';

  if (body.uploadKey) {
    if (!body.uploadKey.startsWith(`users/${user.id}/uploads/`)) {
      throw new ApiError(403, 'This upload does not belong to you', 'forbidden');
    }
    const stat = await storageStat(body.uploadKey);
    if (!stat) throw new ApiError(404, 'Uploaded file not found — please upload again', 'not_found');
    sourceType = 'upload';
    sourcePath = body.uploadKey;
    sourceFilename = body.uploadKey.split('/').pop() ?? null;
    sizeBytes = stat.size;
    if (sizeBytes) assertUploadWithinPlan(plan, sizeBytes);
  } else {
    // Validates URL policy + that it serves a real video file.
    const check = await checkVideoUrl(body.url!);
    sourceType = 'url';
    sourceUrl = check.url;
    sourceFilename = new URL(check.url).pathname.split('/').pop() || 'remote-video';
    sizeBytes = check.sizeBytes;
    if (sizeBytes) assertUploadWithinPlan(plan, sizeBytes);
  }

  const project = await queryOne<{ id: string }>(
    `INSERT INTO projects (user_id, title, status, source_type, source_url, source_path,
       source_filename, size_bytes, settings)
     VALUES ($1, $2, 'queued', $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      user.id,
      body.title.trim(),
      sourceType,
      sourceUrl,
      sourcePath,
      sourceFilename,
      sizeBytes,
      JSON.stringify(body.settings),
    ],
  );
  if (!project) throw new ApiError(500, 'Failed to create project');

  await enqueueAnalyze(project.id);
  const created = await queryOne(
    `SELECT id, title, status, source_type, source_url, settings, created_at FROM projects WHERE id = $1`,
    [project.id],
  );
  return jsonOk({ project: created }, { status: 201 });
});

function assertUploadWithinPlan(plan: ReturnType<typeof getPlan>, sizeBytes: number): void {
  const maxBytes = plan.maxUploadMb * 1024 * 1024;
  if (sizeBytes > maxBytes) {
    throw new ApiError(
      413,
      `File is ${(sizeBytes / 1024 / 1024).toFixed(0)} MB — the ${plan.name} plan allows up to ${plan.maxUploadMb} MB.`,
      'plan_limit',
    );
  }
}
