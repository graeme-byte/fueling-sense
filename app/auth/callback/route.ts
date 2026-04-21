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
 *   http://localhost:3000/auth/callback       (local dev)
 *   https://www.fueling-sense.com/auth/callback  (production)
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
      // Use URL API to safely append extra params (e.g. type=recovery for password reset)
      // without risking double-encoding or query-string splitting issues.
      const dest = new URL(`${origin}${next}`);
      const type = searchParams.get('type');
      if (type) dest.searchParams.set('type', type);
      return NextResponse.redirect(dest.toString());
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
