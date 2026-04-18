/**
 * GET /auth/callback
 *
 * Exchanges a PKCE auth code for a session. Required for:
 *  - Email confirmation links
 *  - Password reset redirects
 *  - OAuth provider callbacks
 *
 * Supabase Dashboard → Authentication → URL Configuration must include
 * this path in the Redirect URL allow-list:
 *   http://localhost:3000/auth/callback
 *   https://fueling-sense.com/auth/callback
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/calculator/profiler';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
