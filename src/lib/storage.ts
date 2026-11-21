/**
 * Object storage abstraction.
 *  - `local` driver (default): files on disk under STORAGE_DIR. Fully functional.
 *  - `s3` driver: any S3-compatible bucket (AWS S3, Cloudflare R2, MinIO).
 * Media processing always works on local scratch paths via `localize()`.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { env } from './env';
import { ApiError } from './errors';

export interface StorageStat {
  size: number;
  lastModified: Date;
}

export function storageKey(...parts: string[]): string {
  return parts
    .map((p) => p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}

function localPathFor(key: string): string {
  const abs = path.resolve(env.storageDir, key);
  if (!abs.startsWith(env.storageDir + path.sep) && abs !== env.storageDir) {
    throw new ApiError(400, 'Invalid storage key', 'validation');
  }
  return abs;
}

// ---------------------------------------------------------------- local driver

async function localPut(key: string, src: string | Readable): Promise<void> {
  const dest = localPathFor(key);
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  if (typeof src === 'string') {
    await fsp.copyFile(src, dest);
  } else {
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(dest);
      src.pipe(out).on('finish', () => resolve()).on('error', reject);
      src.on('error', reject);
    });
  }
}

async function localStat(key: string): Promise<StorageStat | null> {
  try {
    const st = await fsp.stat(localPathFor(key));
    return { size: st.size, lastModified: st.mtime };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------- s3 driver

function s3Client() {
  // Lazy import so the AWS SDK is only loaded when the s3 driver is active.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { S3Client } = require('@aws-sdk/client-s3') as typeof import('@aws-sdk/client-s3');
  return new S3Client({
    region: env.s3.region,
    endpoint: env.s3.endpoint || undefined,
    forcePathStyle: env.s3.forcePathStyle,
    credentials: {
      accessKeyId: env.s3.accessKeyId,
      secretAccessKey: env.s3.secretAccessKey,
    },
  });
}

function assertS3Configured(): void {
  if (!env.s3.bucket || !env.s3.accessKeyId || !env.s3.secretAccessKey) {
    throw new ApiError(
      500,
      'S3 storage is selected but not configured. Set S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.',
      'storage_config',
    );
  }
}

async function s3Put(key: string, src: string | Readable): Promise<void> {
  assertS3Configured();
  const { Upload } = require('@aws-sdk/lib-storage') as typeof import('@aws-sdk/lib-storage');
  const body = typeof src === 'string' ? fs.createReadStream(src) : src;
  const upload = new Upload({
    client: s3Client(),
    params: { Bucket: env.s3.bucket, Key: key, Body: body },
  });
  await upload.done();
}

async function s3GetStream(key: string, range?: { start: number; end?: number }): Promise<Readable> {
  assertS3Configured();
  const { GetObjectCommand } = require('@aws-sdk/client-s3') as typeof import('@aws-sdk/client-s3');
  const res = await s3Client().send(
    new GetObjectCommand({
      Bucket: env.s3.bucket,
      Key: key,
      Range: range ? `bytes=${range.start}-${range.end ?? ''}` : undefined,
    }),
  );
  return res.Body as unknown as Readable;
}

async function s3Stat(key: string): Promise<StorageStat | null> {
  assertS3Configured();
  const { HeadObjectCommand } = require('@aws-sdk/client-s3') as typeof import('@aws-sdk/client-s3');
  try {
    const res = await s3Client().send(new HeadObjectCommand({ Bucket: env.s3.bucket, Key: key }));
    return { size: res.ContentLength ?? 0, lastModified: res.LastModified ?? new Date() };
  } catch {
    return null;
  }
}

// -------------------------------------------------------------- unified facade

const scratchDir = path.resolve('./data/scratch');

export async function storagePut(key: string, src: string | Readable): Promise<void> {
  if (env.storageDriver === 's3') return s3Put(key, src);
  return localPut(key, src);
}

export async function storagePutBuffer(key: string, buf: Buffer): Promise<void> {
  await storagePut(key, Readable.from(buf));
}

export async function storageExists(key: string): Promise<boolean> {
  return (await storageStat(key)) !== null;
}

export async function storageStat(key: string): Promise<StorageStat | null> {
  if (env.storageDriver === 's3') return s3Stat(key);
  return localStat(key);
}

export async function storageRemove(key: string): Promise<void> {
  if (env.storageDriver === 's3') {
    assertS3Configured();
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3') as typeof import('@aws-sdk/client-s3');
    await s3Client().send(new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: key }));
    return;
  }
  await fsp.rm(localPathFor(key), { force: true });
}

/** Byte-range stream for media playback (HTTP 206). */
export async function storageGetStream(key: string, range?: { start: number; end?: number }): Promise<Readable> {
  if (env.storageDriver === 's3') return s3GetStream(key, range);
  const abs = localPathFor(key);
  if (!fs.existsSync(abs)) throw new ApiError(404, 'File not found', 'not_found');
  return fs.createReadStream(abs, range ? { start: range.start, end: range.end } : undefined);
}

/**
 * Materialize a stored object to a local file path (for FFmpeg etc.).
 * Returns the absolute local path. Caller should not delete source materialized
 * from storage (cached); use `materializeTemp` for throwaway scratch copies.
 */
export async function storageLocalize(key: string): Promise<string> {
  if (env.storageDriver === 'local') {
    const abs = localPathFor(key);
    if (!fs.existsSync(abs)) throw new ApiError(404, `Media not found in storage: ${key}`, 'not_found');
    return abs;
  }
  const dest = path.join(scratchDir, key.replace(/\//g, '_'));
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  if (!fs.existsSync(dest)) {
    const stream = await s3GetStream(key);
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(dest);
      stream.pipe(out).on('finish', () => resolve()).on('error', reject);
      stream.on('error', reject);
    });
  }
  return dest;
}

export async function ensureDir(dir: string): Promise<string> {
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

export { scratchDir };
