import { runFfprobe } from './ffmpeg';

export interface ProbeStream {
  index: number;
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  duration?: string;
  bit_rate?: string;
  sample_rate?: string;
  channels?: number;
}

export interface ProbeResult {
  duration: number;
  sizeBytes: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string | null;
  hasAudio: boolean;
  formatName: string;
}

function parseFps(rate: string | undefined): number {
  if (!rate) return 30;
  const [num, den] = rate.split('/').map(Number);
  if (!den || !num) return 30;
  return Math.round((num / den) * 100) / 100;
}

export async function probeVideo(filePath: string): Promise<ProbeResult> {
  const { stdout } = await runFfprobe([
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);
  const data = JSON.parse(stdout) as {
    format?: { duration?: string; size?: string; format_name?: string };
    streams?: ProbeStream[];
  };
  const streams = data.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video');
  const audio = streams.find((s) => s.codec_type === 'audio');
  if (!video) throw new Error('No video stream found — is this a valid video file?');

  const duration =
    parseFloat(data.format?.duration ?? video.duration ?? '0') || 0;
  return {
    duration,
    sizeBytes: parseInt(data.format?.size ?? '0', 10) || 0,
    width: video.width ?? 0,
    height: video.height ?? 0,
    fps: parseFps(video.r_frame_rate),
    videoCodec: video.codec_name ?? 'unknown',
    audioCodec: audio?.codec_name ?? null,
    hasAudio: !!audio,
    formatName: data.format?.format_name ?? 'unknown',
  };
}

/** Quick duration-only probe (cheap). */
export async function probeDuration(filePath: string): Promise<number> {
  const { stdout } = await runFfprobe([
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  return parseFloat(stdout.trim()) || 0;
}
