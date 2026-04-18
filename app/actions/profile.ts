'use server';

import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db';

// ── Types ─────────────────────────────────────────────────────────

export interface SaveProfilePayload {
  modelVersion:  string;
  // Source inputs — stored for clean profiler prefill
  p20Watts:      number;
  p300Watts:     number;
  p180Watts?:    number;
  p360Watts?:    number;
  p720Watts?:    number;
  // Derived outputs
  lt1Watts:      number;
  mlssWatts:     number;
  vlamax:        number;
  vo2maxMlKgMin?: number;
  cpWatts?:      number;
  weightKg:      number;
  bodyFatPct:    number;
  sex?:          string;
  phenotype?:    string;
  name?:         string;
  age?:          number;
  dietType?:     string;
  resultJson:    object;
}

export interface SavedProfileData {
  id:            string;
  modelVersion:  string;
  // Source inputs (null for profiles saved before migration 2)
  p20Watts?:     number;
  p300Watts?:    number;
  p180Watts?:    number;
  p360Watts?:    number;
  p720Watts?:    number;
  // Derived outputs
  lt1Watts:      number;
  mlssWatts:     number;
  vlamax:        number;
  vo2maxMlKgMin?: number;
  cpWatts?:      number;
  weightKg:      number;
  bodyFatPct:    number;
  sex?:          string;
  phenotype?:    string;
  name?:         string;
  age?:          number;
  dietType?:     string;
  savedAt:       Date;
}

// ── Save (upsert) ─────────────────────────────────────────────────

export async function saveProfileAction(
  payload: SaveProfilePayload,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  // ── 1. Auth ───────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError) {
    console.error('[saveProfileAction] auth error:', authError.message);
    return { ok: false, error: `Auth error: ${authError.message}` };
  }
  if (!user) {
    console.error('[saveProfileAction] no authenticated user');
    return { ok: false, error: 'Not authenticated' };
  }

  console.log('[saveProfileAction] user.id:', user.id, '| email:', user.email);

  // ── 2. Payload validation ─────────────────────────────────────────
  const missing = (['modelVersion', 'p20Watts', 'p300Watts', 'lt1Watts', 'mlssWatts', 'vlamax', 'weightKg', 'bodyFatPct'] as const)
    .filter(k => payload[k] == null);
  if (missing.length > 0) {
    console.error('[saveProfileAction] missing payload fields:', missing);
    return { ok: false, error: `Missing required fields: ${missing.join(', ')}` };
  }

  console.log('[saveProfileAction] payload:', {
    modelVersion:  payload.modelVersion,
    p20Watts:      payload.p20Watts,
    p300Watts:     payload.p300Watts,
    lt1Watts:      payload.lt1Watts,
    mlssWatts:     payload.mlssWatts,
    vlamax:        payload.vlamax,
    vo2maxMlKgMin: payload.vo2maxMlKgMin,
    cpWatts:       payload.cpWatts,
    weightKg:      payload.weightKg,
    bodyFatPct:    payload.bodyFatPct,
    sex:           payload.sex,
    phenotype:     payload.phenotype,
  });

  // ── 3. Ensure public.users row exists ─────────────────────────────
  // Root cause of the original failure: saved_profiles.user_id FK references
  // public.users.id. Free-tier users are in auth.users but public.users rows
  // are only created by the Stripe webhook on purchase. This guard ensures the
  // FK parent row exists for all authenticated users before the profile upsert.
  try {
    await prisma.user.upsert({
      where:  { id: user.id },
      create: { id: user.id, email: user.email ?? '' },
      update: { email: user.email ?? '' },
    });
    console.log('[saveProfileAction] public.users row ensured for:', user.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[saveProfileAction] users upsert failed:', msg);
    return { ok: false, error: `User record error: ${msg}` };
  }

  // ── 4. Upsert saved_profiles ──────────────────────────────────────
  try {
    const now   = new Date();
    const saved = await prisma.savedProfile.upsert({
      where:  { userId: user.id },
      create: {
        userId:        user.id,
        modelVersion:  payload.modelVersion,
        p20Watts:      payload.p20Watts,
        p300Watts:     payload.p300Watts,
        p180Watts:     payload.p180Watts   ?? null,
        p360Watts:     payload.p360Watts   ?? null,
        p720Watts:     payload.p720Watts   ?? null,
        lt1Watts:      payload.lt1Watts,
        mlssWatts:     payload.mlssWatts,
        vlamax:        payload.vlamax,
        vo2maxMlKgMin: payload.vo2maxMlKgMin ?? null,
        cpWatts:       payload.cpWatts     ?? null,
        weightKg:      payload.weightKg,
        bodyFatPct:    payload.bodyFatPct,
        sex:           payload.sex      ?? null,
        phenotype:     payload.phenotype ?? null,
        name:          payload.name     ?? null,
        age:           payload.age      ?? null,
        dietType:      payload.dietType ?? null,
        savedAt:       now,
        resultJson:    payload.resultJson,
      },
      update: {
        modelVersion:  payload.modelVersion,
        p20Watts:      payload.p20Watts,
        p300Watts:     payload.p300Watts,
        p180Watts:     payload.p180Watts   ?? null,
        p360Watts:     payload.p360Watts   ?? null,
        p720Watts:     payload.p720Watts   ?? null,
        lt1Watts:      payload.lt1Watts,
        mlssWatts:     payload.mlssWatts,
        vlamax:        payload.vlamax,
        vo2maxMlKgMin: payload.vo2maxMlKgMin ?? null,
        cpWatts:       payload.cpWatts     ?? null,
        weightKg:      payload.weightKg,
        bodyFatPct:    payload.bodyFatPct,
        sex:           payload.sex      ?? null,
        phenotype:     payload.phenotype ?? null,
        name:          payload.name     ?? null,
        age:           payload.age      ?? null,
        dietType:      payload.dietType ?? null,
        savedAt:       now,
        resultJson:    payload.resultJson,
      },
    });
    console.log('[saveProfileAction] saved profile id:', saved.id);
    return { ok: true, id: saved.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[saveProfileAction] savedProfile upsert failed:', msg);
    return { ok: false, error: `Database error: ${msg}` };
  }
}

// ── Get ───────────────────────────────────────────────────────────

export async function getSavedProfileAction(): Promise<SavedProfileData | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  try {
    const row = await prisma.savedProfile.findUnique({
      where:  { userId: user.id },
      select: {
        id: true,
        modelVersion: true,
        p20Watts: true,
        p300Watts: true,
        p180Watts: true,
        p360Watts: true,
        p720Watts: true,
        lt1Watts: true,
        mlssWatts: true,
        vlamax: true,
        vo2maxMlKgMin: true,
        cpWatts: true,
        weightKg: true,
        bodyFatPct: true,
        sex: true,
        phenotype: true,
        name: true,
        age: true,
        dietType: true,
        savedAt: true,
      },
    });
    if (!row) return null;
    return {
      id:            row.id,
      modelVersion:  row.modelVersion,
      p20Watts:      row.p20Watts    ?? undefined,
      p300Watts:     row.p300Watts   ?? undefined,
      p180Watts:     row.p180Watts   ?? undefined,
      p360Watts:     row.p360Watts   ?? undefined,
      p720Watts:     row.p720Watts   ?? undefined,
      lt1Watts:      row.lt1Watts,
      mlssWatts:     row.mlssWatts,
      vlamax:        row.vlamax,
      vo2maxMlKgMin: row.vo2maxMlKgMin ?? undefined,
      cpWatts:       row.cpWatts     ?? undefined,
      weightKg:      row.weightKg,
      bodyFatPct:    row.bodyFatPct,
      sex:           row.sex      ?? undefined,
      phenotype:     row.phenotype ?? undefined,
      name:          row.name     ?? undefined,
      age:           row.age      ?? undefined,
      dietType:      row.dietType ?? undefined,
      savedAt:       row.savedAt,
    };
  } catch {
    return null;
  }
}

// ── Has saved profile (lightweight check) ─────────────────────────

export async function hasSavedProfileAction(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  try {
    const row = await prisma.savedProfile.findUnique({
      where:  { userId: user.id },
      select: { id: true },
    });
    return !!row;
  } catch {
    return false;
  }
}
