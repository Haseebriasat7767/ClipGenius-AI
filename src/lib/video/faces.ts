/**
 * Face detection for intelligent vertical cropping.
 * Runs a small Python/OpenCV (Haar cascade) helper over sampled frames and
 * returns face boxes per timestamp. The crop path then follows the speaker.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export interface FaceBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FaceSample {
  t: number;
  faces: FaceBox[];
}

const PYTHON = path.resolve('./.venv/bin/python3');
const SCRIPT = path.resolve('./scripts/face_detect.py');

function pythonAvailable(): boolean {
  return fs.existsSync(PYTHON) && fs.existsSync(SCRIPT);
}

export async function detectFaces(
  videoPath: string,
  opts: { start: number; end: number; intervalSec?: number },
): Promise<FaceSample[]> {
  if (!pythonAvailable()) return [];
  const interval = opts.intervalSec ?? 1;
  return new Promise((resolve) => {
    const child = spawn(
      PYTHON,
      [
        SCRIPT,
        '--video', videoPath,
        '--start', String(opts.start),
        '--end', String(opts.end),
        '--interval', String(interval),
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (err += d.toString()));
    child.on('error', () => resolve([]));
    child.on('close', () => {
      try {
        const parsed = JSON.parse(out) as FaceSample[];
        resolve(Array.isArray(parsed) ? parsed : []);
      } catch {
        console.warn('[faces] detection failed, falling back to center crop:', err.slice(-300));
        resolve([]);
      }
    });
  });
}

export interface CropTrack {
  /** Horizontal crop offset expression fragment for FFmpeg (in source px). */
  samples: Array<{ t: number; x: number }>;
  usedFaces: boolean;
}

/**
 * Build a smoothed horizontal crop track from face samples.
 * Falls back to a centered crop when no faces are found.
 */
export function buildCropTrack(
  samples: FaceSample[],
  opts: { start: number; end: number; srcWidth: number; srcHeight: number; targetAspect: number },
): CropTrack {
  const { srcWidth, srcHeight, targetAspect } = opts;
  const cropW = Math.min(srcWidth, Math.round(srcHeight * targetAspect));
  const maxOffset = Math.max(0, srcWidth - cropW);

  const raw: Array<{ t: number; x: number }> = [];
  for (const s of samples) {
    const relT = s.t - opts.start;
    if (relT < -0.01 || relT > opts.end - opts.start + 0.01) continue;
    const faces = [...s.faces].sort((a, b) => b.w * b.h - a.w * a.h);
    const face = faces[0];
    if (face) {
      const center = face.x + face.w / 2;
      raw.push({ t: relT, x: clamp(center - cropW / 2, 0, maxOffset) });
    }
  }
  if (raw.length === 0) {
    return {
      samples: [
        { t: 0, x: maxOffset / 2 },
        { t: Math.max(0.01, opts.end - opts.start), x: maxOffset / 2 },
      ],
      usedFaces: false,
    };
  }

  // Smooth with a moving average (window of 3) and enforce a max pan speed.
  const sorted = raw.sort((a, b) => a.t - b.t);
  const smoothed = sorted.map((p, i) => {
    const neighbors = sorted.slice(Math.max(0, i - 1), Math.min(sorted.length, i + 2));
    const avg = neighbors.reduce((a, b) => a + b.x, 0) / neighbors.length;
    return { t: p.t, x: avg };
  });
  const limited: Array<{ t: number; x: number }> = [];
  for (const p of smoothed) {
    const prev = limited[limited.length - 1];
    if (prev) {
      const dt = p.t - prev.t;
      const maxStep = Math.max(40, dt * 260); // px per second cap
      const dx = clamp(p.x - prev.x, -maxStep, maxStep);
      limited.push({ t: p.t, x: clamp(prev.x + dx, 0, maxOffset) });
    } else {
      limited.push(p);
    }
  }
  return { samples: limited, usedFaces: true };
}

/**
 * Render the crop track as a piecewise-linear FFmpeg expression for the
 * `x` parameter of the crop filter (t is clip-relative seconds).
 */
export function cropXExpression(track: CropTrack): string {
  const pts = track.samples;
  if (pts.length === 0) return '0';
  if (pts.length === 1) return String(Math.round(pts[0].x));
  let expr = String(Math.round(pts[pts.length - 1].x));
  for (let i = pts.length - 2; i >= 0; i--) {
    const a = pts[i];
    const b = pts[i + 1];
    const seg = `( ${Math.round(a.x)}+(${Math.round(b.x)}-${Math.round(a.x)})*(t-${a.t.toFixed(2)})/${Math.max(0.01, b.t - a.t).toFixed(2)} )`;
    expr = `if(lt(t,${b.t.toFixed(2)}),${seg},${expr})`;
  }
  return expr;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
