/**
 * ClipGenius AI background worker.
 * Consumes durable jobs from pg-boss:
 *   - project-analyze : full analysis pipeline → creates clips
 *   - clip-render     : renders one clip (and editor exports)
 * Jobs are serialized in-process (FFmpeg is CPU-bound) and retried with
 * backoff by pg-boss. Run with: npm run worker
 */
import path from 'node:path';
import { loadEnvFiles } from '../src/lib/loadEnv';
loadEnvFiles();

import { getBoss, ensureQueues, QUEUE_ANALYZE, QUEUE_RENDER, updateJobForClip, type AnalyzeJobData, type RenderJobData } from '../src/lib/queue';
import { query, queryOne } from '../src/lib/db';
import { processProject } from './pipeline';
import { renderClip, type AspectRatio, type TextOverlay } from '../src/lib/video/render';
import { DEFAULT_CAPTION_STYLE, type CaptionStyle } from '../src/lib/video/captions';
import type { SilenceRange } from '../src/lib/video/analyze';
import type { TranscriptSegment } from '../src/lib/video/transcribe';
import { storageLocalize, storagePut, ensureDir, scratchDir } from '../src/lib/storage';
import { getPlan } from '../src/lib/plans';
import { getFfmpegCapabilities } from '../src/lib/video/ffmpeg';

/** Simple FIFO mutex so FFmpeg jobs don't fight over the CPU. */
let chain: Promise<void> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

interface ClipRow {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  hook: string;
  start_time: number;
  end_time: number;
  transcript: { segments?: TranscriptSegment[] };
  style: Record<string, unknown>;
  overlays: TextOverlay[];
  source_path: string;
  analysis: { silences?: SilenceRange[] };
  plan: string;
}

export async function renderClipJob(clipId: string, isExport = false, exportId?: string): Promise<void> {
  const clip = await queryOne<ClipRow>(
    `SELECT c.id, c.project_id, c.user_id, c.title, c.hook, c.start_time, c.end_time,
            c.transcript, c.style, c.overlays,
            p.source_path, p.analysis, u.plan
     FROM clips c
     JOIN projects p ON p.id = c.project_id
     JOIN users u ON u.id = c.user_id
     WHERE c.id = $1`,
    [clipId],
  );
  if (!clip) throw new Error(`Clip ${clipId} not found`);
  if (!clip.source_path) throw new Error('Project source media is missing');

  const plan = getPlan(clip.plan);
  const style = { ...DEFAULT_CAPTION_STYLE, ...(clip.style ?? {}) } as CaptionStyle & {
    aspect?: AspectRatio;
    removeSilences?: boolean;
    removeFillers?: boolean;
    exportHeight?: number;
  };

  await query(`UPDATE clips SET status='rendering', error=NULL, updated_at=now() WHERE id=$1`, [clipId]);
  if (exportId) {
    await query(`UPDATE exports SET status='running', updated_at=now() WHERE id=$1`, [exportId]);
  }
  await updateJobForClip(clipId, { status: 'running', stage: 'Rendering', progress: 4 });

  try {
    const sourcePath = await storageLocalize(clip.source_path);
    const workDir = await ensureDir(path.join(scratchDir, 'renders', clipId));
    const outPath = path.join(workDir, 'clip.mp4');
    const thumbPath = path.join(workDir, 'thumb.jpg');

    const exportHeight = Math.min(1920, Math.min(style.exportHeight ?? 1920, plan.exportMaxHeight));

    const result = await renderClip({
      sourcePath,
      outPath,
      thumbPath,
      clipStart: clip.start_time,
      clipEnd: clip.end_time,
      aspect: style.aspect ?? '9:16',
      exportHeight,
      style,
      overlays: Array.isArray(clip.overlays) ? clip.overlays : [],
      segments: clip.transcript?.segments ?? [],
      silences: clip.analysis?.silences ?? [],
      removeSilences: style.removeSilences ?? true,
      removeFillers: style.removeFillers ?? false,
      watermark: plan.watermark,
      hookText: clip.hook || clip.title,
      onProgress: (pct, stage) => {
        updateJobForClip(clipId, { status: 'running', progress: Math.round(pct), stage }).catch(() => {});
      },
    });

    const videoKey = `users/${clip.user_id}/clips/${clipId}/clip.mp4`;
    const thumbKey = `users/${clip.user_id}/clips/${clipId}/thumb.jpg`;
    await storagePut(videoKey, outPath);
    await storagePut(thumbKey, thumbPath);

    await query(
      `UPDATE clips SET status='ready', video_path=$2, thumbnail_path=$3, width=$4, height=$5,
         size_bytes=$6, error=NULL, updated_at=now() WHERE id=$1`,
      [clipId, videoKey, thumbKey, result.width, result.height, result.sizeBytes],
    );
    if (exportId) {
      await query(
        `UPDATE exports SET status='completed', video_path=$2, size_bytes=$3, width=$4, height=$5, updated_at=now() WHERE id=$1`,
        [exportId, videoKey, result.sizeBytes, result.width, result.height],
      );
    }
    await query(
      `INSERT INTO usage_counters (user_id, month, renders) VALUES ($1, to_char(now(),'YYYY-MM'), 1)
       ON CONFLICT (user_id, month) DO UPDATE SET renders = usage_counters.renders + 1`,
      [clip.user_id],
    );
    await updateJobForClip(clipId, { status: 'completed', progress: 100, stage: 'Complete' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker] render ${clipId} failed:`, message);
    await query(`UPDATE clips SET status='failed', error=$2, updated_at=now() WHERE id=$1`, [
      clipId,
      message.slice(0, 2000),
    ]);
    if (exportId) {
      await query(`UPDATE exports SET status='failed', error=$2, updated_at=now() WHERE id=$1`, [
        exportId,
        message.slice(0, 2000),
      ]);
    }
    await updateJobForClip(clipId, { status: 'failed', error: message.slice(0, 2000) });
    throw err;
  }
}

async function main(): Promise<void> {
  const caps = await getFfmpegCapabilities();
  console.log('[worker] ClipGenius worker starting');
  console.log(`[worker] ${caps.version}`);
  console.log(`[worker] captions: ${caps.hasAss ? 'libass' : caps.hasDrawtext ? 'drawtext' : 'unavailable'}`);

  const boss = await getBoss();
  await ensureQueues();

  await boss.work(
    QUEUE_ANALYZE,
    { batchSize: 1, pollingIntervalSeconds: 2 },
    async (jobs: Array<{ data: AnalyzeJobData }>) => {
      for (const job of jobs) {
        const data = job.data as AnalyzeJobData;
        console.log(`[worker] analyze ${data.projectId}`);
        try {
          await serialize(() => processProject(data.projectId));
        } catch (err) {
          console.error(`[worker] analyze ${data.projectId} failed:`, err);
          throw err;
        }
      }
    },
  );

  await boss.work(
    QUEUE_RENDER,
    { batchSize: 1, pollingIntervalSeconds: 2 },
    async (jobs: Array<{ data: RenderJobData }>) => {
      for (const job of jobs) {
        const data = job.data as RenderJobData;
        console.log(`[worker] render ${data.clipId}${data.isExport ? ' (export)' : ''}`);
        try {
          await serialize(() => renderClipJob(data.clipId, data.isExport, data.exportId));
        } catch (err) {
          console.error(`[worker] render ${data.clipId} failed:`, err);
          throw err;
        }
      }
    },
  );

  console.log('[worker] listening for jobs...');

  const shutdown = async () => {
    console.log('[worker] shutting down');
    await boss.stop({ graceful: true, timeout: 30_000 });
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
