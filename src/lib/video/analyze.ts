/**
 * Real media analysis — no simulation.
 *  - Silence/gap detection from decoded audio
 *  - Per-window RMS energy curve from decoded PCM
 *  - Scene-cut detection from decoded video frames
 * Everything here measures the actual file with FFmpeg.
 */
import { spawn } from 'node:child_process';
import { runFfmpeg, FFMPEG_PATH } from './ffmpeg';

export interface SilenceRange {
  start: number;
  end: number;
}

export interface EnergyPoint {
  t: number;
  rms: number; // dBFS
}

export interface AnalysisResult {
  silences: SilenceRange[];
  energy: EnergyPoint[];
  sceneCuts: number[];
  meanDb: number;
  peakDb: number;
  hasSpeech: boolean;
}

/** Detect silences using FFmpeg's silencedetect filter. */
export async function detectSilences(
  filePath: string,
  opts: { noiseDb?: number; minSilenceSec?: number } = {},
): Promise<SilenceRange[]> {
  const noiseDb = opts.noiseDb ?? -35;
  const minSilence = opts.minSilenceSec ?? 0.4;
  const { stderr } = await runFfmpeg([
    '-hide_banner',
    '-i', filePath,
    '-af', `silencedetect=noise=${noiseDb}dB:d=${minSilence}`,
    '-f', 'null',
    '-',
  ]);
  const silences: SilenceRange[] = [];
  let openStart: number | null = null;
  for (const line of stderr.split('\n')) {
    const sm = /silence_start: ([\d.]+)/.exec(line);
    if (sm) openStart = parseFloat(sm[1]);
    const em = /silence_end: ([\d.]+)/.exec(line);
    if (em && openStart !== null) {
      const end = parseFloat(em[1]);
      if (end - openStart >= minSilence) silences.push({ start: openStart, end });
      openStart = null;
    }
  }
  return silences;
}

/**
 * Compute an RMS energy curve by streaming decoded mono PCM (16 kHz s16le)
 * and measuring real sample power per window. Memory-safe for long files.
 */
export async function computeEnergyCurve(
  filePath: string,
  windowSec = 0.25,
): Promise<EnergyPoint[]> {
  return new Promise((resolve, reject) => {
    const sampleRate = 16000;
    const windowSamples = Math.round(sampleRate * windowSec);
    const points: EnergyPoint[] = [];
    let carry: Buffer = Buffer.alloc(0);
    let windowSumSq = 0;
    let windowCount = 0;
    let windowIndex = 0;

    const proc = spawn(
      FFMPEG_PATH,
      ['-hide_banner', '-i', filePath, '-vn', '-ac', '1', '-ar', String(sampleRate), '-f', 's16le', '-'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    proc.stdout.on('data', (chunk: Buffer) => {
      const buf = carry.length ? Buffer.concat([carry, chunk]) : chunk;
      const usable = buf.length - (buf.length % 2);
      for (let i = 0; i < usable; i += 2) {
        const sample = buf.readInt16LE(i) / 32768;
        windowSumSq += sample * sample;
        windowCount++;
        if (windowCount >= windowSamples) {
          const rms = Math.sqrt(windowSumSq / windowCount);
          points.push({
            t: windowIndex * windowSec,
            rms: 20 * Math.log10(Math.max(rms, 1e-8)),
          });
          windowIndex++;
          windowSumSq = 0;
          windowCount = 0;
        }
      }
      carry = buf.subarray(usable);
    });

    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code: number) => {
      if (code !== 0 && points.length === 0) {
        reject(new Error(`ffmpeg audio decode failed (code ${code}): ${stderr.slice(-500)}`));
        return;
      }
      if (windowCount > 0) {
        points.push({
          t: windowIndex * windowSec,
          rms: 20 * Math.log10(Math.max(Math.sqrt(windowSumSq / windowCount), 1e-8)),
        });
      }
      resolve(points);
    });
  });
}

/**
 * Detect scene cuts with FFmpeg's scene score filter on downscaled frames.
 * Returns cut timestamps in seconds.
 */
export async function detectSceneCuts(filePath: string, threshold = 0.3): Promise<number[]> {
  const { stderr } = await runFfmpeg([
    '-hide_banner',
    '-i', filePath,
    '-vf', `fps=4,scale=320:-2,select='gt(scene,${threshold})',showinfo`,
    '-an',
    '-f', 'null',
    '-',
  ]);
  const cuts: number[] = [];
  for (const line of stderr.split('\n')) {
    const m = /pts_time:([\d.]+)/.exec(line);
    if (m) cuts.push(parseFloat(m[1]));
  }
  return cuts.sort((a, b) => a - b);
}

/** Full analysis of a source video. */
export async function analyzeMedia(filePath: string, onStage?: (stage: string, progress: number) => void): Promise<AnalysisResult> {
  onStage?.('Measuring audio energy', 10);
  const energy = await computeEnergyCurve(filePath);

  onStage?.('Detecting silences', 35);
  const silences = await detectSilences(filePath);

  onStage?.('Detecting scene cuts', 55);
  const sceneCuts = await detectSceneCuts(filePath);

  const dbs = energy.map((e) => e.rms).filter((d) => Number.isFinite(d));
  const meanDb = dbs.length ? dbs.reduce((a, b) => a + b, 0) / dbs.length : -60;
  const peakDb = dbs.length ? Math.max(...dbs) : -60;
  // "Speech-like": at least a few windows clearly above a quiet-room floor.
  const hasSpeech = energy.filter((e) => e.rms > meanDb + 3 && e.rms > -45).length >= 4;

  return { silences, energy, sceneCuts, meanDb, peakDb, hasSpeech };
}
