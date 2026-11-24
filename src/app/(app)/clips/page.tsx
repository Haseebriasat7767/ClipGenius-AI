'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Film,
  Search,
  Download,
  Clock,
  Trash2,
  Sparkles,
  Filter,
} from 'lucide-react';
import { Badge, Button, Card, Modal, Select, Spinner, useToast } from '@/components/ui';
import { api, ApiClientError, usePolling, mediaUrl, downloadUrl } from '@/lib/client';
import { formatDuration, timeAgo } from '@/lib/utils';

interface ClipRow {
  id: string;
  title: string;
  hook: string;
  description: string;
  hashtags: string[];
  duration_seconds: number;
  score: number;
  rank: number;
  status: string;
  thumbnail_path: string | null;
  video_path: string | null;
  metadata_provider: string | null;
  created_at: string;
  project_id: string;
  project_title?: string;
}

export default function ClipsLibraryPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ClipRow | null>(null);
  const [busy, setBusy] = useState(false);

  const data = usePolling<{ clips: ClipRow[] }>(() => api('/api/clips'), 8000, true);

  const clips = (data?.clips ?? []).filter((c) => {
    const matchesSearch =
      !search ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      (c.hook ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !statusFilter || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api(`/api/clips/${deleteTarget.id}`, { method: 'DELETE' });
      toast.push('success', 'Clip deleted');
      setDeleteTarget(null);
    } catch (err) {
      toast.push('error', err instanceof ApiClientError ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const download = (clip: ClipRow) => {
    const a = document.createElement('a');
    a.href = downloadUrl(clip.id);
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 animate-fade-up">
      <div>
        <h1 className="font-display text-3xl font-bold text-white">Clip library</h1>
        <p className="mt-1.5 text-gray-400">
          All your generated clips — preview, edit, and download.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            className="input-base pl-10"
            placeholder="Search clips…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-44">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="ready">Ready</option>
            <option value="rendering">Rendering</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </Select>
        </div>
      </div>

      {!data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : clips.length === 0 ? (
        <Card className="py-16 text-center">
          <Film className="mx-auto mb-4 h-12 w-12 text-gray-600" />
          <p className="font-display text-lg font-bold text-white">No clips found</p>
          <p className="mt-1.5 text-sm text-gray-500">
            {search || statusFilter
              ? 'Try adjusting your filters.'
              : 'Generate your first clips from a video project.'}
          </p>
          {!search && !statusFilter && (
            <Link href="/projects/new" className="btn-primary mt-6 inline-flex">
              <Sparkles className="h-4 w-4" /> Create clips
            </Link>
          )}
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {clips.map((clip) => (
            <div key={clip.id} className="card card-hover group overflow-hidden p-0">
              <Link href={`/clips/${clip.id}`} className="block">
                <div className="relative aspect-[9/16] overflow-hidden bg-ink-900">
                  {clip.thumbnail_path ? (
                    <img
                      src={mediaUrl(clip.thumbnail_path)}
                      alt={clip.title}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      {clip.status === 'failed' ? (
                        <Badge color="red">failed</Badge>
                      ) : (
                        <Spinner />
                      )}
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent p-4 pt-12">
                    <p className="line-clamp-2 text-sm font-bold text-white">{clip.title}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge color="purple">#{clip.rank}</Badge>
                      <span className="flex items-center gap-1 text-[11px] text-gray-300">
                        <Clock className="h-3 w-3" /> {formatDuration(clip.duration_seconds)}
                      </span>
                      {clip.metadata_provider === 'gemini' && (
                        <Badge color="blue">AI</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
              <div className="flex items-center gap-2 p-3.5">
                <Link href={`/clips/${clip.id}`} className="btn-secondary flex-1 py-2 text-xs">
                  Edit
                </Link>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={clip.status !== 'ready'}
                  onClick={() => download(clip)}
                  title="Download MP4"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(clip)} title="Delete">
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete clip?">
        <p className="text-sm text-gray-300">
          Delete <b className="text-white">{deleteTarget?.title}</b> and its rendered video
          permanently?
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={remove}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
