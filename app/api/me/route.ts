import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error('[/api/me] auth error:', authError);
    return NextResponse.json({ authenticated: false, tier: 'free' });
  }

  if (!user) {
    return NextResponse.json({ authenticated: false, tier: 'free' });
  }

  try {
    const sub = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });

    const isActivePro =
      sub?.tier === 'pro' &&
      (!sub.currentPeriodEnd || sub.currentPeriodEnd > new Date());

    return NextResponse.json({
      authenticated: true,
      tier: isActivePro ? 'pro' : 'free',
    });
  } catch (err) {
    console.error('[/api/me] subscription lookup error:', err);
    return NextResponse.json({ authenticated: true, tier: 'free' });
  }
}