/**
 * Next.js middleware — auth + route protection
 *
 * Uses the exact @supabase/ssr v0.10 pattern: `supabaseResponse` is
 * re-created inside `setAll` so that refreshed auth tokens are forwarded
 * to every downstream route handler that calls `cookies()`.
 *
 * Runs on ALL paths except static assets so tokens are always refreshed
 * before route handlers execute.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Mutate request.cookies so the updated token is visible to
          // downstream route handlers via `cookies()` from next/headers.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          // Re-create the response with the mutated request so the
          // forwarded request headers include the refreshed cookies.
          supabaseResponse = NextResponse.next({ request });
          // Also write them to the response so the browser updates its cookies.
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() validates the JWT with Supabase Auth and refreshes it if
  // expired — DO NOT replace with getSession() which skips network validation.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const requiresAuth = ['/dashboard', '/profile', '/history'];
  if (requiresAuth.some(p => pathname.startsWith(p)) && !user) {
    const url = new URL('/login', request.url);
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/calculator/fueling') && !user) {
    const url = new URL('/login', request.url);
    url.searchParams.set('redirect', pathname);
    url.searchParams.set('reason', 'pro_required');
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match every path except Next.js internals and static files.
     * Supabase SSR requires the middleware to run on all routes so that
     * expired tokens are refreshed before any server-side cookie read.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
