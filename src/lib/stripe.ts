/**
 * Stripe integration. Fully functional when STRIPE_SECRET_KEY etc. are set;
 * otherwise billing endpoints return precise setup instructions (no fake UI).
 */
import Stripe from 'stripe';
import { env } from './env';
import type { PlanId } from './plans';

let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return !!env.stripe.secretKey;
}

export function getStripe(): Stripe {
  if (!env.stripe.secretKey) {
    throw new Error(
      'Stripe is not configured. Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and STRIPE_PRICE_* to enable subscriptions.',
    );
  }
  if (!client) {
    client = new Stripe(env.stripe.secretKey, { apiVersion: '2024-06-20' });
  }
  return client;
}

export function priceIdForPlan(plan: PlanId): string | null {
  if (plan === 'free') return null;
  return env.stripe.prices[plan] || null;
}

export function planForPrice(priceId: string): PlanId | null {
  if (priceId === env.stripe.prices.creator) return 'creator';
  if (priceId === env.stripe.prices.pro) return 'pro';
  if (priceId === env.stripe.prices.agency) return 'agency';
  return null;
}

export const STRIPE_SETUP_HELP = `Stripe is not configured on this deployment.
1. Create Products & recurring Prices ($19 Creator, $49 Pro, $99 Agency) at https://dashboard.stripe.com/products
2. Copy your secret key to STRIPE_SECRET_KEY
3. Create a webhook endpoint pointing to {APP_URL}/api/billing/webhook with events: checkout.session.completed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted, invoice.paid, invoice.payment_failed — copy its signing secret to STRIPE_WEBHOOK_SECRET
4. Put the three price IDs into STRIPE_PRICE_CREATOR / STRIPE_PRICE_PRO / STRIPE_PRICE_AGENCY
5. Restart the app`;
