/**
 * POST /api/fueling
 * ──────────────────
 * PAID TIER endpoint. Requires authenticated user with Pro subscription.
 *
 * Pipeline source of truth: MODEL_EQUATIONS.md
 * Before changing any model logic or result fields, verify against MODEL_EQUATIONS.md.
 *
 * Body: FuelingInputs (mlssWatts is the primary anchor; vlamax adjusts FATmax position)
 * Returns: FuelingResult
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runFuelingCalculation, deriveAthleteLevel } from '@/lib/engine/fuelingEngine';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db';

const FuelingInputSchema = z.object({
  name:         z.string().min(1).max(100),
  sex:          z.enum(['Male', 'Female']),
  age:          z.number().min(10).max(90).optional(),   // UI context only — not used in engine
  weight:       z.number().min(30).max(250),
  bodyFat:      z.number().min(1).max(50),
  // athleteLevel is no longer physiologically active — derived internally from MLSS/weight.
  // Retained as optional for backward compat with stored results and client-side display only.
  athleteLevel: z.enum(['Health & Fitness', 'Recreational', 'Developmental', 'Competitive', 'Top Age Group', 'Pro']).optional(),
  dietType:     z.enum(['Standard', 'Keto']),
  eventType:    z.enum(['Cycling <2h', 'Cycling 2–4h', 'Cycling >4h', 'Triathlon <2h', 'Triathlon 2–4h', 'Triathlon >4h']),
  mlssWatts:    z.number().min(50).max(1200),
  // lt1Watts is no longer user-facing (hidden field for zone display only).
  // Accept 0 or missing — defaults to 0 so old payloads and non-prefilled forms both pass.
  lt1Watts:     z.number().min(0).max(900).default(0),
  // VLamax drives FATmax position modifier; missing/invalid defaults to neutral (0.55) in engine.
  vlamax:           z.number().min(0.10).max(1.50).optional(),
  // VO2max — drives continuous GE model; absent on manual-entry forms without INSCYD prefill.
  vo2maxMlKgMin:    z.number().min(10).max(100).optional(),
  targetWatts:  z.number().min(10).max(1500),
  targetCHO:    z.number().min(0).max(300),
  inscydResultId:   z.string().uuid().optional(),
  athleteProfileId: z.string().uuid().optional(),
  save:             z.boolean().optional().default(true),
});

async function checkProAccess(userId: string): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub) return false;
  if (sub.tier !== 'pro') return false;
  if (sub.currentPeriodEnd && sub.currentPeriodEnd < new Date()) return false;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    // ── Auth gate ──
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // ── Subscription gate ──
    const isPro = await checkProAccess(user.id);
    if (!isPro) {
      return NextResponse.json(
        { error: 'Pro subscription required', code: 'UPGRADE_REQUIRED', upgradeUrl: '/pricing' },
        { status: 403 },
      );
    }

    // ── Validate input ──
    const body = await req.json();
    const parsed = FuelingInputSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const detail = Object.entries(fieldErrors)
        .map(([field, msgs]) => `${field}: ${(msgs ?? []).join(', ')}`)
        .join('; ');
      return NextResponse.json(
        { error: `Validation failed — ${detail || parsed.error.message}` },
        { status: 400 },
      );
    }

    const { save, inscydResultId, athleteProfileId, ...inputs } = parsed.data;

    // Validate lt1 < mlss only when lt1 is explicitly provided (non-zero).
    // A zero lt1Watts means "not set" (user skipped INSCYD prefill); skip the check.
    if (inputs.lt1Watts > 0 && inputs.lt1Watts >= inputs.mlssWatts) {
      return NextResponse.json(
        { error: 'lt1Watts must be less than mlssWatts.' },
        { status: 400 },
      );
    }

    // Validate target ≤ 120% MLSS (model boundary)
    if (inputs.targetWatts > inputs.mlssWatts * 1.20) {
      return NextResponse.json(
        { error: 'Target watts exceeds model range (>120% MLSS). Reduce target or check MLSS.' },
        { status: 400 },
      );
    }

    // ── Calculate ──
    const result = runFuelingCalculation(inputs);

    // ── Persist ──
    let savedId: string | null = null;
    if (save) {
      // Strip denseSubstrateSeries from the persisted blob — it is recomputable from
      // fatmaxWkg + xf + xz + mlssWatts + ge and inflates row size significantly.
      // The full result (including denseSubstrateSeries) is still returned to the UI below.
      const { denseSubstrateSeries: _omit, ...resultForDb } = result;
      const saved = await prisma.fuelingResult.create({
        data: {
          userId:           user.id,
          inscydResultId:   inscydResultId   ?? null,
          athleteProfileId: athleteProfileId ?? null,

          // ── Input scalars ────────────────────────────────────────
          // athleteLevel derived from MLSS/weight (no longer user-supplied).
          athleteLevel:  deriveAthleteLevel(inputs.mlssWatts, inputs.weight),
          dietType:      inputs.dietType,
          eventCategory: inputs.eventType,
          sex:           inputs.sex,
          weightKg:      inputs.weight,
          bodyFatPct:    inputs.bodyFat,
          vlamax:        inputs.vlamax ?? null,

          // ── Metabolic anchors ────────────────────────────────────
          mlssWatts: inputs.mlssWatts,
          lt1Watts:  inputs.lt1Watts,

          // ── Target inputs ────────────────────────────────────────
          targetWatts: inputs.targetWatts,
          targetChoGH: inputs.targetCHO,

          // ── Derived outputs ──────────────────────────────────────
          grossEfficiency: result.ge,
          fatmaxWkg:       result.fatmaxWkg,
          fatmaxWatts:     Math.round(result.fatmaxPctMLSS * inputs.mlssWatts),
          carb90Watts:     result.carb90.found ? result.carb90.watts : null,
          carb90Found:     result.carb90.found,
          targetPctLt2:    result.target.pctMLSS,
          choGphAtTarget:  result.target.choGHour,
          choRequiredGH:   result.target.choGHour,
          // Fix D7: signed gap (planned − required) from new advice system
          choGapGH:        result.advice.gapAnalysis.gap_gph,

          // ── Strategy classification ──────────────────────────────
          strategyLabel:   result.advice.strategy.strategyLabel,
          pacingAlignment: result.advice.strategy.alignment,

          resultJson: resultForDb as object,
        },
      });
      savedId = saved.id;
    }

    return NextResponse.json({ result, savedId });
  } catch (err) {
    console.error('[/api/fueling]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/fueling?inscydId=<uuid>
 * Auto-populate FuelSense inputs from a saved INSCYD result.
 * Returns mlssWatts (primary anchor), lt1Watts (zone display), and vlamax (FATmax modifier).
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const isPro = await checkProAccess(user.id);
  if (!isPro) {
    return NextResponse.json({ error: 'Pro subscription required', code: 'UPGRADE_REQUIRED' }, { status: 403 });
  }

  const inscydId = req.nextUrl.searchParams.get('inscydId');
  if (!inscydId) {
    return NextResponse.json({ error: 'inscydId param required' }, { status: 400 });
  }

  const inscydRecord = await prisma.inscydResult.findFirst({
    where: { id: inscydId, userId: user.id },
  });
  if (!inscydRecord) {
    return NextResponse.json({ error: 'INSCYD result not found' }, { status: 404 });
  }

  // Derive suggested level from MLSS/kg (MLSS is the primary metabolic anchor).
  // Thresholds map to the 6-level AthleteLevel scale.
  const mlssPerKg = inscydRecord.mlssWatts / inscydRecord.bodyMassKg;
  let suggestedLevel = 'Recreational';
  if      (mlssPerKg >= 4.8) suggestedLevel = 'Pro';
  else if (mlssPerKg >= 4.0) suggestedLevel = 'Top Age Group';
  else if (mlssPerKg >= 3.3) suggestedLevel = 'Competitive';
  else if (mlssPerKg >= 2.7) suggestedLevel = 'Developmental';
  else if (mlssPerKg >= 2.1) suggestedLevel = 'Recreational';
  else                       suggestedLevel = 'Health & Fitness';

  const prefill = {
    mlssWatts:      inscydRecord.mlssWatts,
    lt1Watts:       inscydRecord.lt1Watts,
    // VLamax from the saved INSCYD result — used to adjust FATmax position in the fueling model.
    vlamax:         inscydRecord.vlamax ?? undefined,
    weight:         inscydRecord.bodyMassKg,
    bodyFat:        inscydRecord.bodyFatPct,
    suggestedLevel,
    mlssPerKg:      Math.round(mlssPerKg * 100) / 100,
    inscydResultId: inscydRecord.id,
    targetWatts:    Math.round(inscydRecord.mlssWatts),  // default target = MLSS
    // VO2max from INSCYD record — drives the continuous GE model.
    vo2maxMlKgMin:  inscydRecord.vo2max,
  };

  return NextResponse.json({ prefill });
}
