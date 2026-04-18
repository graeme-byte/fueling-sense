/**
 * POST /api/stripe/checkout
 * Creates a Stripe Checkout session for Pro upgrade.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const ALLOWED_PRICE_IDS = new Set([
    'price_1TNLWr0Ix1tVTzCC5eZxhagk', // Pro monthly
    'price_1TNLWf0Ix1tVTzCCzAqDktAj', // Pro annual
  ]);

  const body = await req.json().catch(() => ({}));
  const priceId: string | undefined = body.priceId;

  if (!priceId || !ALLOWED_PRICE_IDS.has(priceId)) {
    return NextResponse.json({ error: 'Invalid price selected.' }, { status: 400 });
  }

  // Resolve a valid base URL — prefer the explicit app URL, fall back to the
  // Vercel-injected deployment URL (no scheme), then validate before use.
  const rawBase = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
  const baseUrl = rawBase?.startsWith('http') ? rawBase : rawBase ? `https://${rawBase}` : undefined;

  if (!baseUrl) {
    throw new Error('NEXT_PUBLIC_APP_URL is not set correctly');
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode:           'subscription',
      line_items:     [{ price: priceId, quantity: 1 }],
      // Pre-fills the email field in Checkout and guarantees session.customer_email
      // is populated in the checkout.session.completed webhook event, removing the
      // null fallback risk in the user upsert.
      customer_email: user.email ?? undefined,
      metadata:             { userId: user.id, plan: 'pro' },
      allow_promotion_codes: true,
      success_url:          `${baseUrl}/calculator/profiler?upgraded=1`,
      cancel_url:     `${baseUrl}/pricing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error';
    console.error('[stripe/checkout]', message);
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'development' ? message : 'Could not create checkout session.' },
      { status: 500 },
    );
  }
}
