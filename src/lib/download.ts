/**
 * Remote video URL ingestion.
 * Copyright & platform policy: we only accept direct video file URLs.
 * Watch-page / streaming-platform URLs (YouTube, TikTok, Instagram, ...) are
 * rejected with guidance to download and upload the file — we never bypass
 * platform protections.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { ApiError } from './errors';
import { storagePut, ensureDir, scratchDir } from './storage';

const BLOCKED_HOST_PATTERNS = [
  /(^|\.)youtube\.com$/i,
  /^youtu\.be$/i,
  /(^|\.)tiktok\.com$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)facebook\.com$/i,
  /^fb\.watch$/i,
  /(^|\.)twitter\.com$/i,
  /^x\.com$/i,
  /(^|\.)twitch\.tv$/i,
  /(^|\.)dailymotion\.com$/i,
  /(^|\.)vimeo\.com$/i,
  /(^|\.)snapchat\.com$/i,
  /(^|\.)linkedin\.com$/i,
  /(^|\.)reddit\.com$/i,
  /(^|\.)pinterest\.com$/i,
];

const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.webm', '.m4v'];

export interface UrlCheck {
  url: string;
  contentType: string;
  sizeBytes: number | null;
}

export function validateVideoUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError(400, 'That does not look like a valid URL', 'invalid_url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ApiError(400, 'Only http(s) URLs are supported', 'invalid_url');
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOST_PATTERNS.some((p) => p.test(host))) {
    throw new ApiError(
      422,
      'This looks like a streaming-platform link (e.g. YouTube, TikTok, Instagram). ClipGenius respects platform terms and never bypasses their protections — please download the video (if you have the rights to it) and use the direct upload instead.',
      'platform_restricted',
    );
  }
  return url;
}

function looksLikeVideo(url: URL, contentType: string): boolean {
  const ext = path.extname(url.pathname).toLowerCase();
  if (ALLOWED_EXTENSIONS.includes(ext)) return true;
  return contentType.startsWith('video/') && /mp4|quicktime|webm|x-m4v/.test(contentType);
}

/** HEAD/GET probe to verify the URL serves a real video file. */
export async function checkVideoUrl(raw: string): Promise<UrlCheck> {
  const url = validateVideoUrl(raw);
  let res: Response;
  try {
    res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (!res.ok || res.headers.get('content-length') === null) {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: { Range: 'bytes=0-1023' },
      });
    }
  } catch (err) {
    throw new ApiError(422, `Could not reach that URL (${(err as Error).message})`, 'url_unreachable');
  }
  const finalHost = new URL(res.url).hostname.toLowerCase();
  if (BLOCKED_HOST_PATTERNS.some((p) => p.test(finalHost))) {
    throw new ApiError(422, 'That URL redirects to a restricted platform. Please upload the file directly.', 'platform_restricted');
  }
  const contentType = res.headers.get('content-type') ?? '';
  const sizeHeader = res.headers.get('content-length');
  const sizeBytes = sizeHeader ? parseInt(sizeHeader, 10) : null;

  if (!looksLikeVideo(url, contentType)) {
    throw new ApiError(
      422,
      `That URL does not serve a supported video file (detected: ${contentType || 'unknown'}). Only direct links to MP4, MOV or WEBM files are supported — use direct upload otherwise.`,
      'unsupported_source',
    );
  }
  return { url: url.toString(), contentType, sizeBytes };
}

/** Download a direct video URL into object storage with a hard size cap. */
export async function downloadVideoToStorage(
  raw: string,
  storageKey: string,
  maxBytes: number,
  onProgress?: (downloaded: number, total: number | null) => void,
): Promise<{ sizeBytes: number; contentType: string }> {
  const check = await checkVideoUrl(raw);
  if (check.sizeBytes && check.sizeBytes > maxBytes) {
    throw new ApiError(
      413,
      `The file at that URL is ${(check.sizeBytes / 1024 / 1024).toFixed(0)} MB, which exceeds your plan's upload limit.`,
      'plan_limit',
    );
  }

  const res = await fetch(check.url, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new ApiError(422, `Failed to download the video (HTTP ${res.status})`, 'url_unreachable');
  }

  const tmpDir = await ensureDir(path.join(scratchDir, 'downloads'));
  const tmpPath = path.join(tmpDir, `${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
  const out = fs.createWriteStream(tmpPath);
  const readable = Readable.fromWeb(res.body as never);
  let downloaded = 0;
  const total = res.headers.get('content-length') ? parseInt(res.headers.get('content-length')!, 10) : null;

  await new Promise<void>((resolve, reject) => {
    readable.on('data', (chunk: Buffer) => {
      downloaded += chunk.length;
      if (downloaded > maxBytes) {
        readable.destroy();
        out.destroy();
        reject(
          new ApiError(413, 'Download exceeded your plan upload limit', 'plan_limit'),
        );
        return;
      }
      onProgress?.(downloaded, total);
    });
    readable.pipe(out);
    out.on('finish', () => resolve());
    out.on('error', reject);
    readable.on('error', reject);
  });

  // Validate magic bytes — must be ISO-BMFF (mp4/mov) or Matroska/WebM.
  const fd = await fsp.open(tmpPath, 'r');
  const head = Buffer.alloc(12);
  await fd.read(head, 0, 12, 0);
  await fd.close();
  const isIsoBmff = head.slice(4, 8).toString('latin1') === 'ftyp';
  const isMkv = head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
  if (!isIsoBmff && !isMkv) {
    await fsp.rm(tmpPath, { force: true });
    throw new ApiError(422, 'The downloaded file is not a valid MP4, MOV or WEBM video', 'unsupported_source');
  }

  await storagePut(storageKey, tmpPath);
  await fsp.rm(tmpPath, { force: true });
  return { sizeBytes: downloaded, contentType: check.contentType };
}
