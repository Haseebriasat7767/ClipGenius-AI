'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Film,
  Play,
  RefreshCcw,
  Sparkles,
  Trash2,
  AlertTriangle,
  Clock,
  Scissors,
  Volume2,
  Brain,
} from 'lucide-react';
import { Badge, Button, Card, Modal, Progress, Spinner, useToast, cn } from '@/components/ui';
import { api, ApiClientError, usePolling, mediaUrl } from '@/lib/client';
import { formatDuration, formatBytes, timeAgo } from '@/lib/utils';

interface ClipRow {
  id: string;
  title: string;
  hook: string;
  duration_seconds: number;
  score: number;
  rank: number;
  status: string;
  error: string | null;
  thumbnail_path: string | null;
  video_path: string | null;
  metadata_provider: string | null;
  width: number | null;
  height: number | null;
}

interface ProjectDetail {
  project: {
    id: string;
    title: string;
    status: string;
    progress: number;
    stage: string;
    error: string | null;
    duration_seconds: number | null;
    width: number | null;
    height: number | null;
    fps: number | null;
    size_bytes: number | null;
    video_codec: string | null;
    audio_codec: string | null;
    source_path: string | null;
    source_type: string;
    source_url: string | null;
    clips_count: number;
    settings: Record<string, unknown>;
    analysis: {
      silences?: unknown[];
      sceneCuts?: unknown[];
      transcriptProvider?: string;
      transcriptLanguage?: string | null;
      transcript?: unknown[];
      warnings?: string[];
      meanDb?: number;
      hasSpeech?: boolean;
    };
    created_at: string;
  };
  clips: ClipRow[];
  jobs: Array<{
    id: string;
    type: string;
    status: string;
    progress: number;
    stage: string;
    error: string | null;
    created_at: string;
  }>;
}

const STATUS_COLORS: Record<string, 'green' | 'yellow' | 'red' | 'purple' | 'blue' | 'default'> = {
  completed: 'green',
  processing: 'blue',
  queued: 'yellow',
  failed: 'red',
  draft: 'default',
};

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const toast = useToast();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const data = usePolling<ProjectDetail>(() => api(`/api/projects/${id}`), 4000, true);
  const p = data?.project;

  const reprocess = async () => {
    setBusy(true);
    try {
      await api(`/api/projects/${id}/process`, { method: 'POST' });
      toast.push('success', 'Analysis re-queued');
    } catch (err) {
      toast.push('error', err instanceof ApiClientError ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/projects/${id}`, { method: 'DELETE' });
      toast.push('success', 'Project deleted');
      router.push('/projects');
    } catch (err) {
      toast.push('error', err instanceof ApiClientError ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  if (!data || !p) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const isActive = p.status === 'processing' || p.status === 'queued';
  const analysis = p.analysis ?? {};

  return (
    <div className="mx-auto max-w-6xl space-y-8 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/projects"
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-400 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Back to projects
          </Link>
          <h1 className="font-display text-3xl font-bold text-white">{p.title}</h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
            <Badge color={STATUS_COLORS[p.status] ?? 'default'}>{p.status}</Badge>
            {p.duration_seconds ? (
              <span className="flex items-center gap-1.5 text-sm text-gray-400">
                <Clock className="h-4 w-4" /> {formatDuration(p.duration_seconds)}
              </span>
            ) : null}
            {p.width ? (
              <span className="text-sm text-gray-400">
                {p.width}×{p.height}
                {p.fps ? ` · ${Math.round(p.fps)}fps` : ''}
              </span>
            ) : null}
            {p.size_bytes ? (
              <span className="text-sm text-gray-400">{formatBytes(p.size_bytes)}</span>
            ) : null}
            <span className="text-sm text-gray-500">{timeAgo(p.created_at)}</span>
          </div>
        </div>
        <div className="flex gap-2.5">
          <Button variant="secondary" onClick={reprocess} loading={busy}>
            <RefreshCcw className="h-4 w-4" /> Re-process
          </Button>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </div>

      {/* Progress */}
      {isActive && (
        <Card className="border-brand-400/30">
          <div className="flex items-center gap-4">
            <Sparkles className="h-8 w-8 animate-pulse-soft text-brand-300" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="font-medium text-white">{p.stage || 'Processing…'}</p>
                <p className="text-sm font-bold text-brand-300">{p.progress}%</p>
              </div>
              <Progress value={p.progress} className="mt-2.5" />
            </div>
          </div>
        </Card>
      )}

      {/* Failure */}
      {p.status === 'failed' && (
        <Card className="border-danger/40">
          <div className="flex items-start gap-4">
            <AlertTriangle className="mt-1 h-7 w-7 shrink-0 text-danger" />
            <div>
              <p className="font-display text-lg font-bold text-white">Processing failed</p>
              <p className="mt-1.5 text-sm text-gray-300">{p.error}</p>
              <Button className="mt-4" onClick={reprocess} loading={busy}>
                <RefreshCcw className="h-4 w-4" /> Try again
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Warnings */}
      {Array.isArray(analysis.warnings) && analysis.warnings.length > 0 && (
        <Card className="border-warning/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="space-y-1.5">
              {analysis.warnings.map((w: string, i: number) => (
                <p key={i} className="text-sm text-gray-300">{w}</p>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Source preview + analysis summary */}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="font-display text-lg font-bold text-white">Source video</h2>
          {p.source_path ? (
            <video
              controls
              preload="metadata"
              className="mt-4 w-full rounded-xl border border-white/10 bg-black"
              src={mediaUrl(p.source_path)}
            />
          ) : (
            <div className="mt-4 rounded-xl border border-white/10 bg-ink-900 p-8 text-center text-sm text-gray-500">
              {p.source_type === 'url' ? (
                <>Remote source: <span className="break-all text-gray-400">{p.source_url}</span></>
              ) : (
                'Source media unavailable'
              )}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="font-display text-lg font-bold text-white">Analysis</h2>
          <div className="mt-4 space-y-3.5">
            <InfoRow icon={Scissors} label="Scene cuts detected" value={String(analysis.sceneCuts?.length ?? 0)} />
            <InfoRow icon={Volume2} label="Silences detected" value={String(analysis.silences?.length ?? 0)} />
            <InfoRow
              icon={Brain}
              label="Speech transcript"
              value={
                analysis.transcriptProvider === 'gemini'
                  ? `Gemini (${(analysis.transcript ?? []).length} segments)`
                  : analysis.hasSpeech
                    ? 'Acoustic only (add GEMINI_API_KEY for captions)'
                    : 'No speech detected'
              }
            />
            <InfoRow icon={Film} label="Clips generated" value={String(data.clips.length)} />
            <InfoRow
              icon={Play}
              label="Settings"
              value={`${(p.settings?.clipLengthSec as number) ?? 30}s × ${p.settings?.clipCount ?? 8} · ${p.settings?.aspect ?? '9:16'}`}
            />
          </div>
        </Card>
      </div>

      {/* Clips */}
      <div>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-white">
            Generated clips <span className="text-gray-500">({data.clips.length})</span>
          </h2>
        </div>

        {data.clips.length === 0 ? (
          <Card className="py-14 text-center">
            {isActive ? (
              <>
                <Spinner className="mx-auto mb-4 h-8 w-8" />
                <p className="text-gray-400">Clips will appear here as soon as analysis finishes…</p>
              </>
            ) : (
              <>
                <Film className="mx-auto mb-4 h-12 w-12 text-gray-600" />
                <p className="text-gray-400">No clips yet — run processing to generate them.</p>
              </>
            )}
          </Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.clips.map((clip) => (
              <Link key={clip.id} href={`/clips/${clip.id}`} className="card card-hover group overflow-hidden p-0">
                <div className="relative aspect-[9/16] overflow-hidden bg-ink-900">
                  {clip.thumbnail_path ? (
                    <img
                      src={mediaUrl(clip.thumbnail_path)}
                      alt={clip.title}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      {clip.status === 'rendering' || clip.status === 'pending' ? (
                        <Spinner />
                      ) : (
                        <Film className="h-10 w-10 text-gray-700" />
                      )}
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3.5 pt-10">
                    <p className="line-clamp-2 text-sm font-bold text-white">{clip.title}</p>
                  </div>
                  <div className="absolute left-2.5 top-2.5 flex gap-1.5">
                    <Badge color="purple">#{clip.rank}</Badge>
                    <Badge color="default">{formatDuration(clip.duration_seconds)}</Badge>
                  </div>
                  {clip.status !== 'ready' && (
                    <div className="absolute right-2.5 top-2.5">
                      <Badge color={clip.status === 'failed' ? 'red' : 'blue'}>{clip.status}</Badge>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete project?">
        <p className="text-sm text-gray-300">
          This permanently removes the project, all {data.clips.length} clips and their rendered
          files. This cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={remove}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-ink-900/40 px-3.5 py-2.5">
      <span className="flex items-center gap-2.5 text-sm text-gray-400">
        <Icon className="h-4 w-4 text-brand-300" /> {label}
      </span>
      <span className="text-sm font-medium text-gray-200">{value}</span>
    </div>
  );
}
