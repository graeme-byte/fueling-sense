/**
 * POST /api/stripe/portal
 * Creates a Stripe Billing Portal session for the authenticated user.
 * The portal URL is returned to the client, which redirects there.
 * The return_url brings the user back to the Support page.
 */

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const sub = await prisma.subscription.findUnique({
    where: { userId: user.id },
  });

  if (!sub?.stripeCustomerId) {
    return NextResponse.json({ error: 'No billing account found.' }, { status: 404 });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer:   sub.stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/support`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error';
    console.error('[stripe/portal]', message);
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'development' ? message : 'Could not open billing portal.' },
      { status: 500 },
    );
  }
}
