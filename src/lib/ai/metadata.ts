/**
 * Clip metadata generation (title, hook, description, hashtags).
 *  - `gemini` provider generates creative copy from the real transcript.
 *  - `local` provider is strictly extractive: it uses the clip's own words,
 *    never invented content, and is labeled as such in the UI.
 */
import type { ClipCandidate } from '../video/highlights';
import type { Transcript } from '../video/transcribe';
import {
  AiUnavailableError,
  extractJson,
  geminiConfigured,
  geminiGenerateContent,
} from './gemini';
import { env } from '../env';

export interface ClipMetadata {
  title: string;
  hook: string;
  description: string;
  hashtags: string[];
  provider: 'gemini' | 'local';
}

const STOPWORDS = new Set(
  `a an and are as at be but by for from has have how i if in into is it its of on or that the this to was we what when who why will with you your about after all also am any because been before being between can could did do does doing down during each few get got had he her here hers him his how i'll i'm i've just let like made make many may me more most much must my no not now off once only other our out over own said same see should since so some such than that's their them then there these they think through too under up very want was way we well were what's when where which while who's why will with would you your you're yours`.split(
    /\s+/,
  ),
);

function firstSentence(text: string, maxLen = 70): string {
  const m = /[^.!?]+[.!?]?/.exec(text.trim());
  let s = (m ? m[0] : text).trim().replace(/\s+/g, ' ');
  if (s.length > maxLen) {
    const cut = s.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(' ');
    s = (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:]$/, '');
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function topKeywords(text: string, n: number): string[] {
  const freq = new Map<string, number>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9']+/)) {
    const w = raw.trim();
    if (w.length < 3 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([w]) => w);
}

export function localMetadata(candidate: ClipCandidate, rank: number): ClipMetadata {
  const text = candidate.text.trim();
  if (!text) {
    return {
      title: `Highlight ${rank + 1} (${formatRange(candidate.start, candidate.end)})`,
      hook: '',
      description: 'Clip selected from the most active part of the video (acoustic analysis).',
      hashtags: ['#shorts'],
      provider: 'local',
    };
  }
  const keywords = topKeywords(text, 4);
  const title = firstSentence(text);
  const hook = firstSentence(text, 90);
  const description =
    text.length > 220 ? `${text.slice(0, 217).trim()}…` : text;
  const hashtags = keywords.map((k) => `#${k.replace(/[^a-z0-9]/gi, '')}`).filter((h) => h.length > 2);
  return {
    title,
    hook,
    description: `${description}\n\nFollow for more clips like this.`,
    hashtags: [...new Set(['#shorts', ...hashtags])].slice(0, 6),
    provider: 'local',
  };
}

function formatRange(start: number, end: number): string {
  const f = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  return `${f(start)}–${f(end)}`;
}

export async function geminiMetadata(
  candidate: ClipCandidate,
  rank: number,
  transcript: Transcript,
): Promise<ClipMetadata | null> {
  if (!geminiConfigured() || !candidate.text.trim()) return null;
  try {
    const prompt = `You write metadata for short vertical videos (TikTok / YouTube Shorts / Reels).
Below is the verbatim transcript of clip #${rank + 1} (seconds ${candidate.start.toFixed(1)}–${candidate.end.toFixed(1)}) from a longer video.

TRANSCRIPT:
"""
${candidate.text}
"""

Return STRICT JSON:
{
  "title": "max 60 chars, specific and curiosity-driven, grounded in the transcript",
  "hook": "the strongest one-line hook from the clip (quote or light rewrite)",
  "description": "1-2 sentence description grounded in the clip content",
  "hashtags": ["#topic1", "#topic2", "#shorts"]
}
Rules: never invent facts absent from the transcript; 3-5 hashtags; no emojis in title.`;
    const raw = await geminiGenerateContent(
      env.geminiHighlightModel,
      [{ text: prompt }],
      { json: true, temperature: 0.6 },
    );
    const parsed = extractJson<{ title?: string; hook?: string; description?: string; hashtags?: string[] }>(raw);
    return {
      title: (parsed.title ?? '').slice(0, 90),
      hook: (parsed.hook ?? '').slice(0, 160),
      description: parsed.description ?? '',
      hashtags: (parsed.hashtags ?? []).slice(0, 6),
      provider: 'gemini',
    };
  } catch (err) {
    if (err instanceof AiUnavailableError) return null;
    console.warn('[ai] gemini metadata failed:', err);
    return null;
  }
}

export async function generateMetadata(
  candidate: ClipCandidate,
  rank: number,
  transcript: Transcript,
): Promise<ClipMetadata> {
  const gemini = await geminiMetadata(candidate, rank, transcript);
  return gemini ?? localMetadata(candidate, rank);
}
