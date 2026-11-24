'use client';

import { Badge, Card, Spinner } from '@/components/ui';
import { usePolling } from '@/lib/client';
import { api } from '@/lib/client';

interface PaymentRow {
  id: string;
  user_email: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  plan: string | null;
  description: string | null;
  stripe_invoice_id: string | null;
  created_at: string;
}

export default function AdminPaymentsPage() {
  const data = usePolling<{ payments: PaymentRow[] }>(() => api('/api/admin/payments'), 20_000, true);

  return (
    <div className="mx-auto max-w-7xl space-y-7 animate-fade-up">
      <div>
        <h1 className="font-display text-3xl font-bold text-white">Payments</h1>
        <p className="mt-1.5 text-gray-400">Stripe transactions across the platform.</p>
      </div>

      <Card padding={false} className="overflow-x-auto p-0">
        {!data ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (data.payments ?? []).length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-500">
            No payments recorded yet. Payments appear here once Stripe is configured and a
            subscription is purchased.
          </p>
        ) : (
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-gray-500">
                <th className="px-6 py-4 font-semibold">User</th>
                <th className="px-4 py-4 font-semibold">Amount</th>
                <th className="px-4 py-4 font-semibold">Status</th>
                <th className="px-4 py-4 font-semibold">Plan</th>
                <th className="px-4 py-4 font-semibold">Invoice</th>
                <th className="px-6 py-4 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {(data.payments ?? []).map((p) => (
                <tr key={p.id} className="transition hover:bg-white/[0.02]">
                  <td className="px-6 py-3.5 text-gray-200">{p.user_email ?? '—'}</td>
                  <td className="px-4 py-3.5 font-medium text-gray-100">
                    ${(p.amount_cents / 100).toFixed(2)} {p.currency.toUpperCase()}
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge color={p.status === 'paid' ? 'green' : p.status === 'failed' ? 'red' : 'yellow'}>
                      {p.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3.5 text-gray-400">{p.plan ?? '—'}</td>
                  <td className="px-4 py-3.5 text-xs text-gray-500">{p.stripe_invoice_id ?? '—'}</td>
                  <td className="px-6 py-3.5 text-xs text-gray-500">
                    {new Date(p.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
