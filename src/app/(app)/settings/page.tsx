'use client';

import { useEffect, useState } from 'react';
import { User, KeyRound, Activity, ShieldCheck, Save } from 'lucide-react';
import { Badge, Button, Card, Input, useToast, cn } from '@/components/ui';
import { api, ApiClientError, useSession, usePolling } from '@/lib/client';
import { formatBytes, timeAgo } from '@/lib/utils';

interface UsageHistory {
  month: string;
  clips_generated: number;
  minutes_processed: number;
  renders: number;
  storage_bytes: number;
}

export default function SettingsPage() {
  const toast = useToast();
  const { user, plan, usage, refresh } = useSession();
  const [name, setName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');

  const usageData = usePolling<{ plan: unknown; usage: { clips_generated: number; projects_this_month: number }; history: UsageHistory[] }>(
    () => api('/api/usage'),
    60_000,
    !!user,
  );

  useEffect(() => {
    if (user?.name !== undefined) setName(user.name);
  }, [user]);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await api('/api/auth/me', { method: 'PATCH', json: { name } });
      toast.push('success', 'Profile updated');
      refresh();
    } catch (err) {
      toast.push('error', err instanceof ApiClientError ? err.message : 'Update failed');
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPwBusy(true);
    setPwError('');
    const form = new FormData(e.currentTarget);
    const currentPassword = String(form.get('current') ?? '');
    const newPassword = String(form.get('next') ?? '');
    const confirm = String(form.get('confirm') ?? '');
    if (newPassword.length < 8) {
      setPwError('New password must be at least 8 characters');
      setPwBusy(false);
      return;
    }
    if (newPassword !== confirm) {
      setPwError('New passwords do not match');
      setPwBusy(false);
      return;
    }
    try {
      await api('/api/auth/change-password', { method: 'POST', json: { currentPassword, newPassword } });
      toast.push('success', 'Password changed');
      (e.target as HTMLFormElement).reset();
    } catch (err) {
      setPwError(err instanceof ApiClientError ? err.message : 'Change failed');
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 animate-fade-up">
      <div>
        <h1 className="font-display text-3xl font-bold text-white">Settings</h1>
        <p className="mt-1.5 text-gray-400">Your profile, security and usage history.</p>
      </div>

      {/* Profile */}
      <Card>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
          <User className="h-5 w-5 text-brand-300" /> Profile
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Email" value={user?.email ?? ''} disabled />
        </div>
        <div className="mt-5 flex items-center gap-3">
          <Button onClick={saveProfile} loading={savingProfile}>
            <Save className="h-4 w-4" /> Save profile
          </Button>
          <Badge color="purple">{plan?.name ?? 'Free'} plan</Badge>
          {user?.role === 'admin' && <Badge color="blue">Admin</Badge>}
        </div>
      </Card>

      {/* Password */}
      <Card>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
          <KeyRound className="h-5 w-5 text-brand-300" /> Change password
        </h2>
        <form onSubmit={changePassword} className="mt-5 grid gap-4 sm:grid-cols-3">
          <Input label="Current password" name="current" type="password" required />
          <Input label="New password" name="next" type="password" required />
          <Input label="Confirm new" name="confirm" type="password" required />
          {pwError && (
            <p className="sm:col-span-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
              {pwError}
            </p>
          )}
          <div className="sm:col-span-3">
            <Button type="submit" loading={pwBusy}>
              Update password
            </Button>
          </div>
        </form>
      </Card>

      {/* Usage history */}
      <Card>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
          <Activity className="h-5 w-5 text-brand-300" /> Usage history
        </h2>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-gray-500">
                <th className="pb-3 pr-4 font-semibold">Month</th>
                <th className="pb-3 pr-4 font-semibold">Clips</th>
                <th className="pb-3 pr-4 font-semibold">Minutes</th>
                <th className="pb-3 pr-4 font-semibold">Renders</th>
                <th className="pb-3 font-semibold">Storage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {(usageData?.history ?? []).map((h) => (
                <tr key={h.month}>
                  <td className="py-3 pr-4 font-medium text-gray-200">{h.month}</td>
                  <td className="py-3 pr-4 text-gray-400">{h.clips_generated}</td>
                  <td className="py-3 pr-4 text-gray-400">{Number(h.minutes_processed).toFixed(1)}</td>
                  <td className="py-3 pr-4 text-gray-400">{h.renders}</td>
                  <td className="py-3 text-gray-400">{formatBytes(Number(h.storage_bytes))}</td>
                </tr>
              ))}
              {!usageData?.history?.length && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500">
                    No usage recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Security note */}
      <Card>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
          <ShieldCheck className="h-5 w-5 text-brand-300" /> Data & privacy
        </h2>
        <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-gray-400">
          <li>• Your videos and clips are visible only to your account (enforced server-side).</li>
          <li>• Passwords are hashed with bcrypt; sessions use signed HTTP-only cookies.</li>
          <li>• API keys for AI and payments live only on the server.</li>
          <li>• Deleting a project removes its media and rendered clips from storage.</li>
        </ul>
      </Card>
    </div>
  );
}
