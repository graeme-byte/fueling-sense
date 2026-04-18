import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// ── Public routes — always allowed through, no auth check ────────────────────

const PUBLIC_EXACT = new Set([
  '/', '/pricing', '/privacy', '/terms', '/support',
  '/login', '/favicon.ico', '/site.webmanifest',
]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  // Auth callbacks, static internals, Stripe webhook
  if (pathname.startsWith('/auth/'))              return true;
  if (pathname.startsWith('/_next/'))             return true;
  if (pathname.startsWith('/api/stripe/webhook')) return true;
  return false;
}

// ── Protected routes — require a valid session ───────────────────────────────

const PROTECTED_PREFIXES = [
  '/calculator/',
  '/account/',
  '/billing/',
  '/dashboard/',
  '/profile/',
  '/history/',
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(p => pathname.startsWith(p));
}

// ── Middleware ────────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes: pass through immediately, no Supabase involved.
  if (isPublic(pathname)) return NextResponse.next();

  // Unknown routes (not explicitly public or protected): pass through.
  // This keeps middleware non-blocking for routes we haven't categorised.
  if (!isProtected(pathname)) return NextResponse.next();

  // Fail open if env vars are absent — avoids a runtime 500 on misconfigured
  // deployments. The route handler itself will fail with a clear error instead.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('[middleware] Missing Supabase env vars — failing open');
    return NextResponse.next();
  }

  // Set up the Supabase SSR client, preserving the cookie-forwarding contract
  // so refreshed tokens are visible to downstream server-side code.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Mutate request cookies so downstream handlers see the refreshed token.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        // Re-create response with updated request so Set-Cookie is forwarded.
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // getSession() reads from the cookie — no network call, no database hit.
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Return the supabase response so any refreshed cookies are sent to the browser.
  return supabaseResponse;
}

// Matcher excludes static files and Next.js internals so middleware only runs
// on real page/API requests.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff2?)$).*)',
  ],
};
