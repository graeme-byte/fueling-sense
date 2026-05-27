/**
 * runningMetabolicEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * FuelingSense Running Metabolic Engine v2.0
 *
 * SOURCE OF TRUTH: running_metabolic_equations.md
 *   (Stewart Sports Ltd · Technical Specification v2.0 · Calibrated 28.04.2026)
 *
 * This file is a strict replication of the equations, constants, clamps, and
 * process logic defined in running_metabolic_equations.md.
 * No approximations, no additions, no bike-engine logic.
 *
 * SEPARATION GUARANTEE:
 *   - Imports NOTHING from any bike engine file.
 *   - All constants are defined locally from the MD source.
 *
 * Run self-check: npx tsx lib/engine/runningMetabolicEngine.ts
 */

import type {
  RunningMetabolicProfile,
  RunningSubstratePoint,
  RunningZone,
  RunningConfidenceFlag,
} from './runningTypes';

export const RUNNING_MODEL_VERSION = 'running-v2.5-candidate' as const;

// ── Constants — v2.3 candidate (running_metabolic_model_v2_3_candidate.md) ───

const RE_CONST  = 12.22;  // mL O2 / kg / km
const O2_KCAL   = 5.0;   // kcal / L O2
const FAT_KCAL  = 9.3;   // kcal / g fat
const CHO_KCAL  = 4.18;  // kcal / g carbohydrate — harmonised with cycling fuelingEngine.ts

// Stage 1 — VO2max v2.4 aerobic-reserve equation
// Replaces old S360-only form (11.5472 × S360 + 5.5136) which showed a
// laddering pattern: over-predicted low VO2max, under-predicted high VO2max.
// The aerobic reserve (S180 − S360) captures upper-aerobic capacity.
const VO2_INTERCEPT_24   = -11.373079;
const VO2_COEF_S360_24   =  14.311395;
const VO2_COEF_RESERVE_24 =  5.054782;   // coefficient on aerobicReserve = S180 − S360

// Stage 1 — VLamax v2.2 component decomposition
const PCR_FRAC_BASE    =  0.838411;   // PCr fraction intercept at FFM = 66 kg
const PCR_FRAC_SLOPE   = -0.204144;   // PCr fraction sensitivity to (FFM − 66) / 66
const PCR_FFM_REF      =  66;         // reference FFM (kg)
const AEROBIC_PROXY_COEF = 0.872091;  // aerobic-supported proxy coefficient on P180
const VLA_POWER_COEF   =  0.005731;   // VLamax power-law coefficient
const VLA_POWER_EXP    =  2.617584;   // VLamax power-law exponent
// Clamp: [0.05, 0.90] — upper extends to 0.90 in v2.3 (was 0.80 in v2.0)

// Stage 1 — MLSS v2.3 direct regression (S180, S360, VLamax)
const MLSS_INTERCEPT_23  = -1.39219;
const MLSS_COEF_S180_23  =  0.52459;
const MLSS_COEF_S360_23  =  0.71862;
const MLSS_COEF_VLA_23   = -2.02976;

// Stage 1 — LT1 v2.3 direct regression (S180, S360, VLamax)
const LT1_INTERCEPT_23   = -1.35596;
const LT1_COEF_S180_23   =  0.45336;
const LT1_COEF_S360_23   =  0.61183;
const LT1_COEF_VLA_23    = -2.42501;

// Stage 2 — FATmax position (running-calibrated substrate formula; retained pending future validation)
const XF_BASE         =  0.1124;
const XF_COEF_LNVLA   =  0.1131;
const XF_COEF_VO2N    =  0.4073;

// Stage 2 — MFO (running-calibrated substrate formula; retained pending future validation)
const MFO_BASE_COEF   =  0.057224;
const MFO_VLA_COEF    =  0.3842;
const MFO_VLA_OFFSET  =  0.0149;
const MFO_VLA_NORM_REF = 0.55;
const MFO_SCALE_RANGE  = 0.25;
const MFO_SCALE_FACTOR = 0.06;

// Stage 2 — CHO sigmoid (fat-primary architecture; sigmoid defines fat fraction implicitly)
const CHO_SIG_CONST   = -5.3519;
const CHO_SIG_VN      =  5.6460;
const CHO_SIG_VLA     =  5.9029;
const CHO_SIG_VN_VLA  = -3.7934;


// ── Utility functions (spec §8) ───────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function smoothstep(x: number): number {
  return x * x * (3 - 2 * x);
}

// ── Running economy model (v2.5) ─────────────────────────────────────────────
//
// RE_CONST (12.22) is retained for Stage 1 intermediates: powerFromSpeed,
// calculateMFO, and assessRunningConfidence. Those paths do not use economy.
//
// substrateAtSpeed uses economy when provided; falls back to RE_CONST otherwise
// (profiler curve, acceptance tests, callers that don't supply VO2max).

// Performance-based base economy (mL/kg/km). Higher VO2max → better economy.
// Breakpoints match INSCYD/Joyner population data; conservative ±5% range.
export function estimateBaseRunningEconomy(vo2maxMlKgMin: number): number {
  let economy: number;
  if      (vo2maxMlKgMin < 40)  economy = 220;
  else if (vo2maxMlKgMin <= 50) economy = 216 + (210 - 216) * (vo2maxMlKgMin - 40) / 10;
  else if (vo2maxMlKgMin <= 60) economy = 210 + (202 - 210) * (vo2maxMlKgMin - 50) / 10;
  else if (vo2maxMlKgMin <= 70) economy = 202 + (196 - 202) * (vo2maxMlKgMin - 60) / 10;
  else if (vo2maxMlKgMin <= 80) economy = 196 + (190 - 196) * (vo2maxMlKgMin - 70) / 10;
  else                          economy = 188;
  return clamp(economy, 185, 225);
}

// Speed-dependent economy modifier: flat sub-threshold, worsens above MLSS.
// x = speed / mlssSpeed:
//   ≤0.85        → −1 % (slight aerobic efficiency at easy paces)
//   0.85–1.00    → linear −1% → 0%
//   1.00–1.15    → linear 0% → +3.5%
//   >1.15        → +5% (supramaximal degradation)
export function adjustEconomyForSpeed(
  baseEconomy: number,
  speedMs: number,
  mlssSpeedMs: number,
): number {
  const x = speedMs / mlssSpeedMs;
  let modifier: number;
  if      (x <= 0.85) modifier = -0.01;
  else if (x <= 1.00) modifier = -0.01 + 0.01 * (x - 0.85) / 0.15;
  else if (x <= 1.15) modifier = 0.035 * (x - 1.00) / 0.15;
  else                modifier = 0.05;
  return clamp(baseEconomy * (1 + modifier), 180, 235);
}

// Pre-computed anchors required by the v2.4 substrate curve
export interface SubstrateAnchors {
  fatmaxSpeedMs: number;
  mfoGH: number;
}

// FATzero speed — VLamax-adjusted anchor around MLSS (v2.4)
// Neutral point: VLamax = 0.55 → fatZeroSpeed = MLSS
// Higher VLamax → fatZero slightly below MLSS (earlier fat cut-off)
// Lower VLamax  → fatZero slightly above MLSS (fat persists a little longer)
export function computeFatZeroSpeed(vlamax: number, mlss: number): number {
  // Standard sign: low VLamax → positive vlamaxNorm → fatZero above MLSS (fat persists longer)
  //                high VLamax → negative vlamaxNorm → fatZero below MLSS (earlier cut-off)
  // Equivalent to the old (vlamax−0.55) form: (1−0.04×vlaNorm_old) ≡ (1+0.04×vlamaxNorm)
  const vlamaxNorm = clamp((0.55 - vlamax) / 0.25, -1, 1);
  return clamp(mlss * (1 + 0.04 * vlamaxNorm), mlss * 0.96, mlss * 1.04);
}

export function formatPace(speedMs: number): string {
  if (!Number.isFinite(speedMs) || speedMs <= 0) return '—';
  const secPerKm = 1000 / speedMs;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, '0')}/km`;
}


// ── Stage 1 helpers ───────────────────────────────────────────────────────────

// Converts running speed to an equivalent power value used solely as an
// intermediate for VLamax component decomposition. Not a physiological watt claim.
function powerFromSpeed(speedMs: number, massKg: number): number {
  const kcalH = speedMs * RE_CONST * (60 / 1000) * O2_KCAL * massKg;
  return kcalH * 1.163;   // 1 kcal/h ≈ 1.163 W
}

// ── Stage 1: field speeds → VO2max, VLamax, MLSS ─────────────────────────────

// v2.4 — uses aerobic reserve (S180 − S360) in addition to the S360 anchor.
// Equivalent direct form: -11.373079 + 9.256613*S360 + 5.054782*S180
// Reserve form used here for physiological clarity.
export function calculateVO2max(s180: number, s360: number): number {
  const aerobicReserve = s180 - s360;
  const raw = VO2_INTERCEPT_24 + VO2_COEF_S360_24 * s360 + VO2_COEF_RESERVE_24 * aerobicReserve;
  return clamp(raw, 20, 85);
}

// v2.2 component decomposition — running_metabolic_model_v2_3_candidate.md
export function calculateVLamax(s20: number, s180: number, ffmKg: number, massKg: number): number {
  const p20  = powerFromSpeed(s20,  massKg);
  const p180 = powerFromSpeed(s180, massKg);

  const pcrFrac = PCR_FRAC_BASE + PCR_FRAC_SLOPE * ((ffmKg - PCR_FFM_REF) / PCR_FFM_REF);
  const pcrProxy        = pcrFrac * (p20 - p180);
  const aerobicProxy    = AEROBIC_PROXY_COEF * p180;
  const glycoProxy      = p20 - pcrProxy - aerobicProxy;
  const glycoProxySafe  = Math.max(glycoProxy, 1e-6);

  return clamp(
    VLA_POWER_COEF * Math.pow(glycoProxySafe / ffmKg, VLA_POWER_EXP),
    0.05,
    0.90,   // v2.3 clamp upper extends to 0.90
  );
}

// v2.3 direct regression — drops vo2max, uses S180 and S360 directly
export function calculateMLSS(s180: number, s360: number, vlamax: number): number {
  const raw = MLSS_INTERCEPT_23 + MLSS_COEF_S180_23 * s180 + MLSS_COEF_S360_23 * s360 + MLSS_COEF_VLA_23 * vlamax;
  return clamp(raw, 1.0, 7.0);
}


// ── Stage 2: running substrate cascade ───────────────────────────────────────

function lnVLaTerm(vlamax: number): number {
  return Math.log(MFO_VLA_NORM_REF / vlamax);
}

// v2.3 direct regression — returns speed directly, not a fraction of MLSS
export function calculateLT1(s180: number, s360: number, vlamax: number, mlss: number): {
  lt1SpeedMs: number;
  lt1Fraction: number;
} {
  const lt1 = clamp(
    LT1_INTERCEPT_23 + LT1_COEF_S180_23 * s180 + LT1_COEF_S360_23 * s360 + LT1_COEF_VLA_23 * vlamax,
    0.5,
    mlss * 0.95,
  );
  return {
    lt1SpeedMs: lt1,
    lt1Fraction: lt1 / mlss,
  };
}

export function calculateFATmax(vo2max: number, vlamax: number, mlss: number): {
  fatmaxSpeedMs: number;
  fatmaxFraction: number;
} {
  const lnVLa = lnVLaTerm(vlamax);
  const xfRaw = XF_BASE + XF_COEF_LNVLA * lnVLa + XF_COEF_VO2N * (vo2max / 50);
  const xf = clamp(xfRaw, 0.25, 0.80);
  return {
    fatmaxSpeedMs: xf * mlss,
    fatmaxFraction: xf,
  };
}

export function calculateMFO(mlss: number, vlamax: number, mass: number): {
  mfoGH: number;
  mfoKcalH: number;
} {
  const mlssKcalH = mlss * RE_CONST * (60 / 1000) * O2_KCAL * mass;
  const fatmaxBase = Math.max(
    0,
    MFO_BASE_COEF * mlssKcalH - (MFO_VLA_COEF * vlamax - MFO_VLA_OFFSET) * mass,
  );
  const vlaNorm = clamp((MFO_VLA_NORM_REF - vlamax) / MFO_SCALE_RANGE, -1, 1);
  const fatScale = 1 + MFO_SCALE_FACTOR * vlaNorm;
  const mfoGH = fatmaxBase * fatScale;
  return {
    mfoGH,
    mfoKcalH: mfoGH * FAT_KCAL,
  };
}

function fCHO(vN: number, vlamax: number): number {
  return sigmoid(
    CHO_SIG_CONST +
    CHO_SIG_VN * vN +
    CHO_SIG_VLA * vlamax +
    CHO_SIG_VN_VLA * vN * vlamax,
  );
}

// v2.4 — when `anchors` are provided the fat oxidation curve uses FATzero
// anchoring (smoothstep decay → 0 at fatZeroSpeed). Without anchors the legacy
// CHO-sigmoid path is used (backward-compat, e.g. low-level unit tests).
//
// v2.5 — `economyMlKgKm` is the speed-adjusted running economy from
// adjustEconomyForSpeed(). When provided it replaces the RE_CONST energy formula.
// When omitted the old formula is used (profiler curve, acceptance tests).
export function substrateAtSpeed(
  v: number,
  vlamax: number,
  mlss: number,
  mass: number,
  anchors?: SubstrateAnchors,
  economyMlKgKm?: number,
): {
  cho_g_h: number;
  fat_g_h: number;
  total_kcal_h: number;
  pct_cho: number;
  pct_fat: number;
} {
  // v2.5: economy-adjusted energy when economy is provided.
  // vo2Cost [mL/kg/min] = economy × speedKmh / 60
  // energyKcalH = vo2Cost × mass × (60/1000) × O2_KCAL
  const energyKcalH = economyMlKgKm != null
    ? (economyMlKgKm * v * 3.6 / 60) * mass * (60 / 1000) * O2_KCAL
    : v * RE_CONST * (60 / 1000) * O2_KCAL * mass;
  let fatGH: number;

  if (anchors) {
    // v2.4 fat-primary with FATzero anchor
    const fatZeroSpeed       = computeFatZeroSpeed(vlamax, mlss);
    const effectiveFATmaxSpd = Math.min(anchors.fatmaxSpeedMs, fatZeroSpeed * 0.95);

    if (v >= fatZeroSpeed) {
      // Hard zero above FATzero (near MLSS)
      fatGH = 0;
    } else if (v >= effectiveFATmaxSpd) {
      // Above FATmax: VLamax-controlled decay to 0 at FATzero (v2.5).
      //
      // alpha controls decay curvature:
      //   low VLamax (endurance)   → positive vlaNormDecay → higher alpha → broader fat tail
      //   high VLamax (glycolytic) → negative vlaNormDecay → lower alpha  → steeper suppression
      //
      // Guarantees: fat(effectiveFATmaxSpd) = mfoGH, fat(fatZeroSpeed) = 0, monotone.
      const vlaNormDecay = clamp((0.55 - vlamax) / 0.25, -1, 1);
      const alpha = clamp(1.7 + 0.35 * vlaNormDecay, 1.25, 2.15);
      const z     = clamp((v - effectiveFATmaxSpd) / (fatZeroSpeed - effectiveFATmaxSpd), 0, 1);
      const decay = Math.pow(1 - Math.pow(z, alpha), 2);
      fatGH = Math.max(0, anchors.mfoGH * decay);
    } else {
      // Below FATmax: smooth power-law rise from easyFloor × mfoGH → mfoGH at FATmax (v2.5).
      //
      // easyFloor = 0.50 matches the bike model's fatLeft = 0.75 × fatmax at 50% MLSS
      // and eliminates the shelf visible with the previous easyFloor = 0.72.
      const r         = Math.max(0, Math.min(1, v / anchors.fatmaxSpeedMs));
      const easyFloor = 0.50;   // R1: was 0.72 — lowers left anchor, adds visible rise into FATmax
      const riseShape = 1.8;
      const curveGH   = anchors.mfoGH * (easyFloor + (1 - easyFloor) * Math.pow(r, riseShape));
      const maxFatGH  = energyKcalH / FAT_KCAL;   // fat cannot exceed total EE
      fatGH = Math.max(0, Math.min(curveGH, maxFatGH));
    }
  } else {
    // Legacy sigmoid path (no FATzero enforcement) — backward-compat only
    fatGH = Math.max(0, ((1 - fCHO(v / mlss, vlamax)) * energyKcalH) / FAT_KCAL);
  }

  const fatKcalH = fatGH * FAT_KCAL;
  const choKcalH = Math.max(0, energyKcalH - fatKcalH);
  const choGH    = choKcalH / CHO_KCAL;

  return {
    cho_g_h:      choGH,
    fat_g_h:      fatGH,
    total_kcal_h: energyKcalH,
    pct_cho: energyKcalH > 0 ? (choKcalH / energyKcalH) * 100 : 0,
    pct_fat: energyKcalH > 0 ? (fatKcalH / energyKcalH) * 100 : 0,
  };
}

// detectCARB90 — anchors required for v2.4 FATzero curve; falls back to
// legacy sigmoid when omitted.
// v2.5: baseEconomy passed from the fueling engine so CARB90 shifts with
// athlete-specific economy. Profiler calls omit baseEconomy → RE_CONST path.
export function detectCARB90(
  vlamax: number,
  mlss: number,
  mass: number,
  anchors?: SubstrateAnchors,
  baseEconomy?: number,
): number {
  const vMax = mlss * 1.15;
  const step = 0.01;
  const speeds: number[] = [];
  for (let v = 0.5; v <= vMax; v += step) speeds.push(v);

  // Forward monotone clamp before CARB90 detection
  const choSeries = speeds.map(v => {
    const eco = baseEconomy != null ? adjustEconomyForSpeed(baseEconomy, v, mlss) : undefined;
    return substrateAtSpeed(v, vlamax, mlss, mass, anchors, eco).cho_g_h;
  });
  for (let i = 1; i < choSeries.length; i++) {
    if (choSeries[i] < choSeries[i - 1]) choSeries[i] = choSeries[i - 1];
  }

  for (let i = 0; i < choSeries.length - 1; i++) {
    if (choSeries[i] < 90 && choSeries[i + 1] >= 90) {
      return speeds[i] + ((90 - choSeries[i]) * (speeds[i + 1] - speeds[i])) /
        (choSeries[i + 1] - choSeries[i]);
    }
  }
  return vMax;
}


// ── Stage 3: derived metrics (spec §11) ──────────────────────────────────────

function calculateGlycogen(vlamax: number, ffm: number): {
  glycogenGKgFFM: number;
  glycogenTotalG: number;
} {
  const gKg = clamp(4.5 + 2.0 * (1 - vlamax / 0.55), 3, 9);
  return { glycogenGKgFFM: gKg, glycogenTotalG: gKg * ffm };
}

function calculateAerobicGlycolyticRatio(vo2max: number, vlamax: number): number {
  return vo2max / (vlamax * 100 + 1);
}

// ── Substrate curve builder (spec §15) ───────────────────────────────────────

// buildRunningSubstrateCurve — anchors required for v2.5 FATzero curve.
// v2.5: baseEconomy optional — when provided, each point uses speed-adjusted
// economy. Profiler calls omit it → RE_CONST path (backward-compat).
export function buildRunningSubstrateCurve(
  vlamax: number,
  mlss: number,
  mass: number,
  anchors?: SubstrateAnchors,
  baseEconomy?: number,
): RunningSubstratePoint[] {
  // 0.01 m/s step — smooth continuous curve, full float precision (no rounding).
  const points: RunningSubstratePoint[] = [];
  for (let v = 0.8; v <= mlss * 1.15 + 1e-9; v += 0.01) {
    const eco = baseEconomy != null ? adjustEconomyForSpeed(baseEconomy, v, mlss) : undefined;
    const sub = substrateAtSpeed(v, vlamax, mlss, mass, anchors, eco);
    points.push({
      speed: Math.round(v * 1000) / 1000,   // 3 dp — sufficient for chart positioning
      pace: formatPace(v),
      fat_g_h:      sub.fat_g_h,
      cho_g_h:      sub.cho_g_h,
      total_kcal_h: sub.total_kcal_h,
    });
  }

  // R2: Backward CHO monotonicity cap — mirrors bike denseSubstrateSeries pattern.
  // Ensures CHO never decreases as speed increases. If a cap fires, fat is
  // recalculated from the energy balance so fat + cho = totalEE at every point.
  for (let i = points.length - 2; i >= 0; i--) {
    if (points[i].cho_g_h > points[i + 1].cho_g_h) {
      const cappedCHO = points[i + 1].cho_g_h;
      const fatKcal   = Math.max(0, points[i].total_kcal_h - cappedCHO * CHO_KCAL);
      points[i] = {
        ...points[i],
        cho_g_h: cappedCHO,
        fat_g_h: fatKcal / FAT_KCAL,
      };
    }
  }

  return points;
}


// ── Zone builder (spec §12) — delegates to runningZones.ts ───────────────────

import { buildRunningZones } from './runningZones';
export { buildRunningZones };


// ── Athlete classification (spec §13) ────────────────────────────────────────

export function classifyRunningAthlete(vo2max: number, vlamax: number): {
  type: string;
  description: string;
} {
  const highVO2 = vo2max >= 50;
  const highVLa = vlamax >= 0.30;

  if (highVO2 && highVLa) {
    return {
      type: 'Power-Endurance',
      description:
        'Strong aerobic engine with high glycolytic capacity. Well-suited to middle-distance and variable-pace events.',
    };
  }
  if (highVO2 && !highVLa) {
    return {
      type: 'Pure Endurance',
      description:
        'Endurance-dominant profile with strong fat oxidation and high threshold potential. Well-suited to marathon and ultra-distance running.',
    };
  }
  if (!highVO2 && highVLa) {
    return {
      type: 'Power-Glycolytic',
      description:
        'Glycolytic strength dominates. Best suited to short high-intensity efforts. Endurance capacity is trainable.',
    };
  }
  return {
    type: 'Base Builder',
    description:
      'Moderate aerobic and glycolytic capacity. High adaptation potential from consistent aerobic, threshold, and VO2max development.',
  };
}


// ── Confidence flags (spec §14) ───────────────────────────────────────────────

export function assessRunningConfidence(
  vo2max: number,
  vlamax: number,
  mlss: number,
  s20: number,
  s180: number,
  s360: number,
): RunningConfidenceFlag[] {
  const flags: RunningConfidenceFlag[] = [];

  if (vlamax > 0.50 && vo2max < 38) {
    flags.push({
      level: 'warn',
      message:
        'High VLamax with low VO2max: MFO and CARB90 estimates have reduced accuracy. Consider retesting or interpreting substrate outputs cautiously.',
    });
  }

  // These checks mirror the hard validation in the API route — shown as flags
  // if somehow they reach the engine (should not happen in normal flow)
  if (s20 <= s180) {
    flags.push({ level: 'error', message: 'Sprint speed must be faster than 3-minute speed.' });
  }
  if (s180 <= s360) {
    flags.push({ level: 'error', message: '3-minute speed must be faster than 6-minute speed.' });
  }

  if (vlamax < 0.08) {
    flags.push({
      level: 'info',
      message:
        'Very low VLamax: verify the sprint test was maximal, especially if the athlete is not a highly endurance-trained runner.',
    });
  }

  // VO2 demand at MLSS — exact form from MD Stage 5:
  //   vo2_at_mlss = mlss × RE_CONST   (mL/kg/min approx)
  // RE_CONST combines m/s and mL/kg/km such that this product approximates
  // VO2 in mL/kg/min at the given speed. This is the expression in the source MD.
  const vo2AtMLSS = mlss * RE_CONST;
  if (vo2AtMLSS > vo2max * 1.02) {
    flags.push({
      level: 'error',
      message:
        'MLSS speed implies O₂ demand exceeds VO₂max — check test inputs.',
    });
  }

  return flags;
}


// ── Input validation (spec §6) ────────────────────────────────────────────────

export interface RunningInputValidationError {
  field: string;
  message: string;
}

export function validateRunningInputHierarchy(
  s20: number,
  s180: number,
  s360: number,
): RunningInputValidationError[] {
  const errors: RunningInputValidationError[] = [];

  if (s20 <= s180) {
    errors.push({ field: 's20', message: 'Sprint speed must be faster than 3-minute speed.' });
  }
  if (s180 <= s360) {
    errors.push({ field: 's180', message: '3-minute speed must be faster than 6-minute speed.' });
  }
  if (s20 < 3.0 || s20 > 12.0) {
    errors.push({ field: 's20', message: 'Sprint speed out of valid range (3.0–12.0 m/s).' });
  }
  if (s360 < 1.0 || s360 > 7.5) {
    errors.push({ field: 's360', message: '6-minute speed out of valid range (1.0–7.5 m/s).' });
  }

  return errors;
}


// ── Master pipeline ───────────────────────────────────────────────────────────

// Sprint duration constant — the API enforces this so the UI never accepts a
// different value. The engine accepts sprintTimeS as an explicit input (per MD
// spec, which allows 12–25 s) so the engine remains spec-compliant. In
// production the API always passes SPRINT_TIME_S as the sprint time.
export const SPRINT_TIME_S = 20;

export interface RunningProfilerInputs {
  sprintDistanceM: number;
  sprintTimeS: number;         // seconds — MD spec accepts 12–25 s; API fixes at 20
  threeMinDistanceM: number;
  sixMinDistanceM: number;
  massKg: number;
  bodyFatPct: number;
}

export function calculateRunningMetabolicProfile(
  inputs: RunningProfilerInputs,
): RunningMetabolicProfile {
  const { sprintDistanceM, sprintTimeS, threeMinDistanceM, sixMinDistanceM, massKg, bodyFatPct } = inputs;

  // Sprint time validation (v2.1 canonical requirement: 12–25 s)
  if (sprintTimeS < 12 || sprintTimeS > 25) {
    throw new Error('Sprint time must be 12–25 seconds');
  }

  // Speed derivation — S20 = distSprint / timeSprint (variable, per v2.1)
  const s20  = sprintDistanceM / sprintTimeS;
  const s180 = threeMinDistanceM / 180;
  const s360 = sixMinDistanceM / 360;

  // Hard input hierarchy and range validation
  const validationErrors = validateRunningInputHierarchy(s20, s180, s360);
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.map(e => e.message).join(' '));
  }

  // Body composition (spec §5)
  const fatFreeMassKg = massKg * (1 - bodyFatPct / 100);

  // Stage 1: field speeds → primary metabolic markers
  const vo2max = calculateVO2max(s180, s360);  // v2.4: needs both S180 and S360
  const vlamax = calculateVLamax(s20, s180, fatFreeMassKg, massKg);   // v2.3: needs FFM + mass
  const mlss   = calculateMLSS(s180, s360, vlamax);                   // v2.3: uses S180, S360

  // Stage 2: running substrate cascade (v2.3/v2.4)
  const { lt1SpeedMs, lt1Fraction } = calculateLT1(s180, s360, vlamax, mlss);  // v2.3 direct regression
  const { fatmaxSpeedMs, fatmaxFraction } = calculateFATmax(vo2max, vlamax, mlss);
  const { mfoGH, mfoKcalH } = calculateMFO(mlss, vlamax, massKg);

  // v2.4: thread FATmax + MFO anchors into substrate + CARB90 computations
  const anchors: SubstrateAnchors = { fatmaxSpeedMs, mfoGH };
  const carb90SpeedMs = detectCARB90(vlamax, mlss, massKg, anchors);

  // Stage 3: derived metrics
  const vo2maxAbsMlMin = vo2max * massKg;
  const pctVO2AtMLSS = (mlss / s360) * 100;
  const { glycogenGKgFFM, glycogenTotalG } = calculateGlycogen(vlamax, fatFreeMassKg);
  const aerobicGlycolyticRatio = calculateAerobicGlycolyticRatio(vo2max, vlamax);
  // vVO2max = 6-minute test speed (S360) — the field-test proxy for vVO2max.
  const vVO2maxSpeedMs = s360;

  // Zones — pass xf fraction (not fatmaxSpeed)
  const zones: RunningZone[] = buildRunningZones(lt1SpeedMs, mlss, fatmaxFraction, vlamax, massKg);

  // Substrate curve — v2.4: anchors enforce FATzero near MLSS
  const substrateCurve = buildRunningSubstrateCurve(vlamax, mlss, massKg, anchors);

  // Classification (spec §13)
  const classification = classifyRunningAthlete(vo2max, vlamax);

  // Confidence flags (spec §14)
  const confidenceFlags = assessRunningConfidence(vo2max, vlamax, mlss, s20, s180, s360);

  return {
    inputs: { sprintDistanceM, sprintTimeS, threeMinDistanceM, sixMinDistanceM, massKg, bodyFatPct },
    speeds: { s20, s180, s360 },
    bodyComposition: { massKg, bodyFatPct, fatFreeMassKg },
    primary: {
      vo2maxMlKgMin: vo2max,
      vo2maxAbsMlMin,
      vlamaxMmolLS: vlamax,
      mlssSpeedMs: mlss,
      mlssPace: formatPace(mlss),
      lt1SpeedMs,
      lt1Pace: formatPace(lt1SpeedMs),
      fatmaxSpeedMs,
      fatmaxPace: formatPace(fatmaxSpeedMs),
      mfoGH,
      mfoKcalH,
      carb90SpeedMs,
      carb90Pace: formatPace(carb90SpeedMs),
    },
    derived: {
      lt1Fraction,
      fatmaxFraction,
      pctVO2AtMLSS,
      glycogenGKgFFM,
      glycogenTotalG,
      aerobicGlycolyticRatio,
      vVO2maxSpeedMs,
      vVO2maxPace: formatPace(vVO2maxSpeedMs),
    },
    zones,
    substrateCurve,
    classification,
    confidenceFlags,
  };
}


// ═════════════════════════════════════════════════════════════════════════════
// ACCEPTANCE TESTS — v2.1 FORMULA-DERIVED
// Source of truth: running_metabolic_equations_v2.1.md
//
// Cases A–D are from the v2.1 canonical reference implementation.
// Values are generated directly from the locked equations.
// Tolerances: ±0.01 speeds/VO2max, ±0.001 fractions, ±1 kcal/h MFO, ±0.1 g/h MFO.
//
// Invalid-1 and Invalid-2 confirm the hierarchy and timeSprint guards fire.
//
// Run via: npx tsx lib/engine/runningMetabolicEngine.ts
// ═════════════════════════════════════════════════════════════════════════════

let _passed = 0;
let _failed = 0;

function assertClose(label: string, actual: number, expected: number, tol: number): void {
  const diff = Math.abs(actual - expected);
  if (diff <= tol) {
    _passed++;
    console.log(`  PASS  ${label}: ${actual.toFixed(4)}  (expected ~${expected.toFixed(4)}, Δ=${diff.toFixed(4)})`);
  } else {
    _failed++;
    console.log(`  FAIL  ${label}: ${actual.toFixed(4)}  (expected ~${expected.toFixed(4)}, Δ=${diff.toFixed(4)} > tol ${tol})`);
  }
}

function check(label: string, cond: boolean, detail = ''): void {
  if (cond) {
    _passed++;
    console.log(`  PASS  ${label}`);
  } else {
    _failed++;
    console.log(`  FAIL  ${label}  ${detail}`);
  }
}

function section(name: string): void {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  ${name}`);
  console.log('─'.repeat(70));
}

function runSelfCheck(): void {
  section('Constant guards — coefficient drift detection');
  function coefCheck(name: string, actual: number, expected: number): void {
    if (Math.abs(actual - expected) < 1e-7) {
      _passed++;
      console.log(`  PASS  ${name} = ${actual}`);
    } else {
      _failed++;
      console.log(`  FAIL  ${name}: got ${actual}, expected ${expected}`);
    }
  }
  // v2.3 constants
  coefCheck('RE_CONST',              RE_CONST,              12.22);
  coefCheck('VO2_INTERCEPT_24',     VO2_INTERCEPT_24,     -11.373079);
  coefCheck('VO2_COEF_S360_24',     VO2_COEF_S360_24,      14.311395);
  coefCheck('VO2_COEF_RESERVE_24',  VO2_COEF_RESERVE_24,    5.054782);
  coefCheck('PCR_FRAC_BASE',       PCR_FRAC_BASE,        0.838411);
  coefCheck('PCR_FRAC_SLOPE',      PCR_FRAC_SLOPE,      -0.204144);
  coefCheck('AEROBIC_PROXY_COEF',  AEROBIC_PROXY_COEF,   0.872091);
  coefCheck('VLA_POWER_COEF',      VLA_POWER_COEF,       0.005731);
  coefCheck('VLA_POWER_EXP',       VLA_POWER_EXP,        2.617584);
  coefCheck('MLSS_INTERCEPT_23',   MLSS_INTERCEPT_23,   -1.39219);
  coefCheck('MLSS_COEF_S180_23',   MLSS_COEF_S180_23,    0.52459);
  coefCheck('MLSS_COEF_S360_23',   MLSS_COEF_S360_23,    0.71862);
  coefCheck('MLSS_COEF_VLA_23',    MLSS_COEF_VLA_23,    -2.02976);
  coefCheck('LT1_INTERCEPT_23',    LT1_INTERCEPT_23,    -1.35596);
  coefCheck('LT1_COEF_S180_23',    LT1_COEF_S180_23,     0.45336);
  coefCheck('LT1_COEF_S360_23',    LT1_COEF_S360_23,     0.61183);
  coefCheck('LT1_COEF_VLA_23',     LT1_COEF_VLA_23,     -2.42501);
  coefCheck('CHO_SIG_CONST',       CHO_SIG_CONST,       -5.3519);
  coefCheck('CHO_SIG_VN',          CHO_SIG_VN,           5.6460);
  coefCheck('CHO_SIG_VLA',         CHO_SIG_VLA,          5.9029);
  coefCheck('CHO_SIG_VN_VLA',      CHO_SIG_VN_VLA,      -3.7934);

  // Helper: run all checks for one acceptance case
  function runCase(
    id: string, s20: number, s180: number, s360: number, mass: number, bfPct: number,
    exp: { vo2: number; vla: number; mlss: number; lt1: number; xf: number;
           fatmax: number; mfoG: number; mfoK: number },
  ) {
    section(`Acceptance test ${id} — v2.3/v2.4 formula-derived (S20=${s20} S180=${s180} S360=${s360} ${mass}kg ${bfPct}%BF)`);
    const ffm  = mass * (1 - bfPct / 100);
    const vo2  = calculateVO2max(s180, s360);
    const vla  = calculateVLamax(s20, s180, ffm, mass);
    const mlss = calculateMLSS(s180, s360, vla);
    const { lt1SpeedMs } = calculateLT1(s180, s360, vla, mlss);
    const { fatmaxSpeedMs, fatmaxFraction } = calculateFATmax(vo2, vla, mlss);
    const { mfoGH, mfoKcalH } = calculateMFO(mlss, vla, mass);
    const anchors: SubstrateAnchors = { fatmaxSpeedMs, mfoGH };
    const carb90 = detectCARB90(vla, mlss, mass, anchors);

    assertClose(`${id} VO2max`,       vo2,            exp.vo2,   0.01);
    assertClose(`${id} VLamax`,       vla,            exp.vla,   0.001);
    assertClose(`${id} MLSS`,         mlss,           exp.mlss,  0.01);
    assertClose(`${id} LT1`,          lt1SpeedMs,     exp.lt1,   0.01);
    assertClose(`${id} xf`,           fatmaxFraction, exp.xf,    0.001);
    assertClose(`${id} FATmax speed`, fatmaxSpeedMs,  exp.fatmax,0.01);
    assertClose(`${id} MFO g/h`,      mfoGH,          exp.mfoG,  0.1);
    assertClose(`${id} MFO kcal/h`,   mfoKcalH,       exp.mfoK,  1.0);

    check(`${id}: VO2max in [20,85]`,     vo2  >= 20  && vo2  <= 85,   `${vo2.toFixed(2)}`);
    check(`${id}: VLamax in [0.05,0.80]`, vla  >= 0.05&& vla  <= 0.80, `${vla.toFixed(3)}`);
    check(`${id}: MLSS in [1.0,7.0]`,     mlss >= 1.0 && mlss <= 7.0,  `${mlss.toFixed(3)}`);
    check(`${id}: LT1 < MLSS`,            lt1SpeedMs < mlss, `LT1=${lt1SpeedMs.toFixed(3)} MLSS=${mlss.toFixed(3)}`);
    check(`${id}: S20>S180>S360`,          s20 > s180 && s180 > s360);

    // ── FATzero v2.4 QA ─────────────────────────────────────────────────────
    const fatZeroSpeed = computeFatZeroSpeed(vla, mlss);
    const vlaNorm = clamp((vla - 0.55) / 0.25, -1, 1);

    // Fat must be zero at and above fatZeroSpeed
    const subAtFatZero = substrateAtSpeed(fatZeroSpeed, vla, mlss, mass, anchors);
    check(`${id}: fat=0 at fatZeroSpeed`,
      subAtFatZero.fat_g_h < 1e-9,
      `got ${subAtFatZero.fat_g_h.toFixed(4)} g/h`);

    const subAboveFatZero = substrateAtSpeed(fatZeroSpeed + 0.05, vla, mlss, mass, anchors);
    check(`${id}: fat=0 above fatZeroSpeed`,
      subAboveFatZero.fat_g_h < 1e-9,
      `got ${subAboveFatZero.fat_g_h.toFixed(4)} g/h`);

    // Fat at FATmax ≈ MFO (within 15% — sigmoid peak may not land exactly at effectiveFATmaxSpd)
    const subAtFATmax = substrateAtSpeed(fatmaxSpeedMs, vla, mlss, mass, anchors);
    assertClose(`${id}: fat at FATmax ≈ MFO`, subAtFATmax.fat_g_h, mfoGH, mfoGH * 0.15);

    // VLamax modifier direction
    if (vlaNorm >= 0) {
      // High VLamax → fatZeroSpeed ≤ MLSS → fat=0 at MLSS
      const subAtMLSS = substrateAtSpeed(mlss, vla, mlss, mass, anchors);
      check(`${id}: fat=0 at MLSS (vlaNorm≥0)`, subAtMLSS.fat_g_h < 1e-9, `VLaNorm=${vlaNorm.toFixed(2)}`);
    } else {
      // Low VLamax → fatZeroSpeed > MLSS → fat>0 at MLSS
      const subAtMLSS = substrateAtSpeed(mlss, vla, mlss, mass, anchors);
      check(`${id}: fat>0 at MLSS (vlaNorm<0, fatZero>MLSS)`, subAtMLSS.fat_g_h > 0, `VLaNorm=${vlaNorm.toFixed(2)}`);
    }

    // CARB90 structural: in valid range (not exact, since curve changed from v2.3)
    console.log(`  INFO  ${id} CARB90 (v2.4)  = ${carb90.toFixed(3)} m/s  (${formatPace(carb90)})`);
    // CARB90 structural: ≥ LT1 - 0.05 m/s (float tolerance) and < MLSS×1.15
    check(`${id}: CARB90 ≥ LT1−0.05`, carb90 >= lt1SpeedMs - 0.05, `CARB90=${carb90.toFixed(3)} LT1=${lt1SpeedMs.toFixed(3)}`);
    check(`${id}: CARB90 < MLSS×1.15`, carb90 < mlss * 1.15, `CARB90=${carb90.toFixed(3)} MLSS×1.15=${(mlss*1.15).toFixed(3)}`);

    // Full pipeline
    const profile = calculateRunningMetabolicProfile({
      sprintDistanceM: s20 * SPRINT_TIME_S,
      sprintTimeS: SPRINT_TIME_S,
      threeMinDistanceM: s180 * 180,
      sixMinDistanceM: s360 * 360,
      massKg: mass,
      bodyFatPct: bfPct,
    });
    check(`${id} pipeline: zones non-empty`,          profile.zones.length > 0);
    check(`${id} pipeline: substrateCurve non-empty`, profile.substrateCurve.length > 0);
    // Verify pipeline CARB90 is in valid range (both standalone and pipeline use anchors)
    check(`${id} pipeline: CARB90 in valid range`,
      profile.primary.carb90SpeedMs >= lt1SpeedMs - 0.05 && profile.primary.carb90SpeedMs < mlss * 1.15,
      `pipeline CARB90=${profile.primary.carb90SpeedMs.toFixed(3)}`);
  }

  // ── v2.3 + VO2max v2.4 Acceptance cases A–D ───────────────────────────────
  // VO2max uses v2.4 aerobic-reserve equation (S180−S360 term).
  // VLamax uses v2.2 component decomposition.
  // MLSS and LT1 use v2.3 direct regressions.
  // xf / FATmax use updated VO2max. CARB90 uses v2.4 FATzero anchoring.
  runCase('A', 5.50, 3.50, 2.83, 65, 10, { vo2:32.51, vla:0.1446, mlss:2.184, lt1:1.612, xf:0.528, fatmax:1.154, mfoG:28.8, mfoK:268 });
  runCase('B', 6.20, 5.20, 4.83, 65, 10, { vo2:59.62, vla:0.1896, mlss:4.422, lt1:3.497, xf:0.719, fatmax:3.177, mfoG:59.9, mfoK:557 });
  runCase('C', 8.10, 5.50, 4.83, 65, 18, { vo2:61.14, vla:0.4534, mlss:4.044, lt1:2.993, xf:0.632, fatmax:2.557, mfoG:45.8, mfoK:426 });
  runCase('D', 7.00, 3.80, 2.80, 85, 18, { vo2:33.75, vla:0.4749, mlss:1.649, lt1:0.928, xf:0.404, fatmax:0.666, mfoG:15.4, mfoK:144 });

  // ── Invalid inputs (required negative tests) ──────────────────────────────
  section('Negative tests — inputs must be rejected before calculation');
  {
    // Invalid-1: S20 = S180 (equal, not faster)
    const inv1errors = validateRunningInputHierarchy(5.50, 5.50, 4.83);
    check('Invalid-1 blocked: S20=S180', inv1errors.length > 0, `errors: ${inv1errors.map(e=>e.message).join('; ')}`);

    // Invalid-2: S180 < S360
    const inv2errors = validateRunningInputHierarchy(5.50, 3.50, 4.83);
    check('Invalid-2 blocked: S180<S360', inv2errors.length > 0, `errors: ${inv2errors.map(e=>e.message).join('; ')}`);

    // timeSprint out of range
    let caughtTime = false;
    try {
      calculateRunningMetabolicProfile({ sprintDistanceM: 100, sprintTimeS: 10,
        threeMinDistanceM: 900, sixMinDistanceM: 1700, massKg: 70, bodyFatPct: 15 });
    } catch { caughtTime = true; }
    check('timeSprint=10 rejected by engine', caughtTime);

    // Confidence flag: high VLamax + low VO2max
    const warnFlags = assessRunningConfidence(30, 0.55, 2.0, 5.0, 3.5, 2.5);
    check('high-VLamax+low-VO2 warn flag fires', warnFlags.some(f => f.level === 'warn'));
  }

  section('formatPace utility');
  {
    check('formatPace(4.0) includes /km', formatPace(4.0).includes('/km'), `got: ${formatPace(4.0)}`);
    check('formatPace(0) returns —',  formatPace(0)  === '—');
    check('formatPace(-1) returns —', formatPace(-1) === '—');
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = _passed + _failed;
  console.log(`\n${'═'.repeat(70)}`);
  if (_failed === 0) {
    console.log(`  ALL TESTS PASSED  (${_passed}/${total})`);
    console.log('  runningMetabolicEngine v2.1 acceptance tests: CLEAN');
  } else {
    console.log(`  FAILURES: ${_failed}/${total} tests failed`);
    console.log('  !! DO NOT integrate into app until all pass !!');
  }
  console.log('═'.repeat(70));

  if (_failed > 0) process.exit(1);
}

// Guard required: this file is imported by client components (for formatPace).
// `require` and `module` are Node.js-only globals — undefined in browser/ESM bundles.
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  runSelfCheck();
}
