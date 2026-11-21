'use client';

import { useState } from 'react';
import {
  CreditCard,
  Check,
  Sparkles,
  ExternalLink,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { Badge, Button, Card, Progress, Spinner, useToast, cn } from '@/components/ui';
import { api, ApiClientError, useSession, usePolling } from '@/lib/client';
import { formatBytes } from '@/lib/utils';

interface Integration {
  id: string;
  name: string;
  configured: boolean;
  detail: string;
  setup?: string;
}

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    desc: 'Test the waters',
    features: ['5 clips / month', 'Videos up to 10 min', '720p exports', 'Auto captions', 'ClipGenius watermark'],
  },
  {
    id: 'creator',
    name: 'Creator',
    price: 19,
    desc: 'For consistent posters',
    features: ['50 clips / month', 'Videos up to 30 min', '1080×1920 exports', 'No watermark', 'Thumbnails & metadata'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 49,
    desc: 'For serious creators',
    features: ['200 clips / month', 'Videos up to 2 hours', 'Priority queue', 'Filler-word removal', 'Advanced caption styles'],
  },
  {
    id: 'agency',
    name: 'Agency',
    price: 99,
    desc: 'Teams & studios',
    features: ['1,000 clips / month', 'Videos up to 4 hours', 'Highest priority', 'Bulk workflows', 'Priority support'],
  },
];

export default function BillingPage() {
  const toast = useToast();
  const { user, plan, usage, refresh } = useSession();
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const status = usePolling<{ integrations: Integration[] }>(() => api('/api/system-status'), 60_000, true);

  const stripeIntegration = status?.integrations.find((i) => i.id === 'stripe');

  const subscribe = async (planId: string) => {
    setBusyPlan(planId);
    try {
      const res = await api<{ url: string }>('/api/billing/checkout', {
        method: 'POST',
        json: { plan: planId },
      });
      window.location.href = res.url;
    } catch (err) {
      toast.push('error', err instanceof ApiClientError ? err.message : 'Checkout failed');
      setBusyPlan(null);
    }
  };

  const openPortal = async () => {
    setBusyPlan('portal');
    try {
      const res = await api<{ url: string }>('/api/billing/portal', { method: 'POST' });
      window.location.href = res.url;
    } catch (err) {
      toast.push('error', err instanceof ApiClientError ? err.message : 'Portal failed');
    } finally {
      setBusyPlan(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 animate-fade-up">
      <div>
        <h1 className="font-display text-3xl font-bold text-white">Billing & plans</h1>
        <p className="mt-1.5 text-gray-400">
          Manage your subscription and see how your monthly allowance is used.
        </p>
      </div>

      {/* Current plan */}
      <Card className="border-brand-400/30">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient shadow-glow">
              <CreditCard className="h-7 w-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="font-display text-xl font-bold text-white">{plan?.name ?? 'Free'} plan</h2>
                <Badge color="purple">{user?.email}</Badge>
              </div>
              <p className="mt-1 text-sm text-gray-400">
                {plan && plan.priceMonthly > 0
                  ? `$${plan.priceMonthly}/month`
                  : 'No active paid subscription'}
              </p>
            </div>
          </div>
          {plan && plan.priceMonthly > 0 && (
            <Button variant="secondary" onClick={openPortal} loading={busyPlan === 'portal'}>
              Manage subscription <ExternalLink className="h-4 w-4" />
            </Button>
          )}
        </div>

        {plan && usage && (
          <div className="mt-7 grid gap-6 sm:grid-cols-3">
            <UsageMeter label="Clips used" used={usage.clips_generated} total={plan.clipsPerMonth} />
            <UsageMeter label="Projects" used={usage.projects_this_month} total={plan.maxProjectsPerMonth} />
            <UsageMeter
              label="Storage"
              used={formatBytes(usage.storage_bytes)}
              total="—"
              raw
            />
          </div>
        )}
      </Card>

      {/* Stripe status */}
      {stripeIntegration && !stripeIntegration.configured && (
        <Card className="border-warning/30">
          <div className="flex items-start gap-3.5">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-warning" />
            <div>
              <p className="font-semibold text-warning">Stripe is not configured on this deployment</p>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-300">{stripeIntegration.detail}</p>
              {stripeIntegration.setup && (
                <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-ink-950 p-4 text-xs leading-relaxed text-gray-400">
                  {stripeIntegration.setup}
                </pre>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Plans grid */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((p) => {
          const isCurrent = plan?.id === p.id;
          return (
            <Card
              key={p.id}
              className={cn('relative flex flex-col', isCurrent && 'border-brand-400/60 shadow-glow')}
            >
              {p.id === 'creator' && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-gradient px-4 py-1 text-[11px] font-bold text-white">
                  Most popular
                </div>
              )}
              <h3 className="font-display text-lg font-bold text-white">{p.name}</h3>
              <p className="text-sm text-gray-500">{p.desc}</p>
              <p className="mt-4">
                <span className="font-display text-4xl font-bold text-white">${p.price}</span>
                <span className="text-sm text-gray-500"> /month</span>
              </p>
              <ul className="mt-6 flex-1 space-y-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-7">
                {isCurrent ? (
                  <Button variant="secondary" className="w-full" disabled>
                    Current plan
                  </Button>
                ) : p.price === 0 ? (
                  <Button variant="secondary" className="w-full" disabled>
                    Downgrade via support
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    loading={busyPlan === p.id}
                    onClick={() => subscribe(p.id)}
                  >
                    <Sparkles className="h-4 w-4" /> Upgrade to {p.name}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* All integrations */}
      {status && (
        <Card>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
            <ShieldCheck className="h-5 w-5 text-brand-300" /> Integration status
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {status.integrations.map((i) => (
              <div
                key={i.id}
                className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-ink-900/50 p-4"
              >
                <span
                  className={cn(
                    'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
                    i.configured ? 'bg-success' : 'bg-warning',
                  )}
                />
                <div>
                  <p className="text-sm font-semibold text-gray-200">{i.name}</p>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">{i.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function UsageMeter({
  label,
  used,
  total,
  raw,
}: {
  label: string;
  used: number | string;
  total: number | string;
  raw?: boolean;
}) {
  const pct = !raw && typeof used === 'number' && typeof total === 'number'
    ? Math.min(100, (used / Math.max(1, total)) * 100)
    : 0;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-300">
          <b>{used}</b>
          {!raw && <span className="text-gray-500"> / {total}</span>}
        </span>
      </div>
      {!raw && <Progress value={pct} />}
    </div>
  );
}
