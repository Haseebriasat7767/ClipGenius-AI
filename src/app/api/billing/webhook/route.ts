/**
 * Stripe webhook — updates subscriptions, plans and payment records.
 * Signature-verified with STRIPE_WEBHOOK_SECRET.
 */
import { NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { query, queryOne } from '@/lib/db';
import { getStripe, stripeConfigured, planForPrice } from '@/lib/stripe';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  if (!stripeConfigured()) {
    return new Response('Stripe is not configured', { status: 503 });
  }
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig ?? '', env.stripe.webhookSecret);
  } catch (err) {
    return new Response(`Webhook signature verification failed: ${(err as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId ?? session.client_reference_id;
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
        if (userId && subscriptionId) {
          const sub = await getStripe().subscriptions.retrieve(subscriptionId);
          await upsertSubscription(userId, sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId ?? (await userIdForCustomer(sub.customer));
        if (userId) await upsertSubscription(userId, sub);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId ?? (await userIdForCustomer(sub.customer));
        if (userId) {
          await query(
            `UPDATE subscriptions SET status='canceled', plan='free', cancel_at_period_end=false, updated_at=now() WHERE user_id=$1`,
            [userId],
          );
          await query(`UPDATE users SET plan='free', updated_at=now() WHERE id=$1`, [userId]);
        }
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const userId = await userIdForCustomer(invoice.customer);
        if (userId) {
          const planFromLine = null;
          await query(
            `INSERT INTO payments (user_id, stripe_invoice_id, stripe_payment_intent_id, amount_cents, currency, status, plan, description)
             VALUES ($1, $2, $3, $4, $5, 'paid', $6, $7)`,
            [
              userId,
              invoice.id,
              typeof invoice.payment_intent === 'string' ? invoice.payment_intent : null,
              invoice.amount_paid ?? 0,
              invoice.currency ?? 'usd',
              planFromLine,
              invoice.lines?.data?.[0]?.description ?? 'Subscription',
            ],
          );
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const userId = await userIdForCustomer(invoice.customer);
        if (userId) {
          await query(
            `INSERT INTO payments (user_id, stripe_invoice_id, amount_cents, currency, status, description)
             VALUES ($1, $2, $3, $4, 'failed', 'Payment failed')`,
            [userId, invoice.id, invoice.amount_due ?? 0, invoice.currency ?? 'usd'],
          );
          await query(`UPDATE subscriptions SET status='past_due', updated_at=now() WHERE user_id=$1`, [userId]);
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error('[stripe] webhook handling failed:', err);
    return new Response('Webhook handler error', { status: 500 });
  }
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function userIdForCustomer(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): Promise<string | null> {
  const customerId = typeof customer === 'string' ? customer : customer?.id;
  if (!customerId) return null;
  const row = await queryOne<{ id: string }>('SELECT id FROM users WHERE stripe_customer_id = $1', [customerId]);
  return row?.id ?? null;
}

async function upsertSubscription(userId: string, sub: Stripe.Subscription): Promise<void> {
  const priceId = sub.items.data[0]?.price?.id ?? '';
  const plan = planForPrice(priceId) ?? 'free';
  const status = sub.status;
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;

  await query(
    `INSERT INTO subscriptions (user_id, plan, status, stripe_subscription_id, stripe_price_id, current_period_end, cancel_at_period_end)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id) DO UPDATE SET
       plan = EXCLUDED.plan, status = EXCLUDED.status,
       stripe_subscription_id = EXCLUDED.stripe_subscription_id,
       stripe_price_id = EXCLUDED.stripe_price_id,
       current_period_end = EXCLUDED.current_period_end,
       cancel_at_period_end = EXCLUDED.cancel_at_period_end,
       updated_at = now()`,
    [userId, plan, status, sub.id, priceId, periodEnd, sub.cancel_at_period_end ?? false],
  );

  const activePlan = ['active', 'trialing', 'past_due'].includes(status) ? plan : 'free';
  await query('UPDATE users SET plan = $2, updated_at = now() WHERE id = $1', [userId, activePlan]);
}
