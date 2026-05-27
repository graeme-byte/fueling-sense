/**
 * POST /api/running-profiler
 * ─────────────────────────────────────────────────────────────────────────────
 * Running metabolic profiler endpoint.
 *
 * SOURCE OF TRUTH: running_metabolic_model_spec_v2_app_safe.md
 *
 * Auth: session required (middleware protects /calculator/ routes; API itself
 *       has no additional auth check — mirrors /api/inscyd/v06 pattern).
 * DB:   no writes.
 * Tier: free (no Pro check).
 *
 * Inputs (distances in metres):
 *   sprintDistanceM   — distance covered in 20-second sprint test
 *   threeMinDistanceM — distance covered in 3-minute test
 *   sixMinDistanceM   — distance covered in 6-minute test
 *   massKg            — total body mass
 *   bodyFatPct        — body fat %
 *
 * Sprint duration is fixed at 20 s in the engine. Variable sprint duration
 * (12–25 s) was removed because effort duration was a confounding factor in
 * calibration. sprintTimeS is not accepted as a client input.
 *
 * Response: { profile: RunningMetabolicProfile }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  calculateRunningMetabolicProfile,
  validateRunningInputHierarchy,
  SPRINT_TIME_S,
} from '@/lib/engine/runningMetabolicEngine';

const RunningProfilerSchema = z.object({
  sprintDistanceM:   z.number().min(20,  'Sprint distance must be ≥ 20 m').max(400,  'Sprint distance must be ≤ 400 m'),
  // sprintTimeS is not a client input — fixed at SPRINT_TIME_S (20 s) in engine
  threeMinDistanceM: z.number().min(100, '3-min distance must be ≥ 100 m').max(2500, '3-min distance must be ≤ 2500 m'),
  sixMinDistanceM:   z.number().min(200, '6-min distance must be ≥ 200 m').max(4000, '6-min distance must be ≤ 4000 m'),
  massKg:            z.number().min(30,  'Body mass must be ≥ 30 kg').max(250,  'Body mass must be ≤ 250 kg'),
  bodyFatPct:        z.number().min(3,   'Body fat must be ≥ 3%').max(50,   'Body fat must be ≤ 50%'),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = RunningProfilerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten(i => i.message) },
      { status: 400 },
    );
  }

  const inputs = parsed.data;

  // Derive speeds for cross-field validation — sprint fixed at SPRINT_TIME_S
  const s20  = inputs.sprintDistanceM / SPRINT_TIME_S;
  const s180 = inputs.threeMinDistanceM / 180;
  const s360 = inputs.sixMinDistanceM / 360;

  // Hard hierarchy check (spec §6) — T02/T04 patterns blocked here
  const hierarchyErrors = validateRunningInputHierarchy(s20, s180, s360);
  if (hierarchyErrors.length > 0) {
    return NextResponse.json(
      { error: hierarchyErrors.map(e => e.message).join(' ') },
      { status: 400 },
    );
  }

  // Engine expects sprintTimeS — API enforces SPRINT_TIME_S (20 s) as the product constraint.
  // The engine itself accepts any valid sprint time per the MD spec.
  let profile: ReturnType<typeof calculateRunningMetabolicProfile>;
  try {
    profile = calculateRunningMetabolicProfile({ ...inputs, sprintTimeS: SPRINT_TIME_S });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Model calculation failed';
    console.error('[/api/running-profiler] engine error:', message);
    return NextResponse.json({ error: message }, { status: 422 });
  }

  return NextResponse.json({ profile });
}
