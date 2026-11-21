/**
 * Clip renderer — turns a selected segment of the source video into an
 * optimized vertical clip:
 *   • face-tracked smart crop to 9:16 (or chosen aspect)
 *   • silence removal (jump-cut compression) and optional filler-word removal
 *   • animated burned-in subtitles (ASS via libass, drawtext fallback)
 *   • text overlays and optional plan watermark
 *   • thumbnail generation
 * Every step measures/renders real media with FFmpeg.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { runFfmpeg, getFfmpegCapabilities, FfmpegError } from './ffmpeg';
import { probeVideo } from './probe';
import { detectFaces, buildCropTrack, cropXExpression, type FaceSample } from './faces';
import type { SilenceRange } from './analyze';
import type { TranscriptSegment } from './transcribe';
import { isFiller } from './transcribe';
import {
  buildAss,
  drawtextLines,
  resolveFontFile,
  type CaptionStyle,
} from './captions';

export type AspectRatio = '9:16' | '4:5' | '1:1' | '16:9';

export interface TextOverlay {
  id: string;
  text: string;
  start: number; // clip-relative seconds
  end: number;
  position: 'top' | 'middle' | 'bottom';
  color: string;
  size: number;
}

export interface RenderClipOptions {
  sourcePath: string;
  outPath: string;
  thumbPath: string;
  clipStart: number;
  clipEnd: number;
  aspect: AspectRatio;
  exportHeight: number;
  style: CaptionStyle;
  overlays: TextOverlay[];
  /** Transcript segments on the source timeline intersecting the clip. */
  segments: TranscriptSegment[];
  /** Silence ranges on the source timeline. */
  silences: SilenceRange[];
  removeSilences: boolean;
  removeFillers: boolean;
  watermark: boolean;
  hookText?: string;
  onProgress?: (pct: number, stage: string) => void;
}

export interface RenderResult {
  width: number;
  height: number;
  duration: number;
  sizeBytes: number;
  usedFaces: boolean;
  removedSilenceSeconds: number;
  captionMode: 'ass' | 'drawtext' | 'none';
}

const ASPECT_VALUE: Record<AspectRatio, number> = {
  '9:16': 9 / 16,
  '4:5': 4 / 5,
  '1:1': 1,
  '16:9': 16 / 9,
};

export function outputSize(aspect: AspectRatio, exportHeight: number): { width: number; height: number } {
  const ar = ASPECT_VALUE[aspect];
  let height = exportHeight % 2 === 0 ? exportHeight : exportHeight - 1;
  let width = Math.round(height * ar);
  if (width > 1920) {
    width = 1920 - (1920 % 2);
    height = Math.round(width / ar);
  }
  width -= width % 2;
  height -= height % 2;
  return { width, height };
}

function mergeRanges(ranges: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  const sorted = [...ranges].filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
  const out: Array<{ start: number; end: number }> = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + 0.01) {
      last.end = Math.max(last.end, r.end);
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\u2019")
    .replace(/%/g, '\\%')
    .replace(/[\[\]]/g, '');
}

function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/** Piecewise-linear mapping from source timeline to condensed (cut) timeline. */
function buildTimeMapper(
  clipStart: number,
  keepRanges: Array<{ start: number; end: number }>,
): (t: number) => number {
  return (t: number) => {
    if (t <= keepRanges[0].start) return 0;
    let acc = 0;
    for (const r of keepRanges) {
      if (t >= r.end) {
        acc += r.end - r.start;
      } else if (t >= r.start) {
        return acc + (t - r.start);
      } else {
        return acc;
      }
    }
    return acc;
  };
}

export async function renderClip(opts: RenderClipOptions): Promise<RenderResult> {
  const {
    sourcePath,
    outPath,
    thumbPath,
    clipStart,
    clipEnd,
    aspect,
    exportHeight,
    style,
    overlays,
    segments,
    silences,
    removeSilences,
    removeFillers,
    watermark,
    onProgress,
  } = opts;

  const start = Math.max(0, clipStart);
  const end = Math.max(start + 0.5, clipEnd);
  const clipDuration = end - start;

  await fsp.mkdir(path.dirname(outPath), { recursive: true });
  await fsp.mkdir(path.dirname(thumbPath), { recursive: true });

  const caps = await getFfmpegCapabilities();
  const probe = await probeVideo(sourcePath);
  const { width: outW, height: outH } = outputSize(aspect, exportHeight);

  // ---------------------------------------------------------------- cuts plan
  const removals: Array<{ start: number; end: number }> = [];
  let removedSilenceSeconds = 0;

  if (removeSilences) {
    for (const s of silences) {
      const a = Math.max(s.start, start + 0.35);
      const b = Math.min(s.end, end - 0.35);
      if (b - a >= 0.75) {
        removals.push({ start: a, end: b });
        removedSilenceSeconds += b - a;
      }
    }
  }
  if (removeFillers) {
    for (const seg of segments) {
      for (const w of seg.words ?? []) {
        if (isFiller(w.w)) {
          removals.push({ start: Math.max(start, w.start - 0.06), end: Math.min(end, w.end + 0.06) });
        }
      }
    }
  }

  let mergedRemovals = mergeRanges(removals);
  const removedTotal = mergedRemovals.reduce((a, r) => a + (r.end - r.start), 0);
  // Never condense a clip into mush: if cuts would remove >55%, only cut long gaps.
  if (removedTotal > clipDuration * 0.55) {
    mergedRemovals = mergeRanges(
      removals.filter((r) => r.end - r.start >= 1.5),
    );
  }

  const keepRanges: Array<{ start: number; end: number }> = [];
  {
    let cursor = start;
    for (const r of mergedRemovals) {
      if (r.start > cursor) keepRanges.push({ start: cursor, end: r.start });
      cursor = Math.max(cursor, r.end);
    }
    if (cursor < end) keepRanges.push({ start: cursor, end: end });
    // drop slivers
    const cleaned = keepRanges.filter((r) => r.end - r.start >= 0.18);
    if (cleaned.length === 0) cleaned.push({ start, end });
    keepRanges.length = 0;
    keepRanges.push(...cleaned);
  }

  const condensedDuration = keepRanges.reduce((a, r) => a + (r.end - r.start), 0);
  const mapTime = buildTimeMapper(start, keepRanges);

  // -------------------------------------------------------------- face crop
  onProgress?.(2, 'Tracking faces');
  let faceSamples: FaceSample[] = [];
  try {
    faceSamples = await detectFaces(sourcePath, { start, end, intervalSec: 1 });
  } catch {
    faceSamples = [];
  }
  const cropTrack = buildCropTrack(faceSamples, {
    start,
    end,
    srcWidth: probe.width,
    srcHeight: probe.height,
    targetAspect: ASPECT_VALUE[aspect],
  });
  // Retarget crop keyframes to the condensed timeline.
  const condensedTrack = {
    usedFaces: cropTrack.usedFaces,
    samples: cropTrack.samples
      .map((p) => ({ t: mapTime(start + p.t), x: p.x }))
      .filter((p) => p.t <= condensedDuration + 0.01),
  };

  // ------------------------------------------------------------- filtergraph
  onProgress?.(5, 'Building render graph');
  const graph: string[] = [];
  const hasRealAudio = probe.hasAudio;

  keepRanges.forEach((r, i) => {
    const a = (r.start - start).toFixed(3);
    const b = (r.end - start).toFixed(3);
    graph.push(`[0:v]trim=start=${a}:end=${b},setpts=PTS-STARTPTS,setsar=1[v${i}]`);
    if (hasRealAudio) {
      graph.push(`[0:a]atrim=start=${a}:end=${b},asetpts=PTS-STARTPTS[a${i}]`);
    } else {
      graph.push(`[1:a]atrim=start=${a}:end=${b},asetpts=PTS-STARTPTS[a${i}]`);
    }
  });

  const concatInputs = keepRanges.map((_, i) => `[v${i}][a${i}]`).join('');
  graph.push(`${concatInputs}concat=n=${keepRanges.length}:v=1:a=1[vc][ac]`);

  const srcAR = probe.width / probe.height;
  const targetAR = ASPECT_VALUE[aspect];
  const chain: string[] = ['fps=30'];
  if (srcAR > targetAR + 0.01) {
    const cropW = `round(ih*${targetAR.toFixed(6)})`;
    chain.push(`crop=w=${cropW}:h=ih:x='max(0,min(iw-ow,${cropXExpression(condensedTrack)}))':y=0`);
  } else if (srcAR < targetAR - 0.01) {
    chain.push(`crop=w=iw:h=round(iw/${targetAR.toFixed(6)}):x=0:y=max(0,(ih-oh)/2)`);
  }
  chain.push(`scale=${outW}:${outH}:flags=lanczos`, 'setsar=1');

  // Captions
  const clipSegments: TranscriptSegment[] = segments
    .map((seg) => {
      const mapped: TranscriptSegment = {
        start: mapTime(seg.start),
        end: mapTime(seg.end),
        text: seg.text,
        words: seg.words?.map((w) => ({ ...w, start: mapTime(w.start), end: mapTime(w.end) })),
      };
      return mapped;
    })
    .filter((s) => s.end - s.start > 0.15 && s.start < condensedDuration);

  let captionMode: RenderResult['captionMode'] = 'none';
  if (clipSegments.length > 0) {
    if (caps.hasAss) {
      const assPath = path.join(path.dirname(outPath), 'captions.ass');
      const assDoc = buildAss({ segments: clipSegments }, style, outW, outH);
      await fsp.writeFile(assPath, assDoc, 'utf8');
      chain.push(`ass='${escapeFilterPath(assPath)}':fontsdir='${escapeFilterPath(path.resolve('./public/fonts'))}'`);
      captionMode = 'ass';
    } else if (caps.hasDrawtext) {
      const lines = drawtextLines({ segments: clipSegments }, style);
      const fontSize = Math.round(outH * 0.045 * (style.fontSize / 58));
      for (const line of lines) {
        const fontFile = resolveFontFile(style.fontFamily, style.bold);
        const yExpr =
          style.position === 'top'
            ? `h*0.12`
            : style.position === 'middle'
              ? `(h-text_h)/2`
              : `h*0.82-text_h`;
        const box = style.backgroundBox
          ? `:box=1:boxcolor=black@0.45:boxborderw=${Math.round(fontSize * 0.3)}`
          : '';
        chain.push(
          `drawtext=fontfile='${escapeFilterPath(fontFile)}':text='${escapeDrawtext(line.text)}':fontsize=${fontSize}:fontcolor=${style.primaryColor}:borderw=${Math.round(fontSize * 0.08)}:bordercolor=${style.outlineColor}:x=(w-text_w)/2:y=${yExpr}${box}:enable='between(t,${line.start.toFixed(2)},${line.end.toFixed(2)})'`,
        );
      }
      captionMode = 'drawtext';
    }
  }

  // Text overlays
  for (const ov of overlays) {
    if (!ov.text.trim()) continue;
    const fontSize = Math.round(outH * 0.05 * (ov.size / 100));
    const yExpr =
      ov.position === 'top' ? `h*0.08` : ov.position === 'middle' ? `(h-text_h)/2` : `h*0.88-text_h`;
    chain.push(
      `drawtext=fontfile='${escapeFilterPath(resolveFontFile(style.fontFamily, true))}':text='${escapeDrawtext(ov.text)}':fontsize=${fontSize}:fontcolor=${ov.color}:borderw=${Math.round(fontSize * 0.07)}:bordercolor=black:x=(w-text_w)/2:y=${yExpr}:enable='between(t,${Math.max(0, ov.start).toFixed(2)},${Math.max(0.1, ov.end).toFixed(2)})'`,
    );
  }

  // Plan watermark
  if (watermark) {
    const fontSize = Math.round(outH * 0.028);
    chain.push(
      `drawtext=fontfile='${escapeFilterPath(resolveFontFile('Inter', true))}':text='ClipGenius AI':fontsize=${fontSize}:fontcolor=white@0.55:box=1:boxcolor=black@0.25:boxborderw=${Math.round(fontSize * 0.3)}:x=w-tw-${Math.round(outW * 0.035)}:y=h-th-${Math.round(outH * 0.02)}`,
    );
  }

  chain.push('format=yuv420p');
  graph.push(`[vc]${chain.join(',')}[vout]`);
  graph.push(
    hasRealAudio
      ? `[ac]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[aout]`
      : `[ac]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[aout]`,
  );

  const args = [
    '-hide_banner',
    '-y',
    '-ss', start.toFixed(3),
    ...(hasRealAudio ? [] : ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000']),
    '-i', sourcePath,
    '-filter_complex', graph.join(';'),
    '-map', '[vout]',
    '-map', '[aout]',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-maxrate', '6M',
    '-bufsize', '10M',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-ar', '48000',
    '-t', condensedDuration.toFixed(3),
    '-movflags', '+faststart',
    '-progress', 'pipe:1',
    '-nostats',
    outPath,
  ];

  // Input order: when there is no real audio, the anullsrc lavfi input is index 0
  // and the video file is index 1 — the graph references must match.
  if (!hasRealAudio) {
    for (let i = 0; i < graph.length; i++) {
      graph[i] = graph[i].replace(/\[0:v\]/g, '[1:v]').replace(/\[1:a\]/g, '[0:a]');
    }
    const fixed = args.indexOf('-filter_complex') + 1;
    args[fixed] = graph.join(';');
  }

  onProgress?.(8, 'Rendering clip');
  try {
    await runFfmpeg(args, {
      timeoutMs: 30 * 60_000,
      onProgress: (t) => {
        const pct = 8 + Math.min(1, t / Math.max(0.1, condensedDuration)) * 82;
        onProgress?.(Math.round(pct), 'Rendering clip');
      },
    });
  } catch (err) {
    if (err instanceof FfmpegError) {
      throw new Error(`Render failed: ${err.message}\n${err.stderr.slice(-800)}`);
    }
    throw err;
  }

  // -------------------------------------------------------------- thumbnail
  onProgress?.(92, 'Generating thumbnail');
  await renderThumbnail({
    sourcePath,
    thumbPath,
    atTime: Math.min(end - 0.2, start + Math.min(2, clipDuration * 0.15)),
    srcWidth: probe.width,
    srcHeight: probe.height,
    aspect,
    track: condensedTrack,
    hookText: opts.hookText,
  });

  const outProbe = await probeVideo(outPath);
  return {
    width: outProbe.width,
    height: outProbe.height,
    duration: outProbe.duration,
    sizeBytes: outProbe.sizeBytes,
    usedFaces: cropTrack.usedFaces,
    removedSilenceSeconds: Math.round(mergedRemovals.reduce((a, r) => a + (r.end - r.start), 0) * 10) / 10,
    captionMode,
  };
}

async function renderThumbnail(opts: {
  sourcePath: string;
  thumbPath: string;
  atTime: number;
  srcWidth: number;
  srcHeight: number;
  aspect: AspectRatio;
  track: { usedFaces: boolean; samples: Array<{ t: number; x: number }> };
  hookText?: string;
}): Promise<void> {
  const { width: tW, height: tH } = outputSize(opts.aspect, 854);
  const srcAR = opts.srcWidth / opts.srcHeight;
  const targetAR = ASPECT_VALUE[opts.aspect];

  const vf: string[] = [];
  if (srcAR > targetAR + 0.01) {
    const cropW = Math.round(opts.srcHeight * targetAR);
    const maxOffset = Math.max(0, opts.srcWidth - cropW);
    const nearest = opts.track.samples.reduce(
      (best, p) => (Math.abs(p.t - 0) < Math.abs(best.t - 0) ? p : best),
      opts.track.samples[0] ?? { t: 0, x: maxOffset / 2 },
    );
    const x = Math.max(0, Math.min(maxOffset, Math.round(nearest?.x ?? maxOffset / 2)));
    vf.push(`crop=${cropW}:${opts.srcHeight}:${x}:0`);
  } else if (srcAR < targetAR - 0.01) {
    const cropH = Math.round(opts.srcWidth / targetAR);
    vf.push(`crop=${opts.srcWidth}:${cropH}:0:${Math.max(0, Math.round((opts.srcHeight - cropH) / 2))}`);
  }
  vf.push(`scale=${tW}:${tH}:flags=lanczos`);
  if (opts.hookText?.trim()) {
    const text = opts.hookText.trim().slice(0, 80);
    const fontSize = Math.round(tH * 0.05);
    vf.push(
      `drawtext=fontfile='${escapeFilterPath(resolveFontFile('Inter', true))}':text='${escapeDrawtext(text)}':fontsize=${fontSize}:fontcolor=white:borderw=${Math.round(fontSize * 0.09)}:bordercolor=black:box=1:boxcolor=black@0.35:boxborderw=${Math.round(fontSize * 0.3)}:x=(w-text_w)/2:y=h*0.10`,
    );
  }

  await runFfmpeg([
    '-hide_banner',
    '-y',
    '-ss', Math.max(0, opts.atTime).toFixed(3),
    '-i', opts.sourcePath,
    '-frames:v', '1',
    '-vf', vf.join(','),
    '-q:v', '3',
    opts.thumbPath,
  ], { timeoutMs: 120_000 });
}

export { fs as renderFs };
