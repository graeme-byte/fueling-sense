/**
 * fuelingEngine.ts
 * ────────────────
 * Pure calculation engine for the Fuelling Sense Substrate Calculator.
 *
 * Pipeline source of truth: MODEL_EQUATIONS.md
 * Before changing any formula or constant below, verify against MODEL_EQUATIONS.md.
 *
 * Fat-oxidation model (piecewise — per MODEL_EQUATIONS.md §7 Step 3):
 *
 *   Left side (x ≤ xf):
 *     For x < x_left: linear from (0, 0) to (x_left, fat_left).
 *     For x ∈ [x_left, xf]: smoothstep rise to FATmax peak.
 *       u = (x − x_left) / (xf − x_left)
 *       fat(x) = fat_left + (fat_peak − fat_left) × (3u² − 2u³)
 *       where x_left = 0.50, fat_left = 0.75 × FATmax_g_h
 *
 *   Right side (x > xf): curvature-controlled Hermite cubic decay.
 *     t     = (x − xf) / (xz − xf)
 *     t_adj = t ^ alpha   (alpha = 1.8 − 0.4 × vlamaxNorm; higher VLamax → steeper drop)
 *     fat(x) = fat_peak × (1 − 3·t_adj² + 2·t_adj³)
 *     Guarantees: fat(xf)=fat_peak, fat(xz)=0, monotone.
 *
 *   Beyond xz: fat = 0 (hard FATzero boundary).
 *
 * where x = watts / mlssWatts (relative intensity).
 *
 * ALL functions are pure — no React, no side-effects.
 */

import type {
  FuelingInputs,
  FuelingResult,
  AthleteLevel,
  IntensityZoneLabel,
  CarbRequirementAdvice,
  GapAnalysisAdvice,
  FuelingAdvice,
  FuelingStrategyAdvice,
  IntensityAlignment,
  StrategyLabel,
  PrimaryProblem,
  ActionPriority,
  StrategyFlags,
  EventType,
  DenseSubstratePoint,
  ZoneSubstratePoint,
  ZoneSubstrateRow,
} from '@/lib/types';

// ─────────────────────────────────────────────────────────────────
//  LOOKUP TABLES — Physiology pattern model
//
//  Athlete level is determined upstream from VO2max; the fueling engine
//  uses it as a phenotype row selector, not a derived quantity.
//  VLamax then moves the athlete within that row (low ↔ median ↔ high).
// ─────────────────────────────────────────────────────────────────

// 1. Gross Efficiency — continuous VO2max-based model (GE1)
//    GE = 0.2443 − 0.000259 × VO2max_rel (ml/kg/min), clamped [0.20, 0.27].
//    When VO2max is absent (manual-entry without INSCYD prefill), defaults to 0.232.
function deriveGE(vo2maxMlKgMin: number | undefined): number {
  if (vo2maxMlKgMin === undefined || !isFinite(vo2maxMlKgMin)) {
    return 0.232;   // dataset mean GE_ideal — no level dependency
  }
  return Math.max(0.20, Math.min(0.27, 0.2443 - 0.000259 * vo2maxMlKgMin));
}

// 2. Substrate energy coefficients — per MODEL_EQUATIONS.md §7 Steps 4–5
const FAT_KCAL_PER_G = 9.47;    // fat_kcal_h = fat_g_h × 9.47
const CHO_KCAL_PER_G = 4.18;    // cho_g_h = cho_kcal_h / 4.18

// 3. Level derivation from MLSS/weight — used internally for xz and exported for DB storage.
// NOTE: No female offset is applied here. This is intentional — the level is used as a
//   substrate-curve anchor (xz), not a display classification. Display-layer alternatives
//   that apply sex-specific offsets: v06Bridge.ts::buildV06Bridge (suggestedLevel) and
//   athleteBenchmarks.ts::classifyLT2Wkg (UI badge). Do not add an offset here.
export function deriveAthleteLevel(mlssWatts: number, weight: number): AthleteLevel {
  const wkg = mlssWatts / weight;
  if   (wkg >= 4.8) return 'Pro';
  if   (wkg >= 4.0) return 'Top Age Group';
  if   (wkg >= 3.3) return 'Competitive';
  if   (wkg >= 2.7) return 'Developmental';
  if   (wkg >= 2.1) return 'Recreational';
  return 'Health & Fitness';
}

// 4. FATzero base by level — VLamax-shifted to give xz.
//    Standard diet: fatzeroBase derived from MLSS/weight; Keto diet: fixed 1.10.
//    All other curve parameters (xf, fatmax magnitude) are now continuous.
const FATZERO_BASE: Record<AthleteLevel, number> = {
  'Health & Fitness': 0.95,
  'Recreational':     0.97,
  'Developmental':    1.00,
  'Competitive':      1.02,
  'Top Age Group':    1.04,
  'Pro':              1.06,
};
const FATZERO_BASE_KETO = 1.10;

// 5. Keto FATmax position — pattern row retained for Keto-only xf interpolation.
//    Standard diet uses M3 continuous formula; Keto uses this table.
const KETO_FATMAX = { fatmaxLow: 0.70, fatmaxMedian: 0.75, fatmaxHigh: 0.80 } as const;

// ─────────────────────────────────────────────────────────────────
//  FAT OXIDATION CURVE  — smoothstep rise + alpha-controlled Hermite decay
//
//  Per MODEL_EQUATIONS.md §7 Step 3.
//  Before changing this logic, verify against MODEL_EQUATIONS.md.
//
//  Left side  (x ≤ xf):
//    For x < LEFT_ANCHOR_X: linear from (0,0) to (LEFT_ANCHOR_X, fatLeft).
//    For x ∈ [LEFT_ANCHOR_X, xf]: smoothstep rise to FATmax peak.
//      u       = (x − LEFT_ANCHOR_X) / (xf − LEFT_ANCHOR_X)
//      fat(x)  = fatLeft + (fatmax − fatLeft) × (3u² − 2u³)
//      Guarantees: f(x_left)=fatLeft, f(xf)=fatmax, zero slope at both ends, monotone.
//
//  Right side (x > xf): curvature-controlled Hermite cubic decay.
//    t     = (x − xf) / (xz − xf)
//    tAdj  = t ^ alpha   (alpha = 1.8 − 0.4 × vlamaxNorm, stored in curve.alpha)
//    fat(x) = fatmax × (1 − 3·tAdj² + 2·tAdj³)
//    alpha > 1 slows the initial drop. Higher VLamax → higher alpha → steeper decay.
//    Guarantees: f(xf)=fatmax, f(xz)=0, monotone, continuous.
//
//  Beyond xz: zero (hard FATzero boundary).
// ─────────────────────────────────────────────────────────────────

const LEFT_ANCHOR_X = 0.50;  // x_left: left boundary (fraction of MLSS)
// DECAY_ALPHA_NEUTRAL = 1.8 is the reference; actual alpha = 1.8 − 0.4 × vlamaxNorm (computed per athlete in runFuelingCalculation)

interface FatCurve {
  fatmax:  number;  // FATmax_g_h — peak fat oxidation
  fatLeft: number;  // fat at left anchor = 0.75 × fatmax
  xf:      number;  // FATmax position (fraction of MLSS)
  xz:      number;  // FATzero position (fraction of MLSS)
  alpha:   number;  // decay curvature exponent (1.8 − 0.4 × vlamaxNorm)
}

function buildFatCurve(fatmax: number, xf: number, xz: number, alpha: number): FatCurve {
  return { fatmax, fatLeft: 0.75 * fatmax, xf, xz, alpha };
}

// Evaluate fat oxidation (g/h) at normalised intensity x = watts / mlssWatts.
function evalFatCurve(x: number, curve: FatCurve): number {
  const { fatmax, fatLeft, xf, xz } = curve;
  if (x >= xz) return 0;
  if (x <= xf) {
    // Ascending
    if (xf <= 0) return 0;
    if (x <= 0)  return 0;
    if (xf <= LEFT_ANCHOR_X) {
      // FATmax is at or below left anchor — no distinct ascending segment
      return Math.max(0, fatmax * (x / xf));
    }
    if (x <= LEFT_ANCHOR_X) {
      // Below left anchor: linear from (0, 0) to (LEFT_ANCHOR_X, fatLeft)
      return Math.max(0, fatLeft * (x / LEFT_ANCHOR_X));
    }
    // Smoothstep rise from (LEFT_ANCHOR_X, fatLeft) to (xf, fatmax).
    // u = (x − x_left) / (xf − x_left);  fat = fatLeft + (fatmax − fatLeft) × (3u² − 2u³)
    const u = (x - LEFT_ANCHOR_X) / (xf - LEFT_ANCHOR_X);
    return fatLeft + (fatmax - fatLeft) * (3 * u * u - 2 * u * u * u);
  }
  // Curvature-controlled Hermite cubic decay: fatmax × (1 − 3·tAdj² + 2·tAdj³)
  const t    = (x - xf) / (xz - xf);
  const tAdj = Math.pow(t, curve.alpha);
  return Math.max(0, fatmax * (1 - 3 * tAdj * tAdj + 2 * tAdj * tAdj * tAdj));
}

// ─────────────────────────────────────────────────────────────────
//  METABOLIC COST
//  = (watts / GE) × 3600 / 4184  → kcal/h
// ─────────────────────────────────────────────────────────────────

export function metabolicCostKcal(watts: number, ge: number): number {
  return (watts / ge) * 3600 / 4184;
}

// ─────────────────────────────────────────────────────────────────
//  SUBSTRATE AT ONE INTENSITY POINT
//  x = watts / mlssWatts
// ─────────────────────────────────────────────────────────────────

interface SubstratePoint {
  kcalPerHour: number;
  fatKcal:     number;
  fatG:        number;
  choKcal:     number;
  choG:        number;
  fatPct:      number;
  choPct:      number;
}

function substrateAtIntensity(
  x:         number,    // fraction of MLSS
  mlssWatts: number,
  ge:        number,
  curve:     FatCurve,
): SubstratePoint {
  const watts       = mlssWatts * x;
  const kcalPerHour = metabolicCostKcal(watts, ge);
  const fatG        = evalFatCurve(x, curve);
  const fatKcal     = fatG * FAT_KCAL_PER_G;
  const choKcal     = Math.max(0, kcalPerHour - fatKcal);
  const choG        = choKcal / CHO_KCAL_PER_G;
  const total       = fatKcal + choKcal;
  const fatPct      = total > 0 ? (fatKcal / total) * 100 : 0;
  const choPct      = total > 0 ? (choKcal / total) * 100 : 0;
  return { kcalPerHour, fatKcal, fatG, choKcal, choG, fatPct, choPct };
}

// ─────────────────────────────────────────────────────────────────
//  INTENSITY ZONE LABEL
// ─────────────────────────────────────────────────────────────────

function intensityZoneLabel(
  targetWatts: number,
  lt1Watts:    number,
  mlssWatts:   number,
): IntensityZoneLabel {
  if (targetWatts >= mlssWatts) return 'Above LT2';
  // Guard: only classify 'Below LT1' when lt1 is explicitly set (> 0).
  // When lt1Watts === 0 (manual entry, no INSCYD prefill) the comparison
  // targetWatts < 0 is never true, so this branch was silently wrong.
  if (lt1Watts > 0 && targetWatts < lt1Watts) return 'Below LT1';
  return 'LT1–LT2';
}

// ─────────────────────────────────────────────────────────────────
//  ZONE SUBSTRATE TABLE
//
//  Standard LT2-anchored zones used ONLY for the substrate range
//  table in the fueling UI.  These do NOT affect any other zone
//  system elsewhere in the app.
//
//  Zone 1  = 30–59 % LT2   Zone 3b = 86–96 % LT2
//  Zone 2  = 60–77 % LT2   Zone 4  = 97–102% LT2
//  Zone 3a = 78–85 % LT2   Zone 5a = 103–120% LT2
//                            Zone 5b = 121–150% LT2
// ─────────────────────────────────────────────────────────────────

const FUELING_SUBSTRATE_ZONES: ReadonlyArray<{
  name: string; label: string; lowPct: number; highPct: number;
}> = [
  { name: 'Zone 1',  label: 'Recovery',         lowPct: 0.30, highPct: 0.59 },
  { name: 'Zone 2',  label: 'Base Endurance',    lowPct: 0.60, highPct: 0.77 },
  { name: 'Zone 3a', label: 'Aerobic Threshold', lowPct: 0.78, highPct: 0.85 },
  { name: 'Zone 3b', label: 'Tempo',             lowPct: 0.86, highPct: 0.96 },
  { name: 'Zone 4',  label: 'Threshold',         lowPct: 0.97, highPct: 1.02 },
  { name: 'Zone 5a', label: 'Sub-VO2max',        lowPct: 1.03, highPct: 1.20 },
  { name: 'Zone 5b', label: 'VO2max+',           lowPct: 1.21, highPct: 1.50 },
];

function evalForZoneTable(
  watts:     number,
  mlssWatts: number,
  ge:        number,
  curve:     FatCurve,
): ZoneSubstratePoint {
  if (watts <= 0) return { fatG: 0, choG: 0, kcalPerHour: 0 };
  const x           = watts / mlssWatts;
  const kcalPerHour = Math.round(metabolicCostKcal(watts, ge));
  const fatG        = Math.round(evalFatCurve(x, curve));
  const fatKcal     = fatG * FAT_KCAL_PER_G;
  const choG        = Math.round(Math.max(0, kcalPerHour - fatKcal) / CHO_KCAL_PER_G);
  return { fatG, choG, kcalPerHour };
}

export function buildZoneSubstrateTable(
  mlssWatts: number,
  ge:        number,
  curve:     FatCurve,
): ZoneSubstrateRow[] {
  const MODEL_MAX = Math.round(1.50 * mlssWatts);   // zone 5b ceiling

  return FUELING_SUBSTRATE_ZONES.map(z => {
    const low  = Math.round(z.lowPct  * mlssWatts);
    const high = Math.min(Math.round(z.highPct * mlssWatts), MODEL_MAX);
    const mid  = Math.round((low + high) / 2);
    return {
      name:   z.name,
      label:  z.label,
      low,
      mid,
      high,
      atLow:  evalForZoneTable(low,  mlssWatts, ge, curve),
      atMid:  evalForZoneTable(mid,  mlssWatts, ge, curve),
      atHigh: evalForZoneTable(high, mlssWatts, ge, curve),
    };
  });
}

// ─────────────────────────────────────────────────────────────────
//  DENSE SUBSTRATE SERIES
//
//  Evaluates the model at every integer watt from 50%–150% LT2.
//  This is the single source of truth for:
//    • the substrate chart (filtered to ≤120% LT2)
//    • CARB90 threshold detection
//
//  CHO monotonic cap is applied: once CHO starts decreasing with power,
//  it is clamped to stay flat rather than rebounding.
//
//  choG is stored UNROUNDED so that CARB90 interpolation is precise.
// ─────────────────────────────────────────────────────────────────

export function buildDenseSubstrateSeries(
  mlssWatts: number,
  ge:        number,
  curve:     FatCurve,
): DenseSubstratePoint[] {
  // Dense series: 1 W → 150% MLSS per MODEL_EQUATIONS.md §7 Step 7.
  const wEnd = Math.round(1.50 * mlssWatts);

  type Raw = { w: number; fatG: number; choG: number; kcalH: number; fatKcalH: number; choKcalH: number };
  const raw: Raw[] = [];

  for (let w = 1; w <= wEnd; w++) {
    const kcalH    = metabolicCostKcal(w, ge);
    const fatG     = evalFatCurve(w / mlssWatts, curve);
    const fatKcalH = fatG * FAT_KCAL_PER_G;
    const choKcalH = Math.max(0, kcalH - fatKcalH);
    const choG     = choKcalH / CHO_KCAL_PER_G;       // unrounded — CARB90 precision
    raw.push({ w, fatG, choG, kcalH, fatKcalH, choKcalH });
  }

  // ── CHO monotonicity enforcement (backward min pass) ──
  // Per MODEL_EQUATIONS.md §7 Step 6: cho[i] = min(cho[i], cho[i+1])
  // Caps any early CHO spike down to match the value at the next higher power.
  // Fat is recalculated from energy balance to keep fat + cho = total at every point.
  for (let i = raw.length - 2; i >= 0; i--) {
    if (raw[i].choKcalH > raw[i + 1].choKcalH) {
      const cappedChoKcalH = raw[i + 1].choKcalH;
      const cappedChoG     = raw[i + 1].choG;
      const corrFatKcalH   = Math.max(0, raw[i].kcalH - cappedChoKcalH);
      const corrFatG       = corrFatKcalH / FAT_KCAL_PER_G;
      raw[i] = { ...raw[i], choKcalH: cappedChoKcalH, choG: cappedChoG, fatKcalH: corrFatKcalH, fatG: corrFatG };
    }
  }

  return raw.map(p => {
    const total = p.fatKcalH + p.choKcalH;
    return {
      watts:       p.w,
      pctLT2:      Math.round((p.w / mlssWatts) * 100),
      fatG:        Math.round(p.fatG * 10) / 10,
      choG:        p.choG,                             // unrounded — CARB90 precision
      kcalPerHour: Math.round(p.kcalH),
      fatKcalH:    Math.round(p.fatKcalH),
      choKcalH:    Math.round(p.choKcalH),
      fatPct:      total > 0 ? Math.round((p.fatKcalH / total) * 100) : 0,
    };
  });
}

// ─────────────────────────────────────────────────────────────────
//  CARB90 THRESHOLD SOLVER
//
//  Scans denseSubstrateSeries for the first crossing where
//  choG crosses from <90 to ≥90, then interpolates:
//
//    CARB90_W = W1 + (90 − CHO1) × (W2 − W1) / (CHO2 − CHO1)
//
//  By construction of linear interpolation, choAtCarb90 = 90.0
//  exactly. Rounding is applied only to the display watts.
// ─────────────────────────────────────────────────────────────────

export function buildCarb90(
  dense:     DenseSubstratePoint[],
  mlssWatts: number,
): { watts: number; pctLT2: number; found: boolean; choAtCarb90: number } {
  for (let i = 1; i < dense.length; i++) {
    const p1 = dense[i - 1];
    const p2 = dense[i];

    if (p1.choG < 90 && p2.choG >= 90) {
      // Linear interpolation — spec formula
      const carb90W      = p1.watts + (90 - p1.choG) * (p2.watts - p1.watts) / (p2.choG - p1.choG);
      const displayWatts = Math.round(carb90W);
      // By construction: p1.choG + (p2.choG - p1.choG) * (carb90W - p1.watts) = 90.0
      return {
        watts:       displayWatts,
        pctLT2:      Math.round((displayWatts / mlssWatts) * 100),
        found:       true,
        choAtCarb90: 90,
      };
    }
  }

  const last = dense[dense.length - 1];
  return {
    watts:       last.watts,
    pctLT2:      last.pctLT2,
    found:       false,
    choAtCarb90: Math.round(last.choG),
  };
}

// ─────────────────────────────────────────────────────────────────
//  ADVICE BUILDERS
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
//  FUELING STRATEGY ADVICE
//  Classifies intensity vs expected range for event type/duration.
//  Pure advisory layer — does not modify any substrate calculation.
// ─────────────────────────────────────────────────────────────────

// Expected intensity ranges as fraction of LT2 by duration bucket.
const STRATEGY_RANGES: Record<string, { low: number; high: number }> = {
  '<2h':  { low: 0.90, high: 1.00 },
  '2–4h': { low: 0.78, high: 0.90 },
  '>4h':  { low: 0.65, high: 0.78 },
};

function durationBucket(eventType: EventType): '<2h' | '2–4h' | '>4h' {
  if (eventType.includes('<2h'))  return '<2h';
  if (eventType.includes('>4h'))  return '>4h';
  return '2–4h';
}

// Graded language for underfueling gap size in nutrition analysis text.
//   ≤10%  → "close to"      (minor shortfall — mild language)
//   ≤20%  → "short of"      (moderate shortfall)
//   >20%  → "well short of" (significant shortfall)
function getGapDescriptor(gapPercent: number): string {
  if (gapPercent <= 0.10) return 'close to';
  if (gapPercent <= 0.20) return 'short of';
  return 'well short of';
}

// Graded language for overfueling (planned > required).
//   ≤10%  → "close to"     (slight buffer — neutral language)
//   ≤20%  → "slightly above" (moderate overshoot)
//   >20%  → "well above"   (material excess)
function getPositiveGapDescriptor(overshootPct: number): string {
  if (overshootPct <= 0.10) return 'close to';
  if (overshootPct <= 0.20) return 'slightly above';
  return 'well above';
}

// ─────────────────────────────────────────────────────────────────
//  PRIMARY PROBLEM CLASSIFIER
//
//  Identifies WHAT is wrong with the strategy — independent of the
//  achievability label. Used as the machine-readable diagnosis field.
//
//  Priority order (highest wins):
//    1. Over-fueling (planned > required) — by severity
//    2. Ceiling exceeded (required > 120 g/h)
//    3. High-intensity scenarios (ABOVE alignment)
//    4. Intake-only problem
//    5. Well-aligned / manageable
// ─────────────────────────────────────────────────────────────────

function classifyPrimaryProblem(
  alignment: IntensityAlignment,
  req:       number,    // rounded required CHO g/h
  planned:   number,    // rounded planned CHO g/h
  gap:       number,    // req − planned; positive = underfueling
): PrimaryProblem {
  const overshootPct = req > 0 ? (planned - req) / req : 0;  // positive when planned > required

  // ── Over-fueling (planned exceeds required by more than 5 g/h) ───
  if (gap < -5) {
    if (planned > 120)         return 'overfueled_excessive';
    if (overshootPct > 0.20)   return 'overfueled_aggressive';  // >20% above
    if (overshootPct > 0.10)   return 'overfueled_buffered';    // 10–20% above
    return 'manageable_with_buffer';                             // ≤10% above — acceptable buffer
  }

  // ── Extreme demand ────────────────────────────────────────────────
  if (req > 120) return 'ceiling_exceeded';

  // ── Well aligned (within ±5 g/h) — pacing sets the label ─────────
  if (gap <= 5) {
    return alignment === 'ABOVE' ? 'aggressive_but_supported' : 'manageable';
  }

  // ── Underfueling (gap > 5 g/h) ────────────────────────────────────
  if (alignment === 'ABOVE') {
    if (req > 90 && gap > 20) return 'both_demand_and_intake';
    return 'demand_too_high';
  }

  return 'intake_too_low';
}

// Derives the correct first action from a primary problem classification.
// When planned intake is already > 120 g/h, increasing intake is never the action.
function deriveActionPriority(
  primaryProblem: PrimaryProblem,
  planned:        number,
): ActionPriority {
  switch (primaryProblem) {
    case 'manageable':
    case 'manageable_with_buffer':
    case 'aggressive_but_supported':
      return 'maintain';
    case 'intake_too_low':
      // Guard: if athlete is already above 120 g/h, increasing is not an option.
      return planned > 120 ? 'reduce_pacing_or_build_physiology' : 'increase_intake';
    case 'demand_too_high':
      return planned > 120 ? 'reduce_pacing_or_build_physiology' : 'reduce_pacing';
    case 'both_demand_and_intake':
      return planned > 120 ? 'reduce_pacing_or_build_physiology' : 'increase_intake_and_reduce_pacing';
    case 'ceiling_exceeded':
      return 'reduce_pacing_or_build_physiology';
    case 'overfueled_buffered':
    case 'overfueled_aggressive':
    case 'overfueled_excessive':
      return 'reduce_intake';
    default:
      return 'maintain';
  }
}

// Duration-aware gap tolerance thresholds.
//
// Gap definitions (applied consistently throughout recommendation and assessment layers):
//   gap    = planned - recommended  (positive = overfueling vs recommended)
//   absGap = |gap|
//   gapPct = absGap / recommended
//
// GREEN (OR conditions — any one condition sufficient):
//   SHORT:  planned in [30,60] band, OR absGap ≤ 25 g/h, OR gapPct ≤ 0.40
//   MEDIUM: absGap ≤ 20 g/h, OR gapPct ≤ 0.25
//   LONG:   absGap ≤ 15 g/h, OR gapPct ≤ 0.20
//
// AMBER: not GREEN AND gapPct ≤ amberPct
// RED:   gapPct > amberPct
//
// Rationale: SHORT events are permissive (blood-glucose support focus, glycogen stores
// bridge the gap); MEDIUM events balance gap closure with GI-risk avoidance;
// LONG events are strict (cumulative deficit compounds substantially at >4 h).

interface GapToleranceThresholds {
  greenAbsG:      number;   // absolute g/h gap threshold for GREEN (OR condition)
  greenPct:       number;   // percentage gap threshold for GREEN (OR condition)
  amberPct:       number;   // percentage threshold for AMBER cutoff
  shortBandGreen: boolean;  // SHORT only: planned in [30, 60] also qualifies as GREEN
}

function getGapTolerance(bucket: '<2h' | '2–4h' | '>4h'): GapToleranceThresholds {
  if (bucket === '<2h')  return { greenAbsG: 25, greenPct: 0.40, amberPct: 0.70, shortBandGreen: true };
  if (bucket === '2–4h') return { greenAbsG: 20, greenPct: 0.25, amberPct: 0.50, shortBandGreen: false };
  return { greenAbsG: 15, greenPct: 0.20, amberPct: 0.40, shortBandGreen: false };
}

// ─────────────────────────────────────────────────────────────────
//  STRATEGY LABEL CLASSIFIER
//  Combined pacing + fueling achievability, 6-level scale.
//  Inputs: pacing alignment, headroom within range, fueling gap,
//          and duration-based tolerance thresholds from getGapTolerance().
//
//  Pacing headroom:
//    margin > 0  → target is below range (conservative)
//    margin = 0  → target is within range (normalised 0–1: 0 = low end, 1 = high end)
//    above range → target exceeds high boundary
//
//  Fueling gap fraction (gapPct = |planned - required| / required):
//    LOW   absGapPct <= greenThreshold   (duration-adjusted)
//    MOD   absGapPct <= amberThreshold   (duration-adjusted)
//    HIGH  absGapPct >  amberThreshold   (duration-adjusted)
// ─────────────────────────────────────────────────────────────────

function classifyStrategyLabel(
  alignment:      IntensityAlignment,
  pct:            number,   // target / LT2
  rangeLow:       number,
  rangeHigh:      number,
  recommendedCHO: number,   // gap computed vs recommended, not required
  plannedCHO:     number,
  tol:            GapToleranceThresholds,
): StrategyLabel {
  const gap    = plannedCHO - recommendedCHO;  // positive = overfueling
  const absGap = Math.abs(gap);
  const gapPct = recommendedCHO > 0 ? absGap / recommendedCHO : 0;

  const fuelLow  = absGap <= tol.greenAbsG || gapPct <= tol.greenPct;
  const fuelMod  = !fuelLow && gapPct <= tol.amberPct;
  const fuelHigh = !fuelLow && !fuelMod;

  // How far into the range the target sits (0 = at low end, 1 = at high end).
  const rangeWidth  = rangeHigh - rangeLow;
  const rangePos    = rangeWidth > 0 ? (pct - rangeLow) / rangeWidth : 0;  // clamped below
  const upperHalf   = rangePos > 0.5;

  // How far above the range (as a fraction of rangeWidth) the target sits.
  const overRun = rangeWidth > 0 ? (pct - rangeHigh) / rangeWidth : 0;
  const farAbove = overRun > 0.5;   // more than half a range-width above ceiling

  if (alignment === 'BELOW') {
    // Conservative pacing — use fueling gap to differentiate.
    return fuelLow ? 'Easily Achievable' : fuelMod ? 'Achievable' : 'Needs Work';
  }

  if (alignment === 'WITHIN') {
    if (!upperHalf && fuelLow)  return 'Easily Achievable';
    if (!upperHalf && fuelMod)  return 'Achievable';
    if (!upperHalf && fuelHigh) return 'Needs Work';
    if (upperHalf  && fuelLow)  return 'Achievable';
    if (upperHalf  && fuelMod)  return 'Needs Work';
    /* upperHalf && fuelHigh */  return 'Reaching';
  }

  // ABOVE range
  if (farAbove || fuelHigh) return 'Rethink';
  return fuelMod ? 'Overreaching' : 'Reaching';
}

export function buildFuelingStrategyAdvice(
  eventType:   EventType,
  targetWatts: number,
  mlssWatts:   number,
  requiredCHO: number,   // g/h — from substrate model
  plannedCHO:  number,   // g/h — athlete's intended intake
): FuelingStrategyAdvice {
  const bucket     = durationBucket(eventType);
  const range      = STRATEGY_RANGES[bucket];
  const tol        = getGapTolerance(bucket);
  const pct        = targetWatts / mlssWatts;
  const pctDisplay = Math.round(pct * 100);
  const req        = Math.round(requiredCHO);
  const planned    = Math.round(plannedCHO);
  const gap        = req - planned;      // positive = underfueling
  const largeGap   = gap > 20;           // >20 g/h deficit is materially significant

  const alignment: IntensityAlignment =
    pct < range.low  ? 'BELOW' :
    pct > range.high ? 'ABOVE' : 'WITHIN';

  // Duration context for nutrition advice — explains why the gap tolerance is what it is.
  const durationContext =
    bucket === '<2h'
      ? 'For short events, focus on maintaining blood glucose rather than matching total carbohydrate use. Your glycogen stores can bridge the gap over this duration.'
      : bucket === '2–4h'
      ? 'For medium-duration events, aim to reduce the gap while staying within practical and tolerable intake limits. Glycogen depletion risk grows meaningfully with duration.'
      : 'For long events, fueling precision matters more. Minimise the deficit as much as practical, and adjust pacing if intake cannot support demand.';

  // ── Nutrition Analysis ──────────────────────────────────────────
  let nutritionAnalysis: string;

  if (gap > 5) {
    // Planned intake is meaningfully below requirement.
    const gapPct     = req > 0 ? gap / req : 0;
    const descriptor = getGapDescriptor(gapPct);

    if (planned > 120) {
      // Guard: planned is already above 120 g/h — the practical absorption ceiling.
      // Never recommend increasing intake further. Redirect to demand-side solutions.
      nutritionAnalysis =
        `Your planned intake of ${planned} g/h is ${descriptor} your estimated requirement of ${req} g/h, ` +
        `but is already above 120 g/h — the practical limit of gut absorption for most athletes. ` +
        `Increasing intake further is not recommended. ` +
        `Priority: reduce target intensity to lower carbohydrate demand, ` +
        `or improve fat oxidation and aerobic capacity through training to reduce reliance on carbohydrate.`;
    } else {
      const ratioGuidance =
        req > 90
          ? 'As intake increases, mixed carbohydrate sources become important — move toward 2:1 glucose:fructose, and toward ~0.8:1 at higher intakes.'
          : 'Standard single-source carbohydrate works at this intake level, but multi-source options improve comfort at higher loads.';

      nutritionAnalysis =
        `Your planned intake of ${planned} g/h is ${descriptor} your estimated requirement of ${req} g/h. ` +
        `To better support this effort, begin experimenting with higher carbohydrate intakes during race-specific sessions. ` +
        `${ratioGuidance} ` +
        `Increase intake gradually and progressively to allow gut adaptation.`;
    }

  } else if (gap < -5) {
    // Planned intake exceeds requirement — use graded positive-gap language.
    const overshootPct  = req > 0 ? (planned - req) / req : 0;
    const overDescriptor = getPositiveGapDescriptor(overshootPct);

    nutritionAnalysis =
      `Your planned intake of ${planned} g/h is ${overDescriptor} your estimated requirement of ${req} g/h. ` +
      (planned > 120
        ? `Intake above 120 g/h is at the practical limit of absorption capacity and carries GI risk unless specifically trained. Ensure this has been tested in race conditions.`
        : `This provides a useful buffer, but ensure your gut is trained to handle this volume reliably under race stress.`);

  } else {
    // Well aligned (within ±5 g/h)
    nutritionAnalysis =
      `Your planned intake of ${planned} g/h is well aligned with your estimated requirement of ${req} g/h. ` +
      (req > 90
        ? `At this intake level, multi-source carbohydrate (2:1 glucose:fructose) will improve absorption and reduce GI risk. Focus on consistency and timing.`
        : `Standard fueling protocols should cover this comfortably. Focus on consistent delivery and timing rather than volume.`);
  }

  nutritionAnalysis += ` ${durationContext}`;

  // ── Pacing Analysis ─────────────────────────────────────────────
  let pacingAnalysis: string;

  const intensityLine =
    alignment === 'WITHIN' ? `At ${pctDisplay}% LT2, your target is well aligned with a ${eventType} effort and supports sustainable output given appropriate training.`
    : alignment === 'ABOVE' ? `At ${pctDisplay}% LT2, your target is above the typical range for a ${eventType} effort (expected ≤${Math.round(range.high * 100)}% LT2). Sustaining this output for the full duration will be demanding.`
    : /* BELOW */             `At ${pctDisplay}% LT2, your target is below the typical range for a ${eventType} effort (expected ≥${Math.round(range.low * 100)}% LT2). This is a conservative pacing strategy.`;

  const isTri = eventType.startsWith('Triathlon');

  if (alignment === 'WITHIN') {
    if (largeGap) {
      pacingAnalysis =
        `${intensityLine} ` +
        `However, with the current fueling gap, you may struggle to maintain this intensity over longer durations` +
        (isTri ? ` or run effectively off the bike` : ``) +
        `. ` +
        `Reducing your target slightly or increasing carbohydrate intake would reduce this risk.`;
    } else {
      pacingAnalysis =
        `${intensityLine} ` +
        `Your fueling plan supports this pacing. Focus on consistent execution — timing and delivery matter more than last-minute adjustments.`;
    }

  } else if (alignment === 'ABOVE') {
    pacingAnalysis =
      `${intensityLine} ` +
      (largeGap
        ? `Combined with the current fueling gap, the risk of underperforming late in the effort` +
          (isTri ? ` or off the bike` : ``) +
          ` is meaningful. Reducing target power toward ${Math.round(range.high * mlssWatts)}W, increasing carbohydrate intake, or both would improve sustainability.`
        : `If this pacing is intentional, ensure your fueling plan is rehearsed and gut-trained. ` +
          `If not, reducing toward ${Math.round(range.high * mlssWatts)}W would lower demand and improve sustainability.`);

  } else {
    // BELOW
    pacingAnalysis =
      `${intensityLine} ` +
      `Fat oxidation will contribute more at this intensity — carbohydrate demand is lower and fueling is less complex. ` +
      (largeGap
        ? `Even so, the current fueling gap should be addressed. Underfueling at any intensity accumulates over long efforts.`
        : `Your fueling plan is appropriate for this pacing. ` +
          `If performance is the priority, there may be room to raise intensity while staying within your fueling capacity.`);
  }

  const recommended    = computeRecommendedTarget(req, eventType);
  const strategyLabel  = classifyStrategyLabel(
    alignment, pct, range.low, range.high, recommended, planned, tol,
  );
  const primaryProblem = classifyPrimaryProblem(alignment, req, planned, gap);
  const actionPriority = deriveActionPriority(primaryProblem, planned);

  const flags: StrategyFlags = {
    highIntakePlanned:    planned > 90,
    extremeIntakePlanned: planned > 120,
    extremeDemand:        req > 120,
    highDemand:           req > 90,
    pacingAboveRange:     alignment === 'ABOVE',
    largeFuelingGap:      gap > 20,
  };

  return {
    eventType,
    intensityPctLT2:   Math.round(pct * 1000) / 1000,
    expectedRangeLow:  range.low,
    expectedRangeHigh: range.high,
    alignment,
    strategyLabel,
    primaryProblem,
    actionPriority,
    flags,
    nutritionAnalysis,
    pacingAnalysis,
  };
}

export function buildCarbRequirementAdvice(requiredCHO_gph: number): CarbRequirementAdvice {
  const r     = Math.round(requiredCHO_gph);
  const level: 'GREEN' | 'AMBER' | 'RED' =
    r <= 90 ? 'GREEN' : r <= 120 ? 'AMBER' : 'RED';
  const highIntakeFlag = r > 90;

  let performanceText: string;
  let riskText:        string;
  let decisionText:    string;

  if (level === 'GREEN') {
    performanceText = 'Low carbohydrate demand. Standard fueling should comfortably support this target.';
    riskText        = 'Fueling demand remains within a practical range for most athletes.';
    decisionText    = 'You can maintain this target with a conventional fueling plan.';
  } else if (level === 'AMBER') {
    performanceText = 'Moderate carbohydrate demand. Structured fueling will help maintain energy availability and preserve performance.';
    riskText        = 'Fueling demand is meaningful and should be planned rather than left ad hoc.';
    decisionText    = 'You should use a practiced carbohydrate strategy to support this target.';
  } else {
    performanceText = 'High carbohydrate demand. This effort requires a deliberate high-carbohydrate strategy to sustain output.';
    riskText        = 'This requirement exceeds typical absorption capacity and will challenge gut tolerance.';
    decisionText    = 'If this intake is not realistic for you, reducing intensity may be more sustainable than trying to fuel your way through it.';
  }

  if (highIntakeFlag) {
    riskText     += ' High intake required (>90 g/h).';
    decisionText += ' Longer-term, improving fat oxidation through training may help reduce carbohydrate demand, but this should not be relied upon as a short-term solution.';
  }

  return { level, requiredCHO_gph: r, highIntakeFlag, performanceText, riskText, decisionText };
}

// ─────────────────────────────────────────────────────────────────
//  PROGRESSIVE RECOMMENDED TARGET
//
//  Closes the gap between planned and required carbohydrate intake
//  progressively, avoiding large step-changes at high demand.
//
//  Rules:
//    required < 90  → target = required          (100% gap close)
//    90 ≤ req ≤ 120 → target = planned + 0.66 × gap (66% gap close)
//    required > 120 → target = planned + 0.50 × gap (50% gap close)
//    Hard ceiling:    target ≤ 120 g/h
//    Overfueling:     target = required (already met, no increase needed)
//
//  This is recommendation-layer logic only — does not affect model equations.
// ─────────────────────────────────────────────────────────────────

/**
 * Duration-aware piecewise recommendation curve.
 *
 * SHORT (<2h):  blood-glucose maintenance focus; glycogen stores buffer the gap.
 *   required ≤ 30  → 30   (floor: always worth some intake)
 *   required ≤ 60  → required
 *   required > 60  → 60   (cap: GI risk > benefit for short efforts)
 *
 * MEDIUM (2–4h):  balance gap-closure with GI-risk avoidance.
 *   required ≤ 60  → required
 *   required ≤ 120 → 60 + 0.5 × (required − 60)  (50% gap close above 60)
 *   required > 120 → 90  (hard cap)
 *
 * LONG (>4h):  cumulative deficit compounds; preserve original precision curve.
 *   Anchor points: (60,60) → (90,86) → (120,107) → (140,120); hard cap 140+
 */
export function computeRecommendedTarget(required: number, eventType: EventType): number {
  const bucket = durationBucket(eventType);

  if (bucket === '<2h') {
    if (required <= 30) return 30;
    if (required <= 60) return Math.round(required);
    return 60;
  }

  if (bucket === '2–4h') {
    if (required <= 60)  return Math.round(required);
    if (required <= 120) return Math.round(60 + 0.5 * (required - 60));
    return 90;
  }

  // LONG (>4h) — precision curve
  let target: number;
  if (required <= 60)       target = required;
  else if (required <= 90)  target = 60 + (required - 60) * 0.867;
  else if (required <= 120) target = 86 + (required - 90) * 0.700;
  else if (required <= 140) target = 107 + (required - 120) * 0.650;
  else                      target = 120;
  return Math.round(target);
}

export function buildGapAnalysisAdvice(
  requiredCHO_gph: number,
  plannedCHO_gph:  number,
  eventType:       EventType,
): GapAnalysisAdvice {
  // Signed gap vs required: positive = overfueling, negative = underfueling.
  const gap_gph  = plannedCHO_gph - requiredCHO_gph;
  const gapAbs   = Math.abs(gap_gph);
  // signed fraction vs required (for direction display and coaching text)
  const gapPct   = requiredCHO_gph > 0 ? gap_gph / requiredCHO_gph : 0;
  const gapKcal_h = Math.round(gapAbs * 4);
  const direction: 'UNDER' | 'OVER' | 'ALIGNED' =
    gap_gph < 0 ? 'UNDER' : gap_gph > 0 ? 'OVER' : 'ALIGNED';

  const required  = Math.round(requiredCHO_gph);
  const planned   = Math.round(plannedCHO_gph);

  // ── Duration-aware recommended target ────────────────────────────
  const recommendedTarget = computeRecommendedTarget(required, eventType);
  const recRnd            = Math.round(recommendedTarget);

  // ── Level classification — gap between planned and recommended ────
  //   gap = planned − recommended; absGap = |gap|; gapPct = absGap / recommended
  //   GREEN (OR conditions):
  //     SHORT:  planned in [30,60], OR absGap ≤ greenAbsG, OR gapPct ≤ greenPct
  //     MEDIUM: absGap ≤ greenAbsG, OR gapPct ≤ greenPct
  //     LONG:   absGap ≤ greenAbsG, OR gapPct ≤ greenPct
  //   AMBER: not GREEN AND gapPct ≤ amberPct
  //   RED:   gapPct > amberPct
  //   Universal overrides: planned > 120 → at least AMBER;
  //                        planned > 120 AND required < planned × 0.85 → RED
  const bucket   = durationBucket(eventType);
  const tol      = getGapTolerance(bucket);
  const recGap   = planned - recRnd;       // positive = planned above recommended
  const recAbsGap = Math.abs(recGap);
  const recGapPct = recRnd > 0 ? recAbsGap / recRnd : 0;

  const inShortBand = tol.shortBandGreen && planned >= 30 && planned <= 60;
  const isGreenRaw  = inShortBand || recAbsGap <= tol.greenAbsG || recGapPct <= tol.greenPct;
  const isAmberRaw  = !isGreenRaw && recGapPct <= tol.amberPct;

  // Universal overrides
  const forceAmber  = planned > 120;
  const forceRed    = planned > 120 && required > 0 && required < planned * 0.85;

  let level: 'GREEN' | 'AMBER' | 'RED';
  if      (forceRed)               level = 'RED';
  else if (forceAmber && isGreenRaw) level = 'AMBER';
  else if (isGreenRaw)             level = 'GREEN';
  else if (isAmberRaw)             level = 'AMBER';
  else                             level = 'RED';

  // Residual between recommended and required — used in coaching text.
  const residualGap = Math.max(0, required - recRnd);
  const residualPct = required > 0 ? residualGap / required : 0;

  // Caution: recommended target ≥ 90 g/h requires specific absorption protocols.
  const cautionFlag = recommendedTarget >= 90;
  const cautionText = cautionFlag
    ? 'This level of intake approaches typical gut absorption limits. A practiced glucose–fructose strategy and gut training are required for reliable execution.'
    : '';

  // ── Coaching text — references recommended target, not raw required ──
  let performanceText: string;
  let riskText:        string;
  let decisionText:    string;

  if (direction === 'OVER') {
    // Overfueling — planned already exceeds requirement
    performanceText = 'Your planned intake already exceeds the carbohydrate required for this target.';
    riskText        = 'Additional carbohydrate is unlikely to improve performance. Excess intake cannot be fully utilised, may suppress fat oxidation, and increases the risk of gastrointestinal discomfort.';
    decisionText    = 'You can consider reducing intake to match your estimated requirement without compromising performance.';
  } else if (direction === 'ALIGNED') {
    performanceText = 'Your planned intake is closely aligned with your carbohydrate demand.';
    riskText        = 'The gap is small and unlikely to meaningfully affect performance.';
    decisionText    = 'Maintain your current strategy with focus on consistency and timing.';
  } else if (level === 'GREEN') {
    // Underfueling, but recommended target is realistically achievable
    performanceText = 'Your fueling strategy can realistically support this pacing target.';
    riskText        = residualGap <= 5
      ? `A recommended intake of ${recRnd} g/h closely meets the requirement. The residual gap is minimal.`
      : `With a recommended intake of ${recRnd} g/h, the residual gap (~${residualGap} g/h) is within a manageable range and unlikely to significantly limit performance.`;
    decisionText    = `Build toward ${recRnd} g/h progressively. Increase intake during race-specific sessions to allow gut adaptation and confirm tolerance.`;
  } else if (level === 'AMBER') {
    // Moderate residual — fueling helps but doesn't fully close the gap
    performanceText = 'Fueling can help, but some mismatch between supply and demand remains.';
    riskText        = `A recommended intake of ${recRnd} g/h still leaves a residual gap of ~${residualGap} g/h (~${Math.round(residualPct * 100)}% of requirement). Over longer efforts, this may reduce sustainable output.`;
    decisionText    = `Work toward ${recRnd} g/h as a near-term target. Reducing intensity or building higher fueling capacity over time will close the remaining gap.`;
  } else {
    // RED — demand too high for practical fueling alone
    performanceText = 'The pacing demand is too high for practical fueling alone to fully support.';
    riskText        = `Even with a recommended target of ${recRnd} g/h, a residual gap of ~${residualGap} g/h (~${Math.round(residualPct * 100)}% of requirement) remains. Fueling cannot realistically close this gap.`;
    decisionText    = 'Reduce target intensity to lower carbohydrate demand, or build aerobic capacity and fat oxidation through training to reduce reliance on exogenous carbohydrate.';
  }

  return {
    level,
    direction,
    gap_gph,
    gapPct,
    gapKcal_h,
    recommendedTarget,
    performanceText,
    riskText,
    decisionText,
    cautionFlag,
    cautionText,
  };
}

// ─────────────────────────────────────────────────────────────────
//  MASTER CALCULATION FUNCTION
// ─────────────────────────────────────────────────────────────────

export function runFuelingCalculation(inputs: FuelingInputs): FuelingResult {
  const { dietType, mlssWatts, lt1Watts, targetWatts, targetCHO } = inputs;

  // ── Gross Efficiency — continuous VO2max-based model (GE1) ──
  const ge = deriveGE(inputs.vo2maxMlKgMin);

  // ── VLamax normalisation ──
  // vlaN:      raw vlamax value clamped to physiological range [0.10, 1.50]
  // vlamaxNorm: normalised to [−1, +1] around neutral 0.55 mmol/L/s
  //   +1 = very low VLamax (fat-adapted)  → FATmax shifts right (higher intensity)
  //   −1 = very high VLamax (glycolytic)  → FATmax shifts left (lower intensity)
  const vlaN = (typeof inputs.vlamax === 'number' && isFinite(inputs.vlamax) && inputs.vlamax > 0)
    ? Math.max(0.10, Math.min(1.50, inputs.vlamax))
    : 0.55;
  const vlamaxNorm = Math.max(-1, Math.min(1, (0.55 - vlaN) / 0.25));

  // ── FATmax position (xf = fraction of LT2) ──
  // Standard: log-based VLamax influence — higher VLamax shifts xf left (earlier FATmax).
  //   xf = 0.70 + 0.08 × ln(0.55 / vlaN), clamped [0.45, 0.85]
  //   At vlaN = 0.55 (neutral): ln(1) = 0 → xf = 0.70.
  // Keto: VLamax-interpolated fraction from the Keto pattern row (unchanged).
  let xf: number;
  if (dietType === 'Keto') {
    const kPct = vlamaxNorm >= 0
      ? KETO_FATMAX.fatmaxMedian + vlamaxNorm * (KETO_FATMAX.fatmaxHigh - KETO_FATMAX.fatmaxMedian)
      : KETO_FATMAX.fatmaxMedian + vlamaxNorm * (KETO_FATMAX.fatmaxMedian - KETO_FATMAX.fatmaxLow);
    xf = Math.max(0.45, Math.min(0.85, kPct));
  } else {
    xf = Math.max(0.45, Math.min(0.85, 0.70 + 0.08 * Math.log(0.55 / vlaN)));
  }

  // ── FATzero (xz = fraction of LT2) ──
  // fatzeroBase is level-specific (derived from MLSS/weight) for Standard diet.
  // Keto diet: fixed base 1.10 (fat oxidation persists to higher intensity on ketogenic diet).
  // VLamax shifts xz ±0.02. Clamp: [0.92, 1.12]. Hard floor: xz ≥ fatzeroBase − 0.01.
  const derivedLevel = deriveAthleteLevel(mlssWatts, inputs.weight);
  const fatzeroBase  = dietType === 'Keto' ? FATZERO_BASE_KETO : FATZERO_BASE[derivedLevel];
  const xz = Math.max(0.92, Math.min(1.12, fatzeroBase + 0.02 * vlamaxNorm));

  // ── FATmax g/h — G6 continuous formula ──
  // G6: fatmax_gh = 0.2094×MLSS − (0.3132×VLamax + 0.0256)×weight, floored at 0.
  // Keto diet: +33% multiplier for diet-enhanced fat oxidation capacity.
  // Source of truth: MODEL_EQUATIONS.md §6.
  // NOTE: `fatmaxWkg` is a historical naming artifact — it stores g/h, not W/kg.
  //   Name is retained for DB compatibility (FuelingResult.fatmaxWkg column).
  const fatmaxBase = Math.max(0, 0.2094 * mlssWatts - (0.3132 * vlaN + 0.0256) * inputs.weight)
                     * (dietType === 'Keto' ? 1.33 : 1);
  const fatScale   = 1 + 0.06 * vlamaxNorm;  // low VLamax → +6% fat capacity; high → −6%
  const fatmaxWkg  = fatmaxBase * fatScale;
  const fatmaxKcal = fatmaxWkg * FAT_KCAL_PER_G;

  // ── Piecewise fat curve (smoothstep rise + alpha-controlled Hermite decay) ──
  // alpha = 1.8 − 0.4 × vlamaxNorm: high VLamax → steeper post-peak fat drop.
  const decayAlpha = 1.8 - 0.4 * vlamaxNorm;
  const curve = buildFatCurve(fatmaxWkg, xf, xz, decayAlpha);

  // ── Target power analysis ──
  const targetX         = targetWatts / mlssWatts;
  const targetPctLT1    = lt1Watts > 0 ? targetWatts / lt1Watts : 0;
  const targetSubstrate = substrateAtIntensity(targetX, mlssWatts, ge, curve);
  const choRange = `${Math.round(targetSubstrate.choG * 0.9)}–${Math.round(targetSubstrate.choG * 1.1)}`;

  // ── Intensity anchors ──
  const zoneLabel = intensityZoneLabel(targetWatts, lt1Watts, mlssWatts);

  // ── Structured coaching advice ──
  // choGHour is extracted here so the gap analysis uses the identical 1dp-rounded value
  // that is stored as cho_required_g_h — ensuring gap_gph === target_cho_g_h − cho_required_g_h.
  const choGHour = Math.round(targetSubstrate.choG * 10) / 10;
  const advice: FuelingAdvice = {
    strategy:        buildFuelingStrategyAdvice(inputs.eventType, targetWatts, mlssWatts, targetSubstrate.choG, targetCHO),
    carbRequirement: buildCarbRequirementAdvice(targetSubstrate.choG),
    gapAnalysis:     buildGapAnalysisAdvice(choGHour, targetCHO, inputs.eventType),
  };

  // ── Dense substrate series (1 W, 50%–150% LT2) — single source for chart + CARB90 ──
  const denseSubstrateSeries = buildDenseSubstrateSeries(mlssWatts, ge, curve);

  // ── CARB90 threshold — derived exclusively from denseSubstrateSeries.choG ──
  const carb90 = buildCarb90(denseSubstrateSeries, mlssWatts);

  // ── Zone substrate table (display-only — not used for CARB90 or chart) ──
  const zoneSubstrateTable = buildZoneSubstrateTable(mlssWatts, ge, curve);

  return {
    inputs,
    ge,
    fatmaxPctMLSS:  xf,
    fatzeroPctMLSS: xz,
    fatmaxWkg,
    fatmaxKcal,
    target: {
      pctMLSS:     Math.round(targetX * 1000) / 1000,
      pctLT1:      Math.round(targetPctLT1 * 1000) / 1000,
      kcalPerHour: Math.round(targetSubstrate.kcalPerHour),
      fatKcalHour: Math.round(targetSubstrate.fatKcal),
      fatGHour:    Math.round(targetSubstrate.fatG * 10) / 10,
      choKcalHour: Math.round(targetSubstrate.choKcal),
      choGHour,
      choRange,
    },
    intensityAnchors: {
      mlssWatts,
      lt1Watts,
      targetPctMLSS: Math.round(targetX * 1000) / 1000,
      targetPctLT1:  Math.round(targetPctLT1 * 1000) / 1000,
      zoneLabel,
    },
    advice,
    denseSubstrateSeries,
    carb90,
    zoneSubstrateTable,
  };
}
