'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap } from 'lucide-react';
import { Button, Input, useToast } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client';

export default function SignupPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(e.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }
    try {
      await api('/api/auth/register', {
        method: 'POST',
        json: {
          email: form.get('email'),
          password,
          name: form.get('name'),
        },
      });
      toast.push('success', 'Account created — welcome to ClipGenius AI!');
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Signup failed');
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
          <h1 className="font-display text-2xl font-bold text-white">Create your account</h1>
          <p className="mt-1.5 text-sm text-gray-400">
            Free plan included — start generating clips in minutes.
          </p>
          <form onSubmit={submit} className="mt-7 space-y-4">
            <Input label="Name" name="name" placeholder="Your name" />
            <Input label="Email" name="email" type="email" required placeholder="you@example.com" />
            <Input
              label="Password"
              name="password"
              type="password"
              required
              placeholder="At least 8 characters"
              hint="Use 8+ characters with a mix of letters and numbers."
            />
            {error && (
              <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
                {error}
              </p>
            )}
            <Button type="submit" loading={loading} className="w-full" size="lg">
              Create account
            </Button>
          </form>
        </div>
        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-brand-300 hover:text-brand-200">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
