/**
 * POST /api/running-fueling
 * ─────────────────────────────────────────────────────────────────────────────
 * Running fueling calculator endpoint — PAID TIER.
 *
 * SOURCE OF TRUTH: running_metabolic_model_spec_v2_app_safe.md
 *
 * Auth: session + Pro subscription required (mirrors /api/fueling pattern).
 * DB:   no writes in this pass (running fueling results not yet persisted).
 *
 * Inputs:
 *   Metabolic anchors from running profiler output
 *   + event type + target pace + planned CHO intake
 *
 * Response: { result: RunningFuelingResult }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { calculateRunningFueling } from '@/lib/engine/runningFuelingEngine';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db';

const RunningFuelingSchema = z.object({
  // Athlete context
  name:       z.string().min(1).max(100).optional(),
  sex:        z.enum(['Male', 'Female']),
  age:        z.number().min(10).max(90).optional(),
  massKg:     z.number().min(30).max(250),
  bodyFatPct: z.number().min(1).max(50),

  // Metabolic anchors (m/s)
  mlssSpeedMs:   z.number().min(0.5).max(10),
  lt1SpeedMs:    z.number().min(0.3).max(9),
  vlamaxMmolLS:  z.number().min(0.05).max(0.80),
  vo2maxMlKgMin: z.number().min(10).max(100),

  // Diet / fat-adaptation (advice-only — substrate numbers unchanged; see spec §18.1)
  dietType:  z.enum(['Standard', 'Keto']).optional().default('Standard'),

  // Event
  eventType: z.enum(['Running 5K', 'Running 10K', 'Half Marathon', 'Marathon', 'Ultra (>4h)']),

  // Target
  targetSpeedMs: z.number().min(0.5).max(12),
  targetCHO:     z.number().min(0).max(300),
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
    // ── Auth ──
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // ── Pro gate ──
    const isPro = await checkProAccess(user.id);
    if (!isPro) {
      return NextResponse.json(
        { error: 'Pro subscription required', code: 'UPGRADE_REQUIRED', upgradeUrl: '/pricing' },
        { status: 403 },
      );
    }

    // ── Validate ──
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = RunningFuelingSchema.safeParse(body);
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

    const inputs = parsed.data;

    // Cross-field: LT1 < MLSS
    if (inputs.lt1SpeedMs >= inputs.mlssSpeedMs) {
      return NextResponse.json(
        { error: 'lt1SpeedMs must be less than mlssSpeedMs.' },
        { status: 400 },
      );
    }

    // Cross-field: target pace ≤ 130% MLSS (model boundary)
    if (inputs.targetSpeedMs > inputs.mlssSpeedMs * 1.30) {
      return NextResponse.json(
        { error: 'Target speed exceeds model range (>130% MLSS). Reduce target or check MLSS.' },
        { status: 400 },
      );
    }

    // ── Calculate ──
    const result = calculateRunningFueling(inputs);

    return NextResponse.json({ result });
  } catch (err) {
    console.error('[/api/running-fueling]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
