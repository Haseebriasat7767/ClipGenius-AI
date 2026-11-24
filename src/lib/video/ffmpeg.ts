/**
 * FFmpeg / ffprobe process helpers. Binaries come from @ffmpeg-installer and
 * @ffprobe-installer (bundled with npm — no external downloads at runtime).
 */
import { spawn } from 'node:child_process';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

export const FFMPEG_PATH: string = ffmpegInstaller.path;
export const FFPROBE_PATH: string = ffprobeInstaller.path;

export interface RunResult {
  stdout: string;
  stderr: string;
}

export class FfmpegError extends Error {
  stderr: string;
  constructor(message: string, stderr: string) {
    super(message);
    this.stderr = stderr;
  }
}

export interface RunFfmpegOptions {
  /** Called with output time in seconds when `-progress pipe:1` is used. */
  onProgress?: (outTimeSeconds: number) => void;
  /** Hard kill after N ms. */
  timeoutMs?: number;
}

export function runFfmpeg(args: string[], opts: RunFfmpegOptions = {}): Promise<RunResult> {
  return runProcess(FFMPEG_PATH, args, opts);
}

export function runFfprobe(args: string[], opts: RunFfmpegOptions = {}): Promise<RunResult> {
  return runProcess(FFPROBE_PATH, args, opts);
}

function runProcess(bin: string, args: string[], opts: RunFfmpegOptions): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let progressBuf = '';
    let settled = false;

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill('SIGKILL');
        }, opts.timeoutMs)
      : null;

    child.stdout.on('data', (d: Buffer) => {
      const text = d.toString();
      stdout += text;
      if (stdout.length > 2_000_000) stdout = stdout.slice(-1_000_000);
      if (opts.onProgress) {
        progressBuf += text;
        const lines = progressBuf.split('\n');
        progressBuf = lines.pop() ?? '';
        for (const line of lines) {
          const m = /^out_time_ms=(\d+)/.exec(line.trim());
          if (m) opts.onProgress(parseInt(m[1], 10) / 1_000_000);
          const m2 = /^out_time_us=(\d+)/.exec(line.trim());
          if (m2) opts.onProgress(parseInt(m2[1], 10) / 1_000_000);
        }
      }
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > 2_000_000) stderr = stderr.slice(-1_000_000);
    });

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn();
    };

    child.on('error', (err) => finish(() => reject(new FfmpegError(`Failed to start ${bin}: ${err.message}`, stderr))));
    child.on('close', (code) => {
      finish(() => {
        if (code === 0) resolve({ stdout, stderr });
        else reject(new FfmpegError(`${bin} exited with code ${code}`, stderr));
      });
    });
  });
}

let cachedCapabilities: { hasAss: boolean; hasDrawtext: boolean; version: string } | null = null;

export async function getFfmpegCapabilities(): Promise<{
  hasAss: boolean;
  hasDrawtext: boolean;
  version: string;
}> {
  if (cachedCapabilities) return cachedCapabilities;
  const [versionRes, filtersRes] = await Promise.all([
    runFfmpeg(['-version']),
    runFfmpeg(['-hide_banner', '-filters']),
  ]);
  const version = versionRes.stdout.split('\n')[0] ?? 'unknown';
  const filters = filtersRes.stdout;
  cachedCapabilities = {
    hasAss: /\bsubtitles\b/.test(filters) && /\bass\b/.test(filters),
    hasDrawtext: /\bdrawtext\b/.test(filters),
    version,
  };
  return cachedCapabilities;
}
