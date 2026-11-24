/**
 * Animated subtitle generation. Builds ASS subtitle files that FFmpeg burns
 * into the clip via libass (with a drawtext fallback when libass is absent).
 */
import path from 'node:path';
import fs from 'node:fs';
import type { TranscriptSegment, TranscriptWord } from './transcribe';

export interface CaptionStyle {
  fontFamily: string;
  fontSize: number;
  primaryColor: string;
  highlightColor: string;
  outlineColor: string;
  position: 'top' | 'middle' | 'bottom';
  uppercase: boolean;
  backgroundBox: boolean;
  animation: 'none' | 'pop' | 'fade' | 'karaoke';
  bold: boolean;
}

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontFamily: 'Inter',
  fontSize: 58,
  primaryColor: '#FFFFFF',
  highlightColor: '#A78BFA',
  outlineColor: '#000000',
  position: 'bottom',
  uppercase: false,
  backgroundBox: true,
  animation: 'pop',
  bold: true,
};

const FONT_FILES: Record<string, { regular: string; bold: string; assName: string }> = {
  Inter: { regular: 'Inter-Regular.ttf', bold: 'Inter-Bold.ttf', assName: 'Inter' },
  Poppins: { regular: 'Poppins-Regular.ttf', bold: 'Poppins-Bold.ttf', assName: 'Poppins' },
  Montserrat: { regular: 'Montserrat-Regular.ttf', bold: 'Montserrat-Bold.ttf', assName: 'Montserrat' },
  Oswald: { regular: 'Oswald-Regular.ttf', bold: 'Oswald-Bold.ttf', assName: 'Oswald' },
  'Bebas Neue': { regular: 'BebasNeue-Regular.ttf', bold: 'BebasNeue-Regular.ttf', assName: 'Bebas Neue' },
  'DejaVu Sans': {
    regular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    assName: 'DejaVu Sans',
  },
};

export const FONT_FAMILIES = Object.keys(FONT_FILES);

const ASSETS_FONTS = path.resolve('./public/fonts');

export function resolveFontFile(family: string, bold = false): string {
  const entry = FONT_FILES[family] ?? FONT_FILES['DejaVu Sans'];
  const candidate = path.join(ASSETS_FONTS, bold ? entry.bold : entry.regular);
  return fs.existsSync(candidate) ? candidate : entry.regular.startsWith('/') ? entry.regular : path.join(ASSETS_FONTS, entry.regular);
}

function assColor(hex: string, alpha = 0): string {
  const clean = hex.replace('#', '');
  const r = clean.slice(0, 2) || '00';
  const g = clean.slice(2, 4) || '00';
  const b = clean.slice(4, 6) || '00';
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

function assTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const cs = Math.floor((s % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function escapeAssText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/[{}]/g, '').replace(/\n/g, '\\N');
}

export interface CaptionTiming {
  /** Retargeted (clip-relative, post-condense) timing. */
  segments: TranscriptSegment[];
}

/**
 * Build an ASS document for the given clip-relative segments.
 * `scale` converts logical font sizes to PlayRes units (rendered height).
 */
export function buildAss(
  timing: CaptionTiming,
  style: CaptionStyle,
  width: number,
  height: number,
): string {
  const fontSize = Math.round((style.fontSize / 1080) * width * (height / 1920) * 1.6);
  const marginV = Math.round(height * (style.position === 'bottom' ? 0.10 : style.position === 'middle' ? 0.38 : 0.10));
  const align = style.position === 'bottom' ? 2 : style.position === 'middle' ? 5 : 8;
  const family = FONT_FILES[style.fontFamily] ?? FONT_FILES['DejaVu Sans'];

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${family.assName},${fontSize},${assColor(style.primaryColor)},${assColor(style.highlightColor)},${assColor(style.outlineColor)},${assColor('#000000', 0.55)},${style.bold ? -1 : 0},0,0,0,100,100,0,0,${style.backgroundBox ? 3 : 1},3,1,${align},${Math.round(width * 0.06)},${Math.round(width * 0.06)},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines: string[] = [];
  for (const seg of timing.segments) {
    const text = style.uppercase ? seg.text.toUpperCase() : seg.text;
    let body = escapeAssText(text);

    if (style.animation === 'karaoke' && seg.words?.length) {
      body = karaokeBody(seg.words, style);
    } else if (style.animation === 'pop') {
      body = `{\\fad(60,60)\\fscx78\\fscy78\\t(0,110,\\fscx100\\fscy100)}${body}`;
    } else if (style.animation === 'fade') {
      body = `{\\fad(140,140)}${body}`;
    }

    lines.push(
      `Dialogue: 0,${assTime(seg.start)},${assTime(seg.end)},Caption,,0,0,0,,${body}`,
    );
  }
  return header + lines.join('\n') + '\n';
}

function karaokeBody(words: TranscriptWord[], style: CaptionStyle): string {
  let out = '{\\fad(40,40)}';
  for (const w of words) {
    const durCs = Math.max(8, Math.round((w.end - w.start) * 100));
    const word = style.uppercase ? w.w.toUpperCase() : w.w;
    out += `{\\k${durCs}\\1c${assColor(style.highlightColor)}}${escapeAssText(word)}{\\1c${assColor(style.primaryColor)}} `;
  }
  return out.trim();
}

/** Plain caption lines with clip-relative timing for the drawtext fallback. */
export interface DrawtextLine {
  text: string;
  start: number;
  end: number;
}

export function drawtextLines(timing: CaptionTiming, style: CaptionStyle): DrawtextLine[] {
  return timing.segments.map((seg) => ({
    text: style.uppercase ? seg.text.toUpperCase() : seg.text,
    start: seg.start,
    end: seg.end,
  }));
}
