/**
 * Highlight selection engine.
 * Ranks real, measured signals (speech energy, scene activity, transcript
 * hooks) to pick meaningful segments. Segments snap to sentence/silence
 * boundaries so clips never cut a sentence in half.
 */
import type { AnalysisResult } from './analyze';
import type { Transcript, TranscriptSegment } from './transcribe';

export interface ClipCandidate {
  start: number;
  end: number;
  duration: number;
  score: number;
  reason: string;
  segments: TranscriptSegment[];
  text: string;
}

interface Unit {
  start: number;
  end: number;
  score: number;
  energy: number;
  segments: TranscriptSegment[];
  text: string;
}

export interface SelectOptions {
  transcript: Transcript;
  analysis: AnalysisResult;
  duration: number;
  clipLengthSec: number;
  clipCount: number;
}

const HOOK_WORDS = [
  'secret', 'mistake', 'mistakes', 'how', 'why', 'never', 'always', 'best',
  'worst', 'truth', 'money', 'free', 'stop', 'watch', 'reason', 'reasons',
  'tip', 'tips', 'trick', 'tricks', 'hack', 'hacks', 'warning', 'crazy',
  'insane', 'nobody', 'everyone', 'actually', 'important', 'biggest', 'top',
  'story', 'what if', 'imagine', 'listen', 'question', 'answer', 'problem',
  'solution', 'result', 'secret', 'proven', 'easy', 'fast', 'quickly',
];

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : -60;
}

/** Adaptive speech threshold from the energy distribution. */
function speechThreshold(analysis: AnalysisResult): number {
  const dbs = analysis.energy.map((e) => e.rms).sort((a, b) => a - b);
  if (dbs.length === 0) return -45;
  const p70 = dbs[Math.floor(dbs.length * 0.7)];
  return Math.max(-45, Math.min(-22, p70 - 2));
}

function scoreText(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  if (text.includes('?')) score += 0.5;
  if (/\d/.test(text)) score += 0.3;
  for (const w of HOOK_WORDS) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(lower)) score += 0.18;
  }
  // Short punchy sentences hook viewers
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words >= 4 && words <= 14) score += 0.25;
  return clamp(score, 0, 1.6);
}

/** Build the atomic units that clips may be assembled from. */
function buildUnits(opts: SelectOptions): Unit[] {
  const { transcript, analysis, duration } = opts;
  const units: Unit[] = [];

  const energyAt = (start: number, end: number): number => {
    const pts = analysis.energy.filter((e) => e.t >= start && e.t < end);
    return mean(pts.map((p) => p.rms));
  };

  if (transcript.segments.length > 0) {
    // Group transcript sentences into units of roughly 3–8 seconds.
    let current: TranscriptSegment[] = [];
    const flush = () => {
      if (current.length === 0) return;
      const start = current[0].start;
      const end = current[current.length - 1].end;
      const text = current.map((s) => s.text).join(' ');
      units.push({
        start,
        end,
        score: 0,
        energy: energyAt(start, end),
        segments: current,
        text,
      });
      current = [];
    };
    for (const seg of transcript.segments) {
      current.push(seg);
      const span = seg.end - (current[0]?.start ?? seg.start);
      if (span >= 5.5 || /[.!?]$/.test(seg.text.trim()) && span >= 2.8) flush();
    }
    flush();
  } else {
    // Acoustic units: contiguous speech-like bursts separated by silences.
    const threshold = speechThreshold(analysis);
    const window = analysis.energy.length ? analysis.energy[1].t - analysis.energy[0].t : 0.25;
    let burstStart: number | null = null;
    for (const pt of analysis.energy) {
      const silent = analysis.silences.some((s) => pt.t >= s.start && pt.t <= s.end);
      const active = pt.rms >= threshold && !silent;
      if (active && burstStart === null) burstStart = pt.t;
      if ((!active || pt === analysis.energy[analysis.energy.length - 1]) && burstStart !== null) {
        const end = pt.t + window;
        if (end - burstStart >= 1.2) {
          units.push({
            start: burstStart,
            end: Math.min(end, duration),
            score: 0,
            energy: energyAt(burstStart, end),
            segments: [],
            text: '',
          });
        }
        burstStart = null;
      }
    }
  }

  // Score every unit on normalized energy + hook text + scene activity.
  const energies = units.map((u) => u.energy);
  const minE = Math.min(...energies, -60);
  const maxE = Math.max(...energies, -20);
  for (const u of units) {
    const energyNorm = maxE > minE ? (u.energy - minE) / (maxE - minE) : 0.5;
    const nearbyCuts = analysis.sceneCuts.filter((c) => c >= u.start - 2 && c <= u.end + 2).length;
    const sceneNorm = clamp(nearbyCuts / 3, 0, 1);
    const textNorm = clamp(scoreText(u.text) / 1.6, 0, 1);
    const positionNorm = 1 - clamp(u.start / Math.max(1, duration), 0, 1) * 0.35;
    u.score = energyNorm * 0.4 + sceneNorm * 0.15 + textNorm * 0.35 + positionNorm * 0.1;
  }
  return units;
}

function assembleAroundSeed(seed: Unit, units: Unit[], maxDuration: number): { start: number; end: number; segments: TranscriptSegment[]; text: string } {
  const idx = units.indexOf(seed);
  const chosen = new Set<number>([idx]);
  let total = seed.end - seed.start;
  let lo = idx;
  let hi = idx;

  while (total < maxDuration * 0.92) {
    const left = lo > 0 ? units[lo - 1] : null;
    const right = hi < units.length - 1 ? units[hi + 1] : null;
    const leftGap = left ? units[lo].start - left.end : Infinity;
    const rightGap = right ? right.start - units[hi].end : Infinity;
    // Never bridge a long silence gap (>2.5s) — that would splice unrelated parts.
    const leftOk = left && leftGap < 2.5 && total + (left.end - left.start) <= maxDuration;
    const rightOk = right && rightGap < 2.5 && total + (right.end - right.start) <= maxDuration;
    if (!leftOk && !rightOk) break;
    const pickLeft = leftOk && (!rightOk || (left!.score >= right!.score && leftGap <= rightGap));
    if (pickLeft) {
      chosen.add(lo - 1);
      total += units[lo - 1].end - units[lo - 1].start + leftGap;
      lo--;
    } else {
      chosen.add(hi + 1);
      total += units[hi + 1].end - units[hi].end + rightGap;
      hi++;
    }
  }

  const ordered = [...chosen].sort((a, b) => a - b).map((i) => units[i]);
  const segments = ordered.flatMap((u) => u.segments);
  const text = ordered.map((u) => u.text).filter(Boolean).join(' ');
  return {
    start: ordered[0].start,
    end: ordered[ordered.length - 1].end,
    segments,
    text,
  };
}

/**
 * Select up to `clipCount` non-overlapping highlights of about `clipLengthSec`.
 */
export function selectHighlights(opts: SelectOptions): ClipCandidate[] {
  const { duration, clipLengthSec, clipCount } = opts;
  const units = buildUnits(opts);
  if (units.length === 0) {
    // A completely quiet video still deserves an honest clip: the strongest
    // scene-change region, measured from real scene detection.
    const start = 0;
    const end = Math.min(duration, clipLengthSec);
    return [
      {
        start,
        end,
        duration: end - start,
        score: 0.1,
        reason: 'Whole video (no speech or scene activity detected)',
        segments: [],
        text: '',
      },
    ];
  }

  const byScore = [...units].sort((a, b) => b.score - a.score);
  const accepted: ClipCandidate[] = [];
  const covered: Array<{ start: number; end: number }> = [];

  for (const seed of byScore) {
    if (accepted.length >= clipCount) break;
    const span = assembleAroundSeed(seed, units, clipLengthSec);
    if (span.end - span.start < Math.min(4, clipLengthSec * 0.35)) continue;

    // Reject when mostly overlapping an accepted clip.
    const overlap = covered.reduce((acc, c) => {
      const o = Math.min(c.end, span.end) - Math.max(c.start, span.start);
      return acc + Math.max(0, o);
    }, 0);
    if (overlap / Math.max(0.1, span.end - span.start) > 0.35) continue;

    covered.push({ start: span.start, end: span.end });
    accepted.push({
      start: span.start,
      end: span.end,
      duration: span.end - span.start,
      score: Math.round(seed.score * 100) / 100,
      reason: describeReason(seed, opts.transcript.segments.length > 0),
      segments: span.segments,
      text: span.text,
    });
  }

  accepted.sort((a, b) => b.score - a.score);
  return accepted.map((c, i) => ({ ...c, reason: `${c.reason}` , score: Math.round((c.score - i * 0.001) * 1000) / 1000 }));
}

function describeReason(seed: Unit, hasTranscript: boolean): string {
  const parts: string[] = [];
  if (seed.energy > -28) parts.push('high energy');
  if (hasTranscript && scoreText(seed.text) > 0.5) parts.push('strong hook phrase');
  if (parts.length === 0) parts.push(hasTranscript ? 'clear spoken point' : 'active speech detected');
  return parts.join(' + ');
}
