/**
 * GET /api/billing
 * Returns subscription status for the authenticated user.
 * Used by the Support page to display billing info and cancellation state.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ authenticated: false });
  }

  const sub = await prisma.subscription.findUnique({
    where: { userId: user.id },
  });

  if (!sub) {
    return NextResponse.json({ authenticated: true, tier: 'free', hasStripe: false });
  }

  return NextResponse.json({
    authenticated:     true,
    tier:              sub.tier,
    hasStripe:         !!sub.stripeCustomerId,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    currentPeriodEnd:  sub.currentPeriodEnd?.toISOString() ?? null,
  });
}
