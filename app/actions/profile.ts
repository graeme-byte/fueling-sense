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
  // Skip running profiles — they are read by getSavedRunningProfileAction

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
    // Running profiles share the table but must not be returned here
    if (row.modelVersion.startsWith('running-')) return null;
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
      select: { id: true, modelVersion: true },
    });
    return !!row && !row.modelVersion.startsWith('running-');
  } catch {
    return false;
  }
}


// ── Running profile save / load ───────────────────────────────────
//
// Running profiles are stored in the same saved_profiles table using
// a modelVersion that starts with 'running-'. Field mapping:
//   lt1SpeedMs   → lt1Watts  (float repurposed — speed m/s, not watts)
//   mlssSpeedMs  → mlssWatts
//   vlamaxMmolLS → vlamax    (exact match)
//   massKg       → weightKg  (exact match)
//   bodyFatPct   → bodyFatPct (exact match)
//   vo2maxMlKgMin → vo2maxMlKgMin (exact match)
//   sprintDistM  → p20Watts  (nullable float)
//   threeMinDistM → p300Watts
//   sixMinDistM  → p180Watts
//   sprintTimeS  → p360Watts

export interface SaveRunningProfilePayload {
  modelVersion:  string;
  sprintDistM:   number;
  sprintTimeS:   number;
  threeMinDistM: number;
  sixMinDistM:   number;
  massKg:        number;
  bodyFatPct:    number;
  lt1SpeedMs:    number;
  mlssSpeedMs:   number;
  vlamaxMmolLS:  number;
  vo2maxMlKgMin: number;
  sex?:          string;
  name?:         string;
  age?:          number;
  dietType?:     string;
  resultJson:    object;
}

export interface SavedRunningProfileData {
  id:            string;
  modelVersion:  string;
  sprintDistM:   number;
  sprintTimeS:   number;
  threeMinDistM: number;
  sixMinDistM:   number;
  massKg:        number;
  bodyFatPct:    number;
  lt1SpeedMs:    number;
  mlssSpeedMs:   number;
  vlamaxMmolLS:  number;
  vo2maxMlKgMin: number;
  sex?:          string;
  name?:         string;
  age?:          number;
  dietType?:     string;
  savedAt:       Date;
}

export async function saveRunningProfileAction(
  payload: SaveRunningProfilePayload,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) return { ok: false, error: `Auth error: ${authError.message}` };
  if (!user)     return { ok: false, error: 'Not authenticated' };

  // Ensure public.users row exists
  try {
    await prisma.user.upsert({
      where:  { id: user.id },
      create: { id: user.id, email: user.email ?? '' },
      update: { email: user.email ?? '' },
    });
  } catch (e) {
    return { ok: false, error: `User record error: ${e instanceof Error ? e.message : String(e)}` };
  }

  try {
    const now   = new Date();
    const saved = await prisma.savedProfile.upsert({
      where:  { userId: user.id },
      create: {
        userId:        user.id,
        modelVersion:  payload.modelVersion,
        p20Watts:      payload.sprintDistM,
        p300Watts:     payload.threeMinDistM,
        p180Watts:     payload.sixMinDistM,
        p360Watts:     payload.sprintTimeS,
        p720Watts:     null,
        lt1Watts:      payload.lt1SpeedMs,
        mlssWatts:     payload.mlssSpeedMs,
        vlamax:        payload.vlamaxMmolLS,
        vo2maxMlKgMin: payload.vo2maxMlKgMin,
        cpWatts:       null,
        weightKg:      payload.massKg,
        bodyFatPct:    payload.bodyFatPct,
        sex:           payload.sex      ?? null,
        phenotype:     null,
        name:          payload.name     ?? null,
        age:           payload.age      ?? null,
        dietType:      payload.dietType ?? null,
        savedAt:       now,
        resultJson:    payload.resultJson,
      },
      update: {
        modelVersion:  payload.modelVersion,
        p20Watts:      payload.sprintDistM,
        p300Watts:     payload.threeMinDistM,
        p180Watts:     payload.sixMinDistM,
        p360Watts:     payload.sprintTimeS,
        p720Watts:     null,
        lt1Watts:      payload.lt1SpeedMs,
        mlssWatts:     payload.mlssSpeedMs,
        vlamax:        payload.vlamaxMmolLS,
        vo2maxMlKgMin: payload.vo2maxMlKgMin,
        cpWatts:       null,
        weightKg:      payload.massKg,
        bodyFatPct:    payload.bodyFatPct,
        sex:           payload.sex      ?? null,
        phenotype:     null,
        name:          payload.name     ?? null,
        age:           payload.age      ?? null,
        dietType:      payload.dietType ?? null,
        savedAt:       now,
        resultJson:    payload.resultJson,
      },
    });
    return { ok: true, id: saved.id };
  } catch (e) {
    return { ok: false, error: `Database error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function getSavedRunningProfileAction(): Promise<SavedRunningProfileData | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  try {
    const row = await prisma.savedProfile.findUnique({
      where:  { userId: user.id },
      select: {
        id: true, modelVersion: true,
        p20Watts: true, p300Watts: true, p180Watts: true, p360Watts: true,
        lt1Watts: true, mlssWatts: true, vlamax: true, vo2maxMlKgMin: true,
        weightKg: true, bodyFatPct: true,
        sex: true, name: true, age: true, dietType: true, savedAt: true,
      },
    });
    if (!row || !row.modelVersion.startsWith('running-')) return null;
    return {
      id:            row.id,
      modelVersion:  row.modelVersion,
      sprintDistM:   row.p20Watts   ?? 0,
      threeMinDistM: row.p300Watts  ?? 0,
      sixMinDistM:   row.p180Watts  ?? 0,
      sprintTimeS:   row.p360Watts  ?? 20,
      massKg:        row.weightKg,
      bodyFatPct:    row.bodyFatPct,
      lt1SpeedMs:    row.lt1Watts,
      mlssSpeedMs:   row.mlssWatts,
      vlamaxMmolLS:  row.vlamax,
      vo2maxMlKgMin: row.vo2maxMlKgMin ?? 0,
      sex:           row.sex      ?? undefined,
      name:          row.name     ?? undefined,
      age:           row.age      ?? undefined,
      dietType:      row.dietType ?? undefined,
      savedAt:       row.savedAt,
    };
  } catch {
    return null;
  }
}
