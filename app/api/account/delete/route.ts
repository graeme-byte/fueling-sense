/**
 * DELETE /api/account/delete
 * ─────────────────────────────────────────────────────────────────────────────
 * Permanently deletes all application data for the authenticated user,
 * then deletes the Supabase auth user.
 *
 * ── Deletion scope ────────────────────────────────────────────────────────────
 * All rows associated with the user's ID are deleted. Because every related
 * model has `onDelete: Cascade` in the Prisma schema, deleting the single
 * `users` row cascades to all of the following tables automatically:
 *
 *   saved_profiles        — saved metabolic profile for fueling prefill
 *   fueling_results       — all fueling calculator results
 *   inscyd_results        — all metabolic profiler results
 *   athlete_profiles      — named athlete profiles
 *   subscriptions         — subscription tier record
 *
 * The cascade is enforced at the PostgreSQL level. No explicit per-table delete
 * is required beyond deleting the `users` row.
 *
 * ── Retained data ─────────────────────────────────────────────────────────────
 * Stripe: Payment and invoice records in Stripe's systems are NOT deleted by
 *   this route. Stripe is required by financial regulations (PCI-DSS / card
 *   network rules) to retain payment records for a minimum period. These records
 *   contain only payment metadata and are governed by Stripe's own privacy policy.
 *   If full Stripe data deletion is required, it must be initiated separately via
 *   the Stripe dashboard or API after this route completes.
 *
 * Supabase Auth audit logs: Supabase retains internal auth audit events for its
 *   own platform security. These are not accessible to or controllable by the app.
 *
 * ── Deletion ordering ─────────────────────────────────────────────────────────
 * 1. Verify caller is authenticated (standard anon client — validates JWT).
 * 2. Delete app data: prisma.user.delete() → cascades to all related tables.
 * 3. (Storage) Supabase Storage is not currently used — no objects to delete.
 * 4. Delete auth user: supabaseAdmin.auth.admin.deleteUser(userId).
 *
 * Steps 2 and 4 are deliberately sequential. Deleting the auth user before app
 * data would remove the identity anchor before cascade completes; deleting app
 * data first ensures FK constraints are satisfied at every step.
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 * - User identity is verified via the standard server client (JWT validation).
 * - The service role key is only used in step 4 and only server-side.
 * - The userId acted on is always derived from the verified session, never from
 *   the request body.
 */

import { NextResponse } from 'next/server';
import { createClient }   from '@/lib/supabase/server';
import { supabaseAdmin }  from '@/lib/supabase/admin';
import { prisma }         from '@/lib/db';

export async function DELETE() {
  // ── Step 1: authenticate ──────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 },
    );
  }

  const userId = user.id;

  // ── Step 2: delete app data ───────────────────────────────────────────────
  // Deleting the `users` row cascades to all related tables:
  //   saved_profiles, fueling_results, inscyd_results,
  //   athlete_profiles, subscriptions
  //
  // We check for existence first so that a missing Prisma row (e.g. the user
  // signed up via Supabase but never triggered the app-side user creation) is
  // treated as "nothing to delete" rather than a fatal error (Prisma P2025).
  try {
    const existingUser = await prisma.user.findUnique({
      where:  { id: userId },
      select: { id: true },
    });

    if (existingUser) {
      await prisma.user.delete({ where: { id: userId } });
      console.log(`[DELETE /api/account/delete] Prisma user deleted, cascade complete: ${userId}`);
    } else {
      console.log(`[DELETE /api/account/delete] No Prisma user row found for ${userId} — skipping app data deletion`);
    }
  } catch (err) {
    console.error('[DELETE /api/account/delete] app-data deletion failed:', err);
    return NextResponse.json(
      { error: 'Failed to delete account data. Please try again or contact support.' },
      { status: 500 },
    );
  }

  // ── Step 3: Storage ───────────────────────────────────────────────────────
  // Supabase Storage is not currently used by this application.
  // When storage is introduced, add bucket object deletion here before
  // deleting the auth user.

  // ── Step 4: delete auth user ──────────────────────────────────────────────
  // Uses the service-role admin client. Fails-safe: if this step fails after
  // app data has already been deleted, the user's data is gone but the auth
  // account persists — the user can retry or contact support.
  const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (deleteAuthError) {
    console.error('[DELETE /api/account/delete] auth user deletion failed:', deleteAuthError);
    // App data is already deleted at this point. Return a partial-success
    // so the client can sign out and redirect — the auth account may still
    // exist but all data is gone.
    return NextResponse.json(
      {
        ok:      true,
        partial: true,
        warning: 'Account data deleted, but auth account removal encountered an issue. Contact support if you cannot log back in.',
      },
    );
  }

  return NextResponse.json({ ok: true });
}
