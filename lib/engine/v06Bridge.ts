/**
 * v06Bridge.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Compatibility adapter: maps a MetabolicV06Result produced by the v0.6 profiler
 * engine into the INSCYDToFuelingSenseBridge shape consumed by the existing
 * downstream fueling flow.
 *
 * STATUS: CANDIDATE — parallel to buildBridge() in inscydEngine.ts.
 * The fueling engine (fuelingEngine.ts) is NOT modified by this file.
 *
 * ── Field mapping ─────────────────────────────────────────────────────────────
 *
 *   INSCYDToFuelingSenseBridge field  ← v0.6 source
 *   ──────────────────────────────────────────────────────────────────────────
 *   mlssWatts               ← outputs.mlssWatts   (primary metabolic anchor)
 *   lt1Watts                ← outputs.lt1Watts    (lower anchor; zone display only)
 *   vlamax                  ← outputs.vlamax       (FATmax position modifier)
 *   weight                  ← inputs.weightKg
 *   bodyFat                 ← inputs.bodyFatPct
 *   mlssPerKg               ← mlssWatts / weightKg (rounded 2 dp)
 *   phenotype               ← derived from vlamax  (same thresholds as calcPhenotype)
 *   suggestedLevel          ← derived from mlssPerKg + sex (same as deriveAthleteLevel)
 *   ftpWattsProfilerOnly    ← 0  (v0.6 produces no FTP; field is display-only,
 *                                  never forwarded to fuelingEngine.ts)
 *
 * ── CP isolation ──────────────────────────────────────────────────────────────
 *   outputs.cpWatts is intentionally NOT included in the bridge.
 *   INSCYDToFuelingSenseBridge has no cpWatts field, so there is no path by
 *   which CP can re-enter the fueling engine.
 *
 * ── Optional validation inputs ────────────────────────────────────────────────
 *   p180, p360, p720 live only in result.validation.deviations and result.inputs.
 *   They have no representation in INSCYDToFuelingSenseBridge and therefore
 *   cannot influence any downstream fueling calculation.
 *
 * ── Threshold provenance ──────────────────────────────────────────────────────
 *   deriveV06Phenotype and deriveV06AthleteLevel intentionally replicate (not
 *   import) the logic from inscydEngine.ts to keep v06Bridge isolated from the
 *   legacy 3PT engine. If the thresholds ever change, both files must be updated
 *   together. A comment flags this coupling.
 */

import type { INSCYDToFuelingSenseBridge, AthleteLevel, Phenotype } from '@/lib/types';
import type { MetabolicV06Result } from './metabolicModelV06';


// ── Phenotype classification ──────────────────────────────────────────────────
// Thresholds mirror calcPhenotype() in inscydEngine.ts.
// SYNC NOTE: if thresholds change there, update here too.

function deriveV06Phenotype(vlamax: number): Phenotype {
  if (vlamax < 0.40) return 'Endurance';
  if (vlamax > 0.60) return 'Sprinter';
  return 'Balanced';
}


// ── Athlete level derivation ──────────────────────────────────────────────────
// Thresholds and female offset mirror deriveAthleteLevel() in inscydEngine.ts.
// SYNC NOTE: if thresholds or offset change there, update here too.

function deriveV06AthleteLevel(mlssPerKg: number, sex: 'Male' | 'Female'): AthleteLevel {
  // Female offset: −0.5 W/kg applied consistently across all thresholds.
  // Mirrors the inscydEngine.ts path (with offset), which is the correct downstream path.
  // Note: the /api/fueling GET endpoint derives suggestedLevel WITHOUT this offset —
  // that is a known divergence in the existing code, not introduced here.
  const adj = sex === 'Female' ? 0.5 : 0;
  if      (mlssPerKg >= (4.8 - adj)) return 'Pro';
  else if (mlssPerKg >= (4.0 - adj)) return 'Top Age Group';
  else if (mlssPerKg >= (3.3 - adj)) return 'Competitive';
  else if (mlssPerKg >= (2.7 - adj)) return 'Developmental';
  else if (mlssPerKg >= (2.1 - adj)) return 'Recreational';
  return 'Health & Fitness';
}


// ── Adapter ───────────────────────────────────────────────────────────────────

/**
 * Map a MetabolicV06Result to the INSCYDToFuelingSenseBridge shape.
 *
 * This is the integration point between the v0.6 metabolic profiler and the
 * existing FuelingSense flow. The fueling engine itself is unchanged.
 *
 * @param result  — output of calculateMetabolicProfileV06()
 * @param sex     — athlete sex (required for suggestedLevel female offset;
 *                  not a v0.6 model input — provided at the UI/form layer)
 */
export function buildV06Bridge(
  result: MetabolicV06Result,
  sex: 'Male' | 'Female',
): INSCYDToFuelingSenseBridge {
  const { outputs, inputs } = result;

  // mlssPerKg drives athlete level suggestion and is shown in the UI alongside
  // phenotype. Rounded to 2 dp consistent with the existing bridge.
  const mlssPerKg = outputs.mlssWatts / inputs.weightKg;

  return {
    // ── Primary metabolic anchors ─────────────────────────────────────────
    mlssWatts:  outputs.mlssWatts,
    lt1Watts:   outputs.lt1Watts,

    // ── FATmax position modifier ──────────────────────────────────────────
    // fuelingEngine.ts uses vlamax to shift xf (FATmax fraction of LT2)
    // and scale fatmaxWkg. Neutral value = 0.55 mmol/L/s.
    vlamax:     outputs.vlamax,

    // ── Body composition passthrough ──────────────────────────────────────
    weight:     inputs.weightKg,
    bodyFat:    inputs.bodyFatPct,

    // ── Derived display fields ────────────────────────────────────────────
    mlssPerKg:      Math.round(mlssPerKg * 100) / 100,
    phenotype:      deriveV06Phenotype(outputs.vlamax),
    suggestedLevel: deriveV06AthleteLevel(mlssPerKg, sex),

    // ── VO2max → continuous GE model ─────────────────────────────────────
    vo2maxMlKgMin: outputs.vo2max,

    // ── FTP: not applicable in v0.6 ───────────────────────────────────────
    // v0.6 does not derive FTP. This field is profiler-display-only in the
    // bridge type and is explicitly documented as NOT forwarded to the fueling
    // engine. Set to 0 to satisfy the type contract.
    ftpWattsProfilerOnly: 0,
  };
}
