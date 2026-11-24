'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Zap } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client';

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(e.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirm') ?? '');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }
    try {
      await api('/api/auth/reset-password', { method: 'POST', json: { token, password } });
      setDone(true);
      setTimeout(() => router.push('/login'), 1800);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
        This reset link is missing its token. Request a new one from the{' '}
        <Link href="/forgot-password" className="underline">
          forgot password
        </Link>{' '}
        page.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mt-7 space-y-4">
      <Input label="New password" name="password" type="password" required placeholder="At least 8 characters" />
      <Input label="Confirm password" name="confirm" type="password" required placeholder="Repeat it" />
      {error && (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>
      )}
      {done && (
        <p className="rounded-xl border border-success/30 bg-success/10 px-4 py-2.5 text-sm text-success">
          Password updated! Redirecting to sign in…
        </p>
      )}
      <Button type="submit" loading={loading} className="w-full" size="lg">
        Set new password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
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
          <h1 className="font-display text-2xl font-bold text-white">Choose a new password</h1>
          <p className="mt-1.5 text-sm text-gray-400">Your new password takes effect immediately.</p>
          <Suspense fallback={null}>
            <ResetForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
