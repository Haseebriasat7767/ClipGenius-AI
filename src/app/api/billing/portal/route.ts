import { requireUser } from '@/lib/auth';
import { apiHandler, jsonOk, ApiError } from '@/lib/api';
import { queryOne } from '@/lib/db';
import { env } from '@/lib/env';
import { getStripe, stripeConfigured, STRIPE_SETUP_HELP } from '@/lib/stripe';

export const POST = apiHandler('billing/portal', async (req) => {
  const user = await requireUser(req);
  if (!stripeConfigured()) {
    throw new ApiError(503, STRIPE_SETUP_HELP, 'stripe_not_configured');
  }
  const row = await queryOne<{ stripe_customer_id: string | null }>(
    'SELECT stripe_customer_id FROM users WHERE id = $1',
    [user.id],
  );
  if (!row?.stripe_customer_id) {
    throw new ApiError(404, 'No billing account yet — subscribe to a plan first', 'no_customer');
  }
  const session = await getStripe().billingPortal.sessions.create({
    customer: row.stripe_customer_id,
    return_url: `${env.appUrl}/billing`,
  });
  return jsonOk({ url: session.url });
});
