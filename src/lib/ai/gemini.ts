/**
 * Google Gemini integration (server-side only).
 * Used for: speech transcription with timestamps, highlight selection and
 * metadata (titles/hooks/hashtags). All calls fail soft — when the API is
 * unreachable or unconfigured the pipeline falls back to the local engine and
 * the UI reports the integration status.
 */
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../env';

const API_BASE = 'https://generativelanguage.googleapis.com';

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

export function geminiConfigured(): boolean {
  return !!env.geminiApiKey;
}

async function geminiFetch(url: string, init: RequestInit, timeoutMs = 120_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } catch (err) {
    throw new AiUnavailableError(`Gemini API unreachable: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  fileData?: { mimeType: string; fileUri: string };
}

export async function geminiGenerateContent(
  model: string,
  parts: GeminiPart[],
  opts: { json?: boolean; temperature?: number; maxOutputTokens?: number } = {},
): Promise<string> {
  if (!geminiConfigured()) throw new AiUnavailableError('GEMINI_API_KEY is not configured');
  const url = `${API_BASE}/v1beta/models/${model}:generateContent?key=${env.geminiApiKey}`;
  const res = await geminiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: opts.temperature ?? 0.2,
        maxOutputTokens: opts.maxOutputTokens ?? 8192,
        ...(opts.json ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AiUnavailableError(`Gemini API error ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text.trim()) throw new AiUnavailableError('Gemini returned an empty response');
  return text;
}

export interface GeminiFileRef {
  uri: string;
  name: string;
  mimeType: string;
}

/** Upload a media file with the Gemini Files API (resumable protocol). */
export async function geminiUploadFile(filePath: string, mimeType: string): Promise<GeminiFileRef> {
  if (!geminiConfigured()) throw new AiUnavailableError('GEMINI_API_KEY is not configured');
  const stat = fs.statSync(filePath);
  const displayName = path.basename(filePath);

  const startRes = await geminiFetch(
    `${API_BASE}/upload/v1beta/files?key=${env.geminiApiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(stat.size),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    },
  );
  if (!startRes.ok) {
    throw new AiUnavailableError(`Gemini file upload failed to start: ${startRes.status}`);
  }
  const uploadUrl = startRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new AiUnavailableError('Gemini did not return an upload URL');

  const buffer = fs.readFileSync(filePath);
  const uploadRes = await geminiFetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(buffer.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: buffer as unknown as BodyInit,
  });
  if (!uploadRes.ok) throw new AiUnavailableError(`Gemini file upload failed: ${uploadRes.status}`);
  const fileData = (await uploadRes.json()) as { file?: { name?: string; uri?: string; mimeType?: string } };
  const file = fileData.file;
  if (!file?.uri) throw new AiUnavailableError('Gemini upload returned no file URI');

  // Wait until processing completes.
  for (let i = 0; i < 60; i++) {
    const check = await geminiFetch(`${API_BASE}/v1beta/${file.name}?key=${env.geminiApiKey}`, { method: 'GET' });
    if (check.ok) {
      const state = (await check.json()) as { state?: string };
      if (state.state === 'ACTIVE') break;
      if (state.state === 'FAILED') throw new AiUnavailableError('Gemini failed to process the uploaded audio');
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { uri: file.uri, name: file.name ?? '', mimeType: file.mimeType ?? mimeType };
}

/** Parse a JSON object out of a model response (handles ```json fences). */
export function extractJson<T>(text: string): T {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new Error('No JSON found in model response');
  const slice = candidate.slice(start);
  // try progressively shorter endings to tolerate trailing prose
  for (let end = slice.length; end > 1; end--) {
    const ch = slice[end - 1];
    if (ch !== '}' && ch !== ']') continue;
    try {
      return JSON.parse(slice.slice(0, end)) as T;
    } catch {
      /* keep trimming */
    }
  }
  throw new Error('Malformed JSON in model response');
}
