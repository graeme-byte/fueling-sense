'use server';

/**
 * Server Action for email+password sign-in.
 *
 * Running sign-in as a Server Action means the session is persisted via
 * Set-Cookie response headers (server-owned) rather than document.cookie
 * (JS-owned). This is the only approach that guarantees the server can
 * read the session on the very next request, including /api/me.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function signIn(
  redirectTo: string,
  email: string,
  password: string,
): Promise<{ error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  // redirect() throws internally — Next.js turns it into a 303 response that
  // carries the Set-Cookie headers built up by createServerClient above.
  redirect(redirectTo);
}

export async function signOut(): Promise<never> {
  const supabase = await createClient();
  // Revokes the session server-side AND clears the auth cookies via Set-Cookie
  // headers — cleaner than the browser client's document.cookie approach.
  await supabase.auth.signOut();
  redirect('/login');
}
