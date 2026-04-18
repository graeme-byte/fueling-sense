/**
 * POST /api/inscyd/v06
 * ─────────────────────────────────────────────────────────────────────────────
 * Pipeline source of truth: MODEL_EQUATIONS.md
 * Before changing any model logic, verify against MODEL_EQUATIONS.md.
 *
 * v0.6 metabolic profiler endpoint. Isolated from the legacy /api/inscyd route.
 *
 * Inputs:
 *   Required : p20, p300, weightKg, bodyFatPct
 *   Optional : p180, p360, p720  (validation only — do NOT affect model outputs)
 *   Optional : sex               (only for suggestedLevel derivation in the bridge)
 *
 * This route does NOT persist results (no DB writes).
 * This route does NOT require authentication.
 * This route does NOT modify the fueling engine.
 *
 * Response shape:
 *   {
 *     modelVersion:   "v0.6",
 *     profile:        MetabolicV06Result  (full engine output)
 *     fuelingPrefill: INSCYDToFuelingSenseBridge  (downstream-compatible prefill)
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { calculateMetabolicProfileV06 } from '@/lib/engine/metabolicModelV06';
import { buildV06Bridge } from '@/lib/engine/v06Bridge';

// ── Request validation ────────────────────────────────────────────────────────

const V06InputSchema = z.object({
  // Required inputs — Zod v4: no required_error option; missing fields fail type check
  p20:        z.number().min(50,  'p20 must be ≥ 50 W').max(3000, 'p20 must be ≤ 3000 W'),
  p300:       z.number().min(50,  'p300 must be ≥ 50 W').max(1500, 'p300 must be ≤ 1500 W'),
  weightKg:   z.number().min(30,  'weightKg must be ≥ 30 kg').max(250, 'weightKg must be ≤ 250 kg'),
  bodyFatPct: z.number().min(3,   'bodyFatPct must be ≥ 3%').max(50,  'bodyFatPct must be ≤ 50%'),

  // Optional validation-only efforts — must NOT change model outputs
  p180: z.number().min(50).max(2000).optional(),
  p360: z.number().min(50).max(1500).optional(),
  p720: z.number().min(50).max(1200).optional(),

  // Optional — only used by buildV06Bridge for suggestedLevel.
  // Defaults to 'Male' when absent (neutral; female offset is additive,
  // so omitting sex never inflates suggestedLevel).
  sex: z.enum(['Male', 'Female']).optional().default('Male'),
});

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Parse + validate ──────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = V06InputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten(i => i.message) },
      { status: 400 },
    );
  }

  const { sex, ...modelInputs } = parsed.data;

  // ── Physiological cross-field checks ─────────────────────────────────────
  // p20 must be higher than p300 (sprint power > 5-min power).
  if (modelInputs.p20 <= modelInputs.p300) {
    return NextResponse.json(
      { error: 'p20 must be greater than p300 (sprint power must exceed 5-minute power)' },
      { status: 400 },
    );
  }

  // Optional power ordering: if provided, durations must be monotonically decreasing.
  const { p180, p360, p720 } = modelInputs;
  if (p180 !== undefined && p180 <= modelInputs.p300) {
    return NextResponse.json(
      { error: 'p180 must be greater than p300 when both are provided' },
      { status: 400 },
    );
  }
  if (p180 !== undefined && p360 !== undefined && p180 <= p360) {
    return NextResponse.json(
      { error: 'p180 must be greater than p360 when both are provided' },
      { status: 400 },
    );
  }
  if (p360 !== undefined && p720 !== undefined && p360 <= p720) {
    return NextResponse.json(
      { error: 'p360 must be greater than p720 when both are provided' },
      { status: 400 },
    );
  }

  // ── Run v0.6 engine ───────────────────────────────────────────────────────
  let profile: ReturnType<typeof calculateMetabolicProfileV06>;
  try {
    profile = calculateMetabolicProfileV06(modelInputs);
  } catch (err: unknown) {
    // Engine throws only on clearly pathological inputs that passed Zod
    // (e.g., negative values that slipped through). Surface the message.
    const message = err instanceof Error ? err.message : 'Model calculation failed';
    console.error('[/api/inscyd/v06] engine error:', message);
    return NextResponse.json({ error: message }, { status: 422 });
  }

  // ── Build downstream-compatible bridge ────────────────────────────────────
  // cpWatts lives only in profile.outputs and is NOT included in fuelingPrefill.
  // Optional validation inputs (p180, p360, p720) live only in profile.validation.
  const fuelingPrefill = buildV06Bridge(profile, sex);

  // ── Response ──────────────────────────────────────────────────────────────
  return NextResponse.json({
    modelVersion:   profile.version,   // "v0.6"
    profile,                           // full MetabolicV06Result
    fuelingPrefill,                    // INSCYDToFuelingSenseBridge — downstream-ready
  });
}
