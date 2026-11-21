'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Zap, KeyRound, CheckCircle2 } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client';

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ message: string; devLink?: string } | null>(null);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(e.currentTarget);
    try {
      const res = await api<{ message: string; dev_mode?: boolean; reset_link?: string }>(
        '/api/auth/forgot-password',
        { method: 'POST', json: { email: form.get('email') } },
      );
      setDone({ message: res.message, devLink: res.reset_link });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 bg-hero-radial px-4 py-10">
      <div className="w-full max-w-md animate-fade-up">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gradient shadow-glow">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <p className="font-display text-2xl font-bold text-white">
            ClipGenius <span className="gradient-text">AI</span>
          </p>
        </Link>
        <div className="card p-8">
          <div className="mb-5 inline-flex rounded-2xl bg-brand-gradient-soft p-3">
            <KeyRound className="h-6 w-6 text-brand-300" />
          </div>
          <h1 className="font-display text-2xl font-bold text-white">Reset your password</h1>
          <p className="mt-1.5 text-sm text-gray-400">
            Enter your account email and we&apos;ll send you a secure reset link.
          </p>

          {done ? (
            <div className="mt-7 space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3.5">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <p className="text-sm text-gray-200">{done.message}</p>
              </div>
              {done.devLink && (
                <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3.5">
                  <p className="text-xs font-semibold text-warning">Email is not configured on this deployment</p>
                  <p className="mt-1.5 text-xs text-gray-300">Use this one-time link to reset your password:</p>
                  <Link href={done.devLink} className="mt-2 block break-all text-xs font-semibold text-brand-300 hover:underline">
                    {done.devLink}
                  </Link>
                </div>
              )}
              <Link href="/login" className="btn-secondary w-full">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-7 space-y-4">
              <Input label="Email" name="email" type="email" required placeholder="you@example.com" />
              {error && (
                <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
                  {error}
                </p>
              )}
              <Button type="submit" loading={loading} className="w-full" size="lg">
                Send reset link
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
