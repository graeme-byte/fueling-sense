/**
 * lib/supabase/admin.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Supabase admin client — uses the SERVICE ROLE key.
 *
 * SECURITY CONSTRAINTS:
 *   - This file must ONLY be imported in server-side code (API routes,
 *     Server Actions, middleware). Never import from client components.
 *   - SUPABASE_SERVICE_ROLE_KEY is never exposed to the browser.
 *   - The service role bypasses Row Level Security — every call here
 *     must validate the caller's identity before acting.
 */

import { createClient } from '@supabase/supabase-js';

// Lazy-initialised so missing env vars crash at call time, not at module load.
// This prevents build-time failures in environments where the service role key
// is injected only at runtime (e.g. Vercel environment variables).
let _admin: ReturnType<typeof createClient> | null = null;

function getAdminClient() {
  if (_admin) return _admin;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. ' +
      'Add it to your environment variables (never prefix with NEXT_PUBLIC_).',
    );
  }
  _admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession:   false,
      },
    },
  );
  return _admin;
}

// Proxy so callers can write `supabaseAdmin.auth.admin.deleteUser(...)` unchanged.
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    return Reflect.get(getAdminClient(), prop);
  },
});
