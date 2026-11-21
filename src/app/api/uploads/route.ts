/**
 * Streaming upload endpoint. The client sends the raw file body (so real
 * upload progress can be shown) with x-file-name metadata.
 */
import { NextRequest } from 'next/server';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { requireUser } from '@/lib/auth';
import { apiHandler, jsonOk, ApiError } from '@/lib/api';
import { checkRateLimit } from '@/lib/rate-limit';
import { assertUploadAllowed, getPlan, assertProjectQuota, type UsageSnapshot } from '@/lib/plans';
import { queryOne, currentMonth } from '@/lib/db';
import { storagePut, ensureDir, scratchDir } from '@/lib/storage';
import { shortId } from '@/lib/ids';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_EXT = new Set(['.mp4', '.mov', '.webm', '.m4v']);

function sniffVideo(head: Buffer): boolean {
  if (head.length < 12) return false;
  const isIsoBmff = head.slice(4, 8).toString('latin1') === 'ftyp';
  const isMkv = head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
  return isIsoBmff || isMkv;
}

export const POST = apiHandler('uploads/create', async (req: NextRequest) => {
  checkRateLimit(req, 20);
  const user = await requireUser(req);
  const plan = getPlan(user.plan);

  const fileNameRaw = decodeURIComponent(req.headers.get('x-file-name') ?? '');
  const fileName = fileNameRaw.replace(/[/\\]/g, '_').slice(0, 180);
  const ext = path.extname(fileName).toLowerCase() || '.mp4';
  if (!ALLOWED_EXT.has(ext)) {
    throw new ApiError(415, `Unsupported file type "${ext}" — use MP4, MOV or WEBM`, 'unsupported_type');
  }

  const declaredLength = parseInt(req.headers.get('content-length') ?? '0', 10) || 0;
  assertUploadAllowed(plan, Math.max(declaredLength, 1));

  // Plan project quota applies at upload time too.
  const usageRow = await queryOne<{ count: string }>(
    `SELECT count(*)::text AS count FROM projects WHERE user_id = $1 AND created_at >= date_trunc('month', now())`,
    [user.id],
  );
  const usage: UsageSnapshot = {
    clips_generated: 0,
    minutes_processed: 0,
    renders: 0,
    storage_bytes: 0,
    projects_this_month: parseInt(usageRow?.count ?? '0', 10),
  };
  assertProjectQuota(plan, usage);

  if (!req.body) throw new ApiError(400, 'Empty upload body', 'validation');

  const uploadId = shortId(12);
  const tmpDir = await ensureDir(path.join(scratchDir, 'uploads'));
  const tmpPath = path.join(tmpDir, `${uploadId}${ext}`);

  const maxBytes = plan.maxUploadMb * 1024 * 1024;
  const readable = Readable.fromWeb(req.body as never);
  const out = fs.createWriteStream(tmpPath);
  let size = 0;

  await new Promise<void>((resolve, reject) => {
    readable.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        readable.destroy();
        out.destroy();
        reject(new ApiError(413, `File exceeds the ${plan.maxUploadMb} MB limit for the ${plan.name} plan`, 'plan_limit'));
        return;
      }
    });
    readable.pipe(out);
    out.on('finish', () => resolve());
    out.on('error', reject);
    readable.on('error', reject);
  });

  if (size < 1024) {
    await fsp.rm(tmpPath, { force: true });
    throw new ApiError(400, 'File is too small to be a video', 'validation');
  }

  // Magic-byte validation
  const fd = await fsp.open(tmpPath, 'r');
  const head = Buffer.alloc(12);
  await fd.read(head, 0, 12, 0);
  await fd.close();
  if (!sniffVideo(head)) {
    await fsp.rm(tmpPath, { force: true });
    throw new ApiError(422, 'This file is not a valid MP4, MOV or WEBM video', 'invalid_file');
  }

  const key = `users/${user.id}/uploads/${uploadId}/source${ext}`;
  await storagePut(key, tmpPath);
  await fsp.rm(tmpPath, { force: true });

  return jsonOk({ uploadId, key, fileName, sizeBytes: size }, { status: 201 });
});
