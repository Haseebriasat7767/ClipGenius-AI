import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { apiHandler, jsonOk, parseBody, ApiError } from '@/lib/api';
import { queryOne } from '@/lib/db';
import { env } from '@/lib/env';
import { getStripe, stripeConfigured, priceIdForPlan, STRIPE_SETUP_HELP } from '@/lib/stripe';

const schema = z.object({
  plan: z.enum(['creator', 'pro', 'agency']),
});

export const POST = apiHandler('billing/checkout', async (req) => {
  const user = await requireUser(req);
  const { plan } = await parseBody(req, schema);

  if (!stripeConfigured()) {
    throw new ApiError(503, STRIPE_SETUP_HELP, 'stripe_not_configured');
  }
  const priceId = priceIdForPlan(plan);
  if (!priceId) {
    throw new ApiError(
      503,
      `STRIPE_PRICE_${plan.toUpperCase()} is not set. Create a recurring price in Stripe and add its ID to the environment.`,
      'stripe_not_configured',
    );
  }

  const stripe = getStripe();
  let customerId = user.id ? (await queryOne<{ stripe_customer_id: string | null }>(
    'SELECT stripe_customer_id FROM users WHERE id = $1',
    [user.id],
  ))?.stripe_customer_id : null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name || user.email,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await queryOne('UPDATE users SET stripe_customer_id = $2, updated_at = now() WHERE id = $1', [
      user.id,
      customerId,
    ]);
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: user.id,
    allow_promotion_codes: true,
    success_url: `${env.appUrl}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.appUrl}/billing?checkout=canceled`,
    metadata: { userId: user.id, plan },
    subscription_data: { metadata: { userId: user.id, plan } },
  });

  return jsonOk({ url: session.url });
});
