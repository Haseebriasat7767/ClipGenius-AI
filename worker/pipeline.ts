/**
 * Project processing pipeline — runs inside the background worker.
 *  1. Validate + probe the source media
 *  2. Measure it (energy curve, silences, scene cuts)
 *  3. Transcribe speech (Gemini when configured)
 *  4. Select highlights and generate metadata
 *  5. Create clip records and enqueue renders
 */
import path from 'node:path';
import { query, queryOne } from '../src/lib/db';
import { storageLocalize, ensureDir, scratchDir } from '../src/lib/storage';
import { probeVideo } from '../src/lib/video/probe';
import { analyzeMedia, type AnalysisResult } from '../src/lib/video/analyze';
import { transcribeMedia, type Transcript } from '../src/lib/video/transcribe';
import { selectHighlights, type ClipCandidate } from '../src/lib/video/highlights';
import { generateMetadata } from '../src/lib/ai/metadata';
import { updateJobForProject, enqueueRender } from '../src/lib/queue';
import { getPlan, assertDurationAllowed, type PlanLimits } from '../src/lib/plans';
import { ApiError } from '../src/lib/errors';
import { DEFAULT_CAPTION_STYLE } from '../src/lib/video/captions';
import type { AspectRatio } from '../src/lib/video/render';

export interface ProjectSettings {
  clipLengthSec: number;
  clipCount: number;
  aspect: AspectRatio;
  removeSilences: boolean;
  removeFillers: boolean;
  captionStyle?: Partial<typeof DEFAULT_CAPTION_STYLE>;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  clipLengthSec: 30,
  clipCount: 8,
  aspect: '9:16',
  removeSilences: true,
  removeFillers: false,
};

interface ProjectRow {
  id: string;
  user_id: string;
  title: string;
  source_path: string | null;
  settings: ProjectSettings & Record<string, unknown>;
  plan?: string;
}

export async function processProject(projectId: string): Promise<void> {
  const project = await queryOne<ProjectRow>(
    `SELECT p.id, p.user_id, p.title, p.source_path, p.settings, u.plan
     FROM projects p JOIN users u ON u.id = p.user_id WHERE p.id = $1`,
    [projectId],
  );
  if (!project) throw new Error(`Project ${projectId} not found`);
  if (!project.source_path) throw new Error('Project has no source media');

  const plan: PlanLimits = getPlan(project.plan ?? 'free');
  const settings: ProjectSettings = { ...DEFAULT_SETTINGS, ...(project.settings ?? {}) };

  const setProgress = async (progress: number, stage: string) => {
    await query(
      `UPDATE projects SET progress = $2, stage = $3, updated_at = now() WHERE id = $1`,
      [projectId, Math.round(progress), stage],
    );
    await updateJobForProject(projectId, { status: 'running', progress: Math.round(progress), stage });
  };

  try {
    await query(`UPDATE projects SET status='processing', error=NULL, updated_at=now() WHERE id=$1`, [projectId]);
    await setProgress(2, 'Preparing media');

    const sourcePath = await storageLocalize(project.source_path);
    const workDir = await ensureDir(path.join(scratchDir, 'projects', projectId));

    // 1 — probe
    const probe = await probeVideo(sourcePath);
    assertDurationAllowed(plan, probe.duration);
    await query(
      `UPDATE projects SET duration_seconds=$2, width=$3, height=$4, fps=$5,
         video_codec=$6, audio_codec=$7, size_bytes=COALESCE($8, size_bytes), updated_at=now()
       WHERE id=$1`,
      [projectId, probe.duration, probe.width, probe.height, probe.fps, probe.videoCodec, probe.audioCodec, probe.sizeBytes || null],
    );
    await setProgress(6, 'Probing complete');

    // 2 — measure
    const analysis: AnalysisResult = await analyzeMedia(sourcePath, async (stage, p) => {
      await setProgress(6 + p * 0.34, stage);
    });

    // 3 — transcribe
    await setProgress(42, 'Transcribing speech');
    const { transcript, warnings } = await transcribeMedia(sourcePath, probe.duration, workDir, probe.hasAudio);

    // 4 — select highlights
    await setProgress(58, 'Finding the best moments');
    const candidates = selectHighlights({
      transcript,
      analysis,
      duration: probe.duration,
      clipLengthSec: Math.min(settings.clipLengthSec, Math.max(5, probe.duration)),
      clipCount: settings.clipCount,
    });
    if (candidates.length === 0) {
      throw new ApiError(422, 'No usable segments were found in this video.', 'analysis');
    }

    // Persist analysis (trimmed energy curve to keep the row light)
    await query(`UPDATE projects SET analysis = $2, updated_at = now() WHERE id = $1`, [
      projectId,
      JSON.stringify({
        silences: analysis.silences.slice(0, 500),
        sceneCuts: analysis.sceneCuts.slice(0, 500),
        meanDb: analysis.meanDb,
        peakDb: analysis.peakDb,
        hasSpeech: analysis.hasSpeech,
        transcriptProvider: transcript.provider,
        transcriptLanguage: transcript.language,
        transcript: transcript.segments.slice(0, 2000),
        warnings,
      }),
    ]);

    // 5 — create clips
    await setProgress(66, 'Generating clip metadata');
    const createdClips: Array<{ id: string; start: number; end: number }> = [];
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const meta = await generateMetadata(candidate, i, transcript);
      const segs = transcript.segments.filter(
        (s) => s.start < candidate.end && s.end > candidate.start,
      );
      const row = await queryOne<{ id: string }>(
        `INSERT INTO clips (
           project_id, user_id, title, hook, description, hashtags,
           start_time, end_time, duration_seconds, score, rank,
           transcript, status, style, overlays, metadata_provider
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending',$13,'[]'::jsonb,$14)
         RETURNING id`,
        [
          projectId,
          project.user_id,
          meta.title || `Clip ${i + 1}`,
          meta.hook,
          meta.description,
          JSON.stringify(meta.hashtags),
          candidate.start,
          candidate.end,
          candidate.duration,
          candidate.score,
          i + 1,
          JSON.stringify({ provider: transcript.provider, language: transcript.language, segments: segs }),
          JSON.stringify({
            aspect: settings.aspect,
            removeSilences: settings.removeSilences,
            removeFillers: settings.removeFillers,
            ...DEFAULT_CAPTION_STYLE,
            ...(settings.captionStyle ?? {}),
          }),
          meta.provider,
        ],
      );
      if (row) createdClips.push({ id: row.id, start: candidate.start, end: candidate.end });
    }

    await query(
      `UPDATE projects SET clips_count = $2, updated_at = now() WHERE id = $1`,
      [projectId, createdClips.length],
    );

    // usage accounting
    await query(
      `INSERT INTO usage_counters (user_id, month, clips_generated, minutes_processed)
       VALUES ($1, to_char(now(), 'YYYY-MM'), $2, $3)
       ON CONFLICT (user_id, month) DO UPDATE SET
         clips_generated = usage_counters.clips_generated + $2,
         minutes_processed = usage_counters.minutes_processed + $3`,
      [project.user_id, createdClips.length, probe.duration / 60],
    );

    // 6 — enqueue renders
    await setProgress(72, `Rendering ${createdClips.length} clips`);
    for (const clip of createdClips) {
      await enqueueRender(clip.id);
    }

    await query(
      `UPDATE projects SET status='completed', progress=100, stage='Complete', updated_at=now() WHERE id=$1`,
      [projectId],
    );
    await updateJobForProject(projectId, { status: 'completed', progress: 100, stage: 'Complete' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline] project ${projectId} failed:`, message);
    await query(`UPDATE projects SET status='failed', error=$2, updated_at=now() WHERE id=$1`, [
      projectId,
      message.slice(0, 2000),
    ]);
    await updateJobForProject(projectId, { status: 'failed', error: message.slice(0, 2000) });
    throw err;
  }
}
