/**
 * Speech transcription providers.
 *  - `gemini` — Google Gemini audio understanding with timestamps (needs key)
 *  - `none`   — no transcript available; the pipeline continues with acoustic
 *               analysis only and the UI says captions need an AI provider.
 */
import { runFfmpeg } from './ffmpeg';
import {
  AiUnavailableError,
  geminiConfigured,
  geminiGenerateContent,
  geminiUploadFile,
  extractJson,
} from '../ai/gemini';
import { env } from '../env';

export interface TranscriptWord {
  w: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  words?: TranscriptWord[];
}

export interface Transcript {
  provider: 'gemini' | 'none';
  language: string | null;
  segments: TranscriptSegment[];
  text: string;
}

const FILLER_WORDS = new Set([
  'um', 'uh', 'uhm', 'erm', 'hmm', 'mhm', 'ah', 'eh', 'like', 'you know',
  'i mean', 'sort of', 'kind of', 'basically', 'literally', 'so yeah',
]);

export function isFiller(word: string): boolean {
  return FILLER_WORDS.has(word.toLowerCase().replace(/[^a-z' ]/g, ''));
}

/** Extract a 16kHz mono WAV for transcription (Gemini accepts wav/flac/mp3/m4a). */
export async function extractAudioForTranscription(videoPath: string, outWav: string): Promise<string> {
  await runFfmpeg([
    '-hide_banner', '-y',
    '-i', videoPath,
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-c:a', 'pcm_s16le',
    outWav,
  ]);
  return outWav;
}

function interpolateWords(segment: TranscriptSegment): TranscriptWord[] {
  const words = segment.text.split(/\s+/).filter(Boolean);
  const total = Math.max(0.01, segment.end - segment.start);
  const per = total / Math.max(1, words.length);
  return words.map((w, i) => ({
    w,
    start: segment.start + i * per,
    end: segment.start + (i + 1) * per,
  }));
}

export async function transcribeWithGemini(audioPath: string, durationHint: number): Promise<Transcript> {
  const file = await geminiUploadFile(audioPath, 'audio/wav');
  const prompt = `You are a professional transcription system. Transcribe this ${Math.round(durationHint / 60)}-minute audio recording precisely.

Return STRICT JSON with this schema and no other text:
{
  "language": "en",
  "segments": [
    { "start": 0.0, "end": 4.2, "text": "sentence text", "words": [{"w":"word","start":0.0,"end":0.35}] }
  ]
}

Rules:
- Segment by sentence (max ~12 words per segment). Never split a sentence across segments.
- start/end are seconds, accurate to 0.1s, start < end, segments in order and non-overlapping.
- Include a "words" array with per-word timings when possible.
- Transcribe verbatim (keep filler words); do not summarize or translate.
- If there is no speech, return {"language": null, "segments": []}.`;

  const raw = await geminiGenerateContent(
    env.geminiTranscribeModel,
    [{ fileData: { mimeType: file.mimeType, fileUri: file.uri } } as never, { text: prompt }],
    { json: true, temperature: 0 },
  );
  const parsed = extractJson<{ language?: string; segments?: Array<{ start: number; end: number; text: string; words?: TranscriptWord[] }> }>(raw);
  const segments: TranscriptSegment[] = (parsed.segments ?? [])
    .filter((s) => typeof s.start === 'number' && typeof s.end === 'number' && s.text?.trim())
    .map((s) => {
      const seg: TranscriptSegment = {
        start: Math.max(0, s.start),
        end: Math.max(s.start + 0.05, s.end),
        text: s.text.trim(),
      };
      seg.words = s.words?.length
        ? s.words.map((w) => ({ w: w.w, start: w.start, end: w.end }))
        : interpolateWords(seg);
      return seg;
    })
    .sort((a, b) => a.start - b.start);

  return {
    provider: 'gemini',
    language: parsed.language ?? null,
    segments,
    text: segments.map((s) => s.text).join(' '),
  };
}

export interface TranscribeResult {
  transcript: Transcript;
  warnings: string[];
}

/**
 * Transcribe speech using the best available provider.
 * Never throws for missing configuration — returns an empty transcript with a
 * warning instead, so clip generation still works from acoustic analysis.
 */
export async function transcribeMedia(
  videoPath: string,
  durationSec: number,
  workDir: string,
  hasAudio: boolean,
): Promise<TranscribeResult> {
  const warnings: string[] = [];
  const empty: Transcript = { provider: 'none', language: null, segments: [], text: '' };

  if (!hasAudio) {
    warnings.push('The video has no audio track, so there is no speech to transcribe.');
    return { transcript: empty, warnings };
  }

  if (!geminiConfigured()) {
    warnings.push(
      'GEMINI_API_KEY is not configured — clips are generated from acoustic analysis (speech energy, silences, scene changes) without a word transcript. Add the key to enable captions and AI metadata.',
    );
    return { transcript: empty, warnings };
  }

  try {
    const wav = `${workDir}/transcribe.wav`;
    await extractAudioForTranscription(videoPath, wav);
    const transcript = await transcribeWithGemini(wav, durationSec);
    if (transcript.segments.length === 0) {
      warnings.push('No speech was detected in the audio track.');
    }
    return { transcript, warnings };
  } catch (err) {
    const msg = err instanceof AiUnavailableError ? err.message : String(err);
    warnings.push(`Transcription failed (${msg}). Falling back to acoustic analysis without captions.`);
    return { transcript: empty, warnings };
  }
}
