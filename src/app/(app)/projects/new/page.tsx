'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  UploadCloud,
  Link2,
  Film,
  X,
  Sparkles,
  Scissors,
  AlertTriangle,
  CheckCircle2,
  FileVideo,
} from 'lucide-react';
import {
  Button,
  Card,
  Input,
  Toggle,
  Select,
  Tabs,
  Badge,
  useToast,
  Progress,
  cn,
} from '@/components/ui';
import { api, ApiClientError, useSession } from '@/lib/client';
import { formatBytes } from '@/lib/utils';

type ClipLength = 15 | 30 | 45 | 60;

interface Uploaded {
  uploadId: string;
  key: string;
  fileName: string;
  sizeBytes: number;
}

export default function NewProjectPage() {
  const router = useRouter();
  const toast = useToast();
  const { plan } = useSession();
  const [tab, setTab] = useState('upload');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploaded, setUploaded] = useState<Uploaded | null>(null);
  const [urlValue, setUrlValue] = useState('');
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  // settings
  const [clipLength, setClipLength] = useState<ClipLength>(30);
  const [clipCount, setClipCount] = useState(8);
  const [aspect, setAspect] = useState<'9:16' | '4:5' | '1:1' | '16:9'>('9:16');
  const [removeSilences, setRemoveSilences] = useState(true);
  const [removeFillers, setRemoveFillers] = useState(false);

  const doUpload = useCallback(
    (file: File) => {
      setError('');
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!['mp4', 'mov', 'webm', 'm4v'].includes(ext)) {
        setError('Unsupported file type — only MP4, MOV and WEBM are accepted.');
        return;
      }
      setUploading(true);
      setUploadPct(0);
      setUploaded(null);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/uploads');
      xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));
      xhr.setRequestHeader('content-type', file.type || 'video/mp4');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        setUploading(false);
        try {
          const res = JSON.parse(xhr.responseText);
          if (!res.ok) {
            setError(res.error?.message ?? 'Upload failed');
            return;
          }
          setUploaded(res.data as Uploaded);
          if (!title) setTitle(file.name.replace(/\.[^.]+$/, '').slice(0, 120));
          toast.push('success', 'Upload complete — ready to process');
        } catch {
          setError('Upload failed — unexpected server response');
        }
      };
      xhr.onerror = () => {
        setUploading(false);
        setError('Upload failed — network error');
      };
      xhr.send(file);
    },
    [title, toast],
  );

  const create = async () => {
    setError('');
    setCreating(true);
    try {
      const payload = {
        title: title.trim() || (uploaded?.fileName ?? 'Untitled video').replace(/\.[^.]+$/, ''),
        ...(tab === 'upload' ? { uploadKey: uploaded?.key } : { url: urlValue.trim() }),
        settings: { clipLengthSec: clipLength, clipCount, aspect, removeSilences, removeFillers },
      };
      const res = await api<{ project: { id: string } }>('/api/projects', {
        method: 'POST',
        json: payload,
      });
      toast.push('success', 'Project created — analysis started');
      router.push(`/projects/${res.project.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 animate-fade-up">
      <div>
        <h1 className="font-display text-3xl font-bold text-white">Create new clips</h1>
        <p className="mt-1.5 text-gray-400">
          Upload a video or paste a direct link — ClipGenius AI will find the best moments and edit
          them into vertical clips.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        {/* Left: source */}
        <div className="space-y-6">
          <Card>
            <Tabs
              tabs={[
                { id: 'upload', label: 'Upload file' },
                { id: 'url', label: 'Video URL' },
              ]}
              active={tab}
              onChange={(t) => {
                setTab(t);
                setError('');
              }}
            />

            {tab === 'upload' ? (
              <div className="mt-5">
                {!uploaded ? (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) doUpload(file);
                    }}
                    onClick={() => !uploading && fileInput.current?.click()}
                    className={cn(
                      'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition',
                      dragOver
                        ? 'border-brand-400 bg-brand-400/10'
                        : 'border-white/10 bg-ink-900/40 hover:border-brand-400/50 hover:bg-white/[0.02]',
                    )}
                  >
                    <input
                      ref={fileInput}
                      type="file"
                      accept=".mp4,.mov,.webm,.m4v,video/mp4,video/quicktime,video/webm"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) doUpload(file);
                      }}
                    />
                    {uploading ? (
                      <div className="w-full max-w-sm">
                        <UploadCloud className="mx-auto mb-4 h-10 w-10 animate-pulse-soft text-brand-300" />
                        <p className="text-sm font-medium text-gray-200">Uploading… {uploadPct}%</p>
                        <Progress value={uploadPct} className="mt-3" />
                      </div>
                    ) : (
                      <>
                        <UploadCloud className="mb-4 h-12 w-12 text-brand-300" />
                        <p className="font-display text-lg font-bold text-white">
                          Drag & drop your video here
                        </p>
                        <p className="mt-1.5 text-sm text-gray-500">
                          or click to browse — MP4, MOV or WEBM
                          {plan && <> · up to {plan.maxUploadMb} MB</>}
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="mt-5 flex items-center gap-4 rounded-2xl border border-success/30 bg-success/[0.06] p-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success/15">
                      <FileVideo className="h-6 w-6 text-success" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-gray-100">{uploaded.fileName}</p>
                      <p className="text-xs text-gray-500">{formatBytes(uploaded.sizeBytes)} uploaded</p>
                    </div>
                    <CheckCircle2 className="h-6 w-6 text-success" />
                    <button
                      onClick={() => setUploaded(null)}
                      className="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <Input
                  label="Direct video URL"
                  placeholder="https://example.com/my-video.mp4"
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                  hint="Only direct MP4/MOV/WEBM file links are accepted."
                />
                <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/[0.08] px-4 py-3.5">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                  <p className="text-xs leading-relaxed text-gray-300">
                    <b className="text-warning">Copyright & platform policy:</b> links to YouTube, TikTok,
                    Instagram and similar platforms are rejected — we never bypass their protections.
                    If you hold the rights to the content, download the file and use{' '}
                    <button
                      type="button"
                      className="font-semibold text-brand-300 underline"
                      onClick={() => setTab('upload')}
                    >
                      direct upload
                    </button>{' '}
                    instead.
                  </p>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="font-display text-lg font-bold text-white">Project details</h2>
            <div className="mt-4">
              <Input
                label="Title"
                placeholder="e.g. Podcast episode 42 — growth tactics"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                hint="Used to organize your dashboard and clip filenames."
              />
            </div>
          </Card>
        </div>

        {/* Right: settings */}
        <div className="space-y-6">
          <Card>
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
              <Scissors className="h-5 w-5 text-brand-300" /> Clip settings
            </h2>

            <div className="mt-5">
              <p className="label">Clip length</p>
              <div className="grid grid-cols-4 gap-2">
                {([15, 30, 45, 60] as ClipLength[]).map((len) => (
                  <button
                    key={len}
                    onClick={() => setClipLength(len)}
                    className={cn(
                      'rounded-xl border px-2 py-2.5 text-sm font-semibold transition',
                      clipLength === len
                        ? 'border-brand-400 bg-brand-500/20 text-white shadow-glow'
                        : 'border-white/10 bg-ink-900/60 text-gray-400 hover:border-white/25',
                    )}
                  >
                    {len}s
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="label mb-0">Number of clips</p>
                <span className="rounded-lg bg-brand-500/20 px-2.5 py-1 text-xs font-bold text-brand-200">
                  {clipCount}
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={20}
                value={clipCount}
                onChange={(e) => setClipCount(parseInt(e.target.value, 10))}
                className="w-full"
              />
              <p className="mt-1.5 text-xs text-gray-500">5–20 clips per video</p>
            </div>

            <div className="mt-5">
              <Select label="Aspect ratio" value={aspect} onChange={(e) => setAspect(e.target.value as typeof aspect)}>
                <option value="9:16">9:16 — TikTok / Shorts / Reels</option>
                <option value="4:5">4:5 — Instagram feed</option>
                <option value="1:1">1:1 — Square</option>
                <option value="16:9">16:9 — YouTube</option>
              </Select>
            </div>

            <div className="mt-5 space-y-3">
              <Toggle
                checked={removeSilences}
                onChange={setRemoveSilences}
                label="Remove silences"
                description="Jump-cuts long pauses automatically"
              />
              <Toggle
                checked={removeFillers}
                onChange={setRemoveFillers}
                label="Remove filler words"
                description="Cuts ums & uhs (needs AI transcription)"
              />
            </div>
          </Card>

          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3.5">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
              <p className="text-sm text-gray-200">{error}</p>
            </div>
          )}

          <Button
            size="lg"
            className="w-full"
            loading={creating}
            disabled={!canCreatingReady(tab, uploaded, urlValue, uploading)}
            onClick={create}
          >
            <Sparkles className="h-5 w-5" /> Generate clips
          </Button>
          <p className="text-center text-xs text-gray-500">
            Processing runs in the background — you can close this page safely.
          </p>
        </div>
      </div>
    </div>
  );
}

function canCreatingReady(
  tab: string,
  uploaded: Uploaded | null,
  url: string,
  uploading: boolean,
): boolean {
  if (uploading) return false;
  return tab === 'upload' ? !!uploaded : url.trim().length > 5;
}
