/**
 * POST /api/inscyd
 * ─────────────────
 * FREE TIER endpoint. No auth required to calculate; auth required to save.
 *
 * Body: InscydInputs
 * Returns: InscydResult (calculated) + optional saved record ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runInscyd4ptSciCalculation } from '@/lib/engine/inscydEngine4pt_v05_scientific';
import { calcTrainingZones, fitLactate, vlaNLow, vlaNHigh, ftpLow, ftpHigh } from '@/lib/engine/inscydEngine';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db';
import type { InscydResult } from '@/lib/types';

const InscydInputSchema = z.object({
  name:     z.string().min(1).max(100),
  bodyMass: z.number().min(30).max(250),
  bodyFat:  z.number().min(3).max(50),
  p20s:     z.number().min(50).max(3000),
  p180:     z.number().min(50).max(1500),
  p360:     z.number().min(50).max(1200),
  p720:     z.number().min(50).max(1000),
  save:     z.boolean().optional().default(false),
  athleteProfileId: z.uuid().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = InscydInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten(i => i.message) }, { status: 400 });
    }

    const { save, athleteProfileId, ...inputs } = parsed.data;

    // Validate power ordering
    if (inputs.p180 <= inputs.p360) {
      return NextResponse.json({ error: 'P180 must be greater than P360' }, { status: 400 });
    }
    if (inputs.p360 <= inputs.p720) {
      return NextResponse.json({ error: 'P360 must be greater than P720' }, { status: 400 });
    }

    // v0.5 4PT engine (always free)
    const sci = runInscyd4ptSciCalculation(inputs);

    // Display helpers (post-processing only — not part of the model)
    // VO2max anchor for zones: sci.ppo = 0.80×P360 + 0.20×P180 (4PT v0.5 engine)
    const zones   = calcTrainingZones(sci.lt1, sci.mlss, sci.ppo, inputs.p20s);
    const lactate = fitLactate(sci.lt1, sci.mlss);

    // Map to InscydResult shape expected by the frontend
    const result: InscydResult = {
      inputs,
      modelVersion: sci.modelVersion,
      ffm:          sci.ffm,
      ppo:          sci.ppo,
      vo2max:       sci.vo2max,
      vlamax:       sci.vlamax,
      ftp:          sci.ftp,
      cp:           sci.cp,
      wPrime:       sci.wPrimeJ,
      wPrimeKj:     sci.wPrimeKj,
      mlss:         sci.mlss,
      lt1:          sci.lt1,
      logSlope:     sci.logSlope,
      phenotype:    sci.phenotype,
      vlaNLow:      vlaNLow(sci.vlamax),
      vlaNHigh:     vlaNHigh(sci.vlamax),
      ftpLow:       ftpLow(sci.ftp),
      ftpHigh:      ftpHigh(sci.ftp),
      zones,
      lactate,
    };

    // Optionally persist if user is authenticated
    let savedId: string | null = null;
    if (save) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json(
          { error: 'Authentication required to save results' },
          { status: 401 },
        );
      }

      const saved = await prisma.inscydResult.create({
        data: {
          userId:           user.id,
          athleteProfileId: athleteProfileId ?? null,
          // 4PT power inputs (added: audit phase 4)
          p20sWatts:   inputs.p20s,
          p180Watts:   inputs.p180,
          p360Watts:   inputs.p360,
          p720Watts:   inputs.p720,
          // Legacy 3PT columns — retained for DB compat; written as placeholder values
          p300Watts:   0,
          p12minWatts: null,
          bodyMassKg:  inputs.bodyMass,
          bodyFatPct:  inputs.bodyFat,
          vo2max:      result.vo2max,
          vlamax:      result.vlamax,
          ftpWatts:    result.ftp,
          cpWatts:     result.cp,
          wPrimeJ:     result.wPrime,
          mlssWatts:   result.mlss,
          lt1Watts:    result.lt1,
          phenotype:   result.phenotype,
          resultJson:  result as object,
        },
      });
      savedId = saved.id;
    }

    return NextResponse.json({ result, savedId });
  } catch (err: unknown) {
    console.error('[/api/inscyd]', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/inscyd?id=<uuid>
 * Returns a previously saved INSCYD result (auth required, own records only).
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id param required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const record = await prisma.inscydResult.findFirst({
    where: { id, userId: user.id },
  });
  if (!record) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ result: record.resultJson, id: record.id });
}