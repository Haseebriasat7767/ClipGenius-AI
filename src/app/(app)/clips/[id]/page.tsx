'use client';

/**
 * Clip editor — preview, timeline trimming, caption editing, style controls,
 * text overlays, aspect settings and export.
 */
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Play,
  Pause,
  Download,
  Save,
  Scissors,
  Type,
  Palette,
  Layers,
  Settings2,
  FileText,
  Sparkles,
  Plus,
  Trash2,
  RefreshCcw,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  Tabs,
  Textarea,
  Toggle,
  Spinner,
  useToast,
  cn,
} from '@/components/ui';
import { api, ApiClientError, usePolling, mediaUrl, downloadUrl } from '@/lib/client';
import { formatDuration } from '@/lib/utils';

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface TextOverlay {
  id: string;
  text: string;
  start: number;
  end: number;
  position: 'top' | 'middle' | 'bottom';
  color: string;
  size: number;
}

interface ClipStyle {
  aspect: '9:16' | '4:5' | '1:1' | '16:9';
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
  removeSilences: boolean;
  removeFillers: boolean;
  exportHeight: number;
}

interface ClipDetail {
  clip: {
    id: string;
    project_id: string;
    title: string;
    hook: string;
    description: string;
    hashtags: string[];
    start_time: number;
    end_time: number;
    duration_seconds: number;
    score: number;
    rank: number;
    status: string;
    error: string | null;
    video_path: string | null;
    thumbnail_path: string | null;
    width: number | null;
    height: number | null;
    size_bytes: number | null;
    style: Partial<ClipStyle>;
    overlays: TextOverlay[];
    transcript: { segments?: TranscriptSegment[]; provider?: string };
    metadata_provider: string | null;
    created_at: string;
    updated_at: string;
  };
  project: {
    id: string;
    title: string;
    duration_seconds: number | null;
    source_path: string | null;
  };
}

const FONT_OPTIONS = ['Inter', 'Poppins', 'Montserrat', 'Oswald', 'Bebas Neue', 'DejaVu Sans'];

export default function ClipEditorPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const toast = useToast();
  const [tab, setTab] = useState('captions');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<'source' | 'rendered'>('source');

  const fetched = usePolling<ClipDetail>(() => api(`/api/clips/${id}`), 5000, true);

  // Editable state
  const [title, setTitle] = useState('');
  const [hook, setHook] = useState('');
  const [description, setDescription] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [overlays, setOverlays] = useState<TextOverlay[]>([]);
  const [style, setStyle] = useState<ClipStyle>({
    aspect: '9:16',
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
    removeSilences: true,
    removeFillers: false,
    exportHeight: 1920,
  });

  const loadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!fetched?.clip) return;
    const c = fetched.clip;
    if (loadedRef.current === c.id + String(c.updated_at ?? '') ) return;
    loadedRef.current = c.id + String(c.updated_at ?? '');
    setTitle(c.title);
    setHook(c.hook);
    setDescription(c.description);
    setHashtags((c.hashtags ?? []).join(' '));
    setStart(c.start_time);
    setEnd(c.end_time);
    setSegments(c.transcript?.segments ?? []);
    setOverlays(Array.isArray(c.overlays) ? c.overlays : []);
    setStyle((s) => ({ ...s, ...(c.style ?? {}) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetched]);

  const markDirty = useCallback(() => setDirty(true), []);
  const setStyleField = useCallback(
    <K extends keyof ClipStyle>(key: K, value: ClipStyle[K]) => {
      setStyle((s) => ({ ...s, [key]: value }));
      markDirty();
    },
    [markDirty],
  );

  const projectDuration = fetched?.project.duration_seconds ?? 0;

  // ---- preview playback ----
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const playRange = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime < start - 0.05 || v.currentTime > end) v.currentTime = start;
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }, [start, end]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      if (v.currentTime >= end) {
        v.pause();
        v.currentTime = start;
        setPlaying(false);
      }
    };
    v.addEventListener('timeupdate', onTime);
    return () => v.removeEventListener('timeupdate', onTime);
  }, [start, end]);

  // ---- save / export ----
  const buildPayload = () => ({
    title,
    hook,
    description,
    hashtags: hashtags.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean).slice(0, 8),
    start_time: Math.round(start * 100) / 100,
    end_time: Math.round(end * 100) / 100,
    style,
    overlays,
    transcript_segments: segments.map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text,
    })),
  });

  const save = async () => {
    setSaving(true);
    try {
      await api(`/api/clips/${id}`, { method: 'PATCH', json: buildPayload() });
      setDirty(false);
      toast.push('success', 'Clip saved');
    } catch (err) {
      toast.push('error', err instanceof ApiClientError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const exportClip = async () => {
    setExporting(true);
    try {
      await api(`/api/clips/${id}`, { method: 'PATCH', json: buildPayload() });
      await api(`/api/clips/${id}/export`, { method: 'POST' });
      setDirty(false);
      toast.push('info', 'Export queued — rendering starts in a few seconds');
    } catch (err) {
      toast.push('error', err instanceof ApiClientError ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const download = () => {
    const a = document.createElement('a');
    a.href = downloadUrl(id);
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const clip = fetched?.clip;
  const renderStatus = clip?.status;
  const renderedReady = renderStatus === 'ready' && clip?.video_path;

  if (!fetched || !clip) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href={`/projects/${clip.project_id}`}
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-gray-400 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Back to project
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold text-white">Clip editor</h1>
            <Badge color="purple">#{clip.rank}</Badge>
            {dirty && <Badge color="yellow">unsaved changes</Badge>}
            {renderStatus === 'rendering' && <Badge color="blue">rendering…</Badge>}
            {renderStatus === 'failed' && <Badge color="red">render failed</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="secondary" onClick={save} loading={saving}>
            <Save className="h-4 w-4" /> Save
          </Button>
          <Button onClick={exportClip} loading={exporting}>
            <Sparkles className="h-4 w-4" /> {renderedReady ? 'Re-export' : 'Export clip'}
          </Button>
          <Button variant="secondary" onClick={download} disabled={!renderedReady}>
            <Download className="h-4 w-4" /> Download
          </Button>
        </div>
      </div>

      {clip.status === 'failed' && clip.error && (
        <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/[0.08] px-4 py-3.5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div>
            <p className="text-sm font-semibold text-danger">Render failed</p>
            <p className="mt-1 text-xs text-gray-300">{clip.error}</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* ---------------------------------------------------------- Preview */}
        <div className="space-y-5">
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
                <Play className="h-5 w-5 text-brand-300" /> Preview
              </h2>
              {renderedReady && (
                <div className="flex gap-1 rounded-lg border border-white/10 bg-ink-900 p-1">
                  {(['source', 'rendered'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setPlaybackMode(m)}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-xs font-semibold transition',
                        playbackMode === m ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white',
                      )}
                    >
                      {m === 'source' ? 'Source + trim' : 'Rendered clip'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {playbackMode === 'rendered' && renderedReady ? (
              <div className="flex justify-center">
                <video
                  key={clip.video_path}
                  controls
                  className="max-h-[600px] rounded-xl border border-white/10 bg-black"
                  src={mediaUrl(clip.video_path)}
                />
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  className="w-full rounded-xl border border-white/10 bg-black"
                  src={fetched.project.source_path ? mediaUrl(fetched.project.source_path) : undefined}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  preload="metadata"
                  playsInline
                />
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={playRange}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gradient shadow-glow transition hover:brightness-110"
                  >
                    {playing ? <Pause className="h-5 w-5 text-white" /> : <Play className="ml-0.5 h-5 w-5 text-white" />}
                  </button>
                  <p className="text-sm text-gray-400">
                    Playing selection <b className="text-gray-200">{formatDuration(start)}</b> →{' '}
                    <b className="text-gray-200">{formatDuration(end)}</b>
                  </p>
                </div>
              </>
            )}
          </Card>

          {/* Timeline */}
          <Card>
            <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-white">
              <Scissors className="h-5 w-5 text-brand-300" /> Timeline
            </h2>
            <Timeline
              duration={projectDuration}
              start={start}
              end={end}
              segments={segments}
              onChange={(s, e) => {
                setStart(s);
                setEnd(e);
                markDirty();
              }}
            />
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Input
                label="Start (s)"
                type="number"
                step="0.1"
                min={0}
                value={Math.round(start * 10) / 10}
                onChange={(e) => {
                  setStart(Math.max(0, Math.min(parseFloat(e.target.value) || 0, end - 0.5)));
                  markDirty();
                }}
              />
              <Input
                label="End (s)"
                type="number"
                step="0.1"
                value={Math.round(end * 10) / 10}
                onChange={(e) => {
                  setEnd(Math.max(start + 0.5, parseFloat(e.target.value) || 0));
                  markDirty();
                }}
              />
              <div>
                <p className="label">Clip length</p>
                <div className="flex h-[42px] items-center rounded-xl border border-white/10 bg-ink-900/80 px-4 text-sm font-semibold text-gray-200">
                  {(end - start).toFixed(1)}s
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* ---------------------------------------------------------- Controls */}
        <div className="space-y-5">
          <Tabs
            tabs={[
              { id: 'captions', label: 'Captions' },
              { id: 'style', label: 'Style' },
              { id: 'overlays', label: 'Text' },
              { id: 'output', label: 'Output' },
              { id: 'meta', label: 'Info' },
            ]}
            active={tab}
            onChange={setTab}
          />

          {tab === 'captions' && (
            <Card>
              <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
                <Type className="h-5 w-5 text-brand-300" /> Caption text
              </h2>
              {segments.length === 0 ? (
                <p className="mt-4 rounded-xl border border-white/[0.07] bg-ink-900/50 px-4 py-6 text-center text-sm text-gray-500">
                  No transcript for this clip yet. Set <b className="text-gray-300">GEMINI_API_KEY</b> to
                  enable AI transcription and animated captions.
                </p>
              ) : (
                <div className="mt-4 max-h-[480px] space-y-2.5 overflow-y-auto pr-1">
                  {segments.map((seg, i) => (
                    <div key={i} className="rounded-xl border border-white/[0.07] bg-ink-900/50 p-3">
                      <div className="mb-1.5 flex items-center justify-between text-[11px] text-gray-500">
                        <span>
                          {formatDuration(seg.start)} → {formatDuration(seg.end)}
                        </span>
                        <button
                          onClick={() => {
                            setSegments((prev) => prev.filter((_, j) => j !== i));
                            markDirty();
                          }}
                          className="text-gray-600 transition hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <textarea
                        className="w-full resize-none rounded-lg border border-white/10 bg-ink-950/60 px-2.5 py-1.5 text-sm text-gray-200 outline-none focus:border-brand-400/60"
                        rows={2}
                        value={seg.text}
                        onChange={(e) => {
                          const text = e.target.value;
                          setSegments((prev) => prev.map((s, j) => (j === i ? { ...s, text } : s)));
                          markDirty();
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {tab === 'style' && (
            <Card>
              <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
                <Palette className="h-5 w-5 text-brand-300" /> Caption style
              </h2>
              <div className="mt-4 space-y-4">
                <Select
                  label="Font"
                  value={style.fontFamily}
                  onChange={(e) => setStyleField('fontFamily', e.target.value)}
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </Select>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="label mb-0">Font size</p>
                    <span className="text-xs font-bold text-brand-300">{style.fontSize}</span>
                  </div>
                  <input
                    type="range"
                    min={28}
                    max={96}
                    value={style.fontSize}
                    onChange={(e) => setStyleField('fontSize', parseInt(e.target.value, 10))}
                    className="w-full"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <ColorField label="Text" value={style.primaryColor} onChange={(v) => setStyleField('primaryColor', v)} />
                  <ColorField label="Highlight" value={style.highlightColor} onChange={(v) => setStyleField('highlightColor', v)} />
                  <ColorField label="Outline" value={style.outlineColor} onChange={(v) => setStyleField('outlineColor', v)} />
                </div>
                <Select
                  label="Position"
                  value={style.position}
                  onChange={(e) => setStyleField('position', e.target.value as ClipStyle['position'])}
                >
                  <option value="bottom">Bottom</option>
                  <option value="middle">Middle</option>
                  <option value="top">Top</option>
                </Select>
                <Select
                  label="Animation"
                  value={style.animation}
                  onChange={(e) => setStyleField('animation', e.target.value as ClipStyle['animation'])}
                >
                  <option value="pop">Pop</option>
                  <option value="fade">Fade</option>
                  <option value="karaoke">Karaoke word-by-word</option>
                  <option value="none">None</option>
                </Select>
                <Toggle checked={style.bold} onChange={(v) => setStyleField('bold', v)} label="Bold text" />
                <Toggle
                  checked={style.uppercase}
                  onChange={(v) => setStyleField('uppercase', v)}
                  label="UPPERCASE"
                  description="All caption text in caps"
                />
                <Toggle
                  checked={style.backgroundBox}
                  onChange={(v) => setStyleField('backgroundBox', v)}
                  label="Background box"
                  description="Semi-transparent panel behind captions"
                />
              </div>
            </Card>
          )}

          {tab === 'overlays' && (
            <Card>
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
                  <Layers className="h-5 w-5 text-brand-300" /> Text overlays
                </h2>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setOverlays((prev) => [
                      ...prev,
                      {
                        id: Math.random().toString(36).slice(2, 10),
                        text: 'New overlay',
                        start: 0,
                        end: Math.min(3, end - start),
                        position: 'top',
                        color: '#FFFFFF',
                        size: 100,
                      },
                    ]);
                    markDirty();
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
              {overlays.length === 0 ? (
                <p className="mt-4 rounded-xl border border-white/[0.07] bg-ink-900/50 px-4 py-6 text-center text-sm text-gray-500">
                  No overlays — add text like calls-to-action or captions emphasis.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {overlays.map((ov, i) => (
                    <div key={ov.id} className="rounded-xl border border-white/[0.07] bg-ink-900/50 p-3.5">
                      <div className="flex items-start gap-2">
                        <input
                          className="input-base flex-1 py-1.5 text-sm"
                          value={ov.text}
                          onChange={(e) => {
                            const text = e.target.value;
                            setOverlays((prev) => prev.map((o, j) => (j === i ? { ...o, text } : o)));
                            markDirty();
                          }}
                        />
                        <button
                          onClick={() => {
                            setOverlays((prev) => prev.filter((_, j) => j !== i));
                            markDirty();
                          }}
                          className="rounded-lg p-2 text-gray-500 hover:bg-white/10 hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-2.5 grid grid-cols-3 gap-2">
                        <Input
                          type="number"
                          step="0.1"
                          min={0}
                          value={ov.start}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value) || 0;
                            setOverlays((prev) => prev.map((o, j) => (j === i ? { ...o, start: v } : o)));
                            markDirty();
                          }}
                        />
                        <Input
                          type="number"
                          step="0.1"
                          min={0}
                          value={ov.end}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value) || 0;
                            setOverlays((prev) => prev.map((o, j) => (j === i ? { ...o, end: v } : o)));
                            markDirty();
                          }}
                        />
                        <select
                          className="input-base py-1.5 text-xs"
                          value={ov.position}
                          onChange={(e) => {
                            const v = e.target.value as TextOverlay['position'];
                            setOverlays((prev) => prev.map((o, j) => (j === i ? { ...o, position: v } : o)));
                            markDirty();
                          }}
                        >
                          <option value="top">Top</option>
                          <option value="middle">Middle</option>
                          <option value="bottom">Bottom</option>
                        </select>
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-gray-500">Times are relative to the clip start.</p>
                </div>
              )}
            </Card>
          )}

          {tab === 'output' && (
            <Card>
              <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
                <Settings2 className="h-5 w-5 text-brand-300" /> Output settings
              </h2>
              <div className="mt-4 space-y-4">
                <Select
                  label="Aspect ratio"
                  value={style.aspect}
                  onChange={(e) => setStyleField('aspect', e.target.value as ClipStyle['aspect'])}
                >
                  <option value="9:16">9:16 — Vertical (TikTok/Shorts/Reels)</option>
                  <option value="4:5">4:5 — Portrait</option>
                  <option value="1:1">1:1 — Square</option>
                  <option value="16:9">16:9 — Landscape</option>
                </Select>
                <Select
                  label="Export resolution"
                  value={String(style.exportHeight)}
                  onChange={(e) => setStyleField('exportHeight', parseInt(e.target.value, 10))}
                >
                  <option value="1280">720p (1280 long side)</option>
                  <option value="1920">1080p (1920 long side)</option>
                </Select>
                <Toggle
                  checked={style.removeSilences}
                  onChange={(v) => setStyleField('removeSilences', v)}
                  label="Remove silences"
                  description="Compress pauses with jump cuts"
                />
                <Toggle
                  checked={style.removeFillers}
                  onChange={(v) => setStyleField('removeFillers', v)}
                  label="Remove filler words"
                  description="Cuts ums & uhs using word timings"
                />
                <div className="rounded-xl border border-white/[0.07] bg-ink-900/50 p-3.5">
                  <p className="text-xs text-gray-400">
                    Rendered size: <b className="text-gray-200">{clip.width ?? '—'}×{clip.height ?? '—'}</b>
                    {clip.size_bytes ? <> · {(clip.size_bytes / 1024 / 1024).toFixed(1)} MB</> : null}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {tab === 'meta' && (
            <Card>
              <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
                <FileText className="h-5 w-5 text-brand-300" /> Clip info
              </h2>
              <div className="mt-4 space-y-4">
                <Input label="Title" value={title} onChange={(e) => { setTitle(e.target.value); markDirty(); }} />
                <Textarea label="Hook" value={hook} onChange={(e) => { setHook(e.target.value); markDirty(); }} />
                <Textarea
                  label="Description"
                  value={description}
                  rows={4}
                  onChange={(e) => { setDescription(e.target.value); markDirty(); }}
                />
                <Input
                  label="Hashtags"
                  value={hashtags}
                  onChange={(e) => { setHashtags(e.target.value); markDirty(); }}
                  hint="Space-separated, e.g. #shorts #marketing"
                />
                <div className="rounded-xl border border-white/[0.07] bg-ink-900/50 p-3.5 text-xs text-gray-400">
                  Metadata provider:{' '}
                  <b className="text-gray-200">
                    {clip.metadata_provider === 'gemini' ? 'Gemini AI' : 'Local extractive'}
                  </b>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Timeline */

function Timeline({
  duration,
  start,
  end,
  segments,
  onChange,
}: {
  duration: number;
  start: number;
  end: number;
  segments: TranscriptSegment[];
  onChange: (start: number, end: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'start' | 'end' | 'body' | null>(null);
  const dragOffset = useRef(0);

  const toTime = useCallback(
    (clientX: number) => {
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect || !duration) return 0;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration],
  );

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const t = toTime(e.clientX);
      if (dragging === 'start') onChange(Math.min(t, end - 0.5), end);
      else if (dragging === 'end') onChange(start, Math.max(t, start + 0.5));
      else {
        const len = end - start;
        const newStart = Math.max(0, Math.min(duration - len, t - dragOffset.current));
        onChange(newStart, newStart + len);
      }
    };
    const up = () => setDragging(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging, start, end, duration, onChange, toTime]);

  const pct = (t: number) => (duration ? (t / duration) * 100 : 0);

  return (
    <div>
      <div
        ref={barRef}
        className="relative h-20 cursor-pointer select-none rounded-xl border border-white/10 bg-ink-950"
        onPointerDown={(e) => {
          const t = toTime(e.clientX);
          if (t >= start && t <= end) {
            dragOffset.current = t - start;
            setDragging('body');
          }
        }}
      >
        {/* transcript segments as ticks */}
        {segments.map((s, i) => (
          <div
            key={i}
            className="absolute top-2 h-4 rounded-sm bg-brand-400/20"
            style={{ left: `${pct(s.start)}%`, width: `${Math.max(0.4, pct(s.end) - pct(s.start))}%` }}
            title={s.text}
          />
        ))}
        {/* selection */}
        <div
          className="absolute inset-y-0 rounded-lg border border-brand-400/70 bg-brand-500/20"
          style={{ left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%` }}
        >
          <div
            className="absolute -left-1.5 inset-y-2 w-3 cursor-ew-resize rounded bg-brand-400 shadow-glow"
            onPointerDown={(e) => {
              e.stopPropagation();
              setDragging('start');
            }}
          />
          <div
            className="absolute -right-1.5 inset-y-2 w-3 cursor-ew-resize rounded bg-brand-400 shadow-glow"
            onPointerDown={(e) => {
              e.stopPropagation();
              setDragging('end');
            }}
          />
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-gray-600">
        <span>0:00</span>
        <span>{formatDuration(duration / 2)}</span>
        <span>{formatDuration(duration)}</span>
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-ink-900/80 p-1.5">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <span className="text-xs text-gray-400">{value}</span>
      </div>
    </div>
  );
}
