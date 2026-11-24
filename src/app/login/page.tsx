'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, Mail, Lock, User } from 'lucide-react';
import { Button, Input, useToast } from '@/components/ui';
import { api, ApiClientError, probeConnectivity } from '@/lib/client';

function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
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
          <h1 className="font-display text-2xl font-bold text-white">{title}</h1>
          <p className="mt-1.5 text-sm text-gray-400">{subtitle}</p>
          <div className="mt-7">{children}</div>
        </div>
        <div className="mt-6 text-center text-sm text-gray-500">{footer}</div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(e.currentTarget);
    try {
      await api('/api/auth/login', {
        method: 'POST',
        json: { email: form.get('email'), password: form.get('password') },
      });
      toast.push('success', 'Welcome back!');
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
        if (err.code === 'network' || err.code === 'timeout') {
          probeConnectivity().then((diag) => setError(`${err.message} ${diag}`)).catch(() => {});
        }
      } else {
        setError('Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to keep creating viral clips."
      footer={
        <>
          New to ClipGenius?{' '}
          <Link href="/signup" className="font-semibold text-brand-300 hover:text-brand-200">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Input label="Email" name="email" type="email" required placeholder="you@example.com" />
        <Input label="Password" name="password" type="password" required placeholder="••••••••" />
        {error && (
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" loading={loading} className="w-full" size="lg">
          Sign in
        </Button>
        <p className="text-center">
          <Link href="/forgot-password" className="text-sm text-gray-400 hover:text-brand-300">
            Forgot your password?
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
