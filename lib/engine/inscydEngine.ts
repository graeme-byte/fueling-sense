/**
 * inscydEngine.ts
 * ───────────────
 * Display utilities for the INSCYD surrogate model — 3PT v1.0 pipeline.
 *
 * This file is NOT the active metabolic calculation engine.
 * The active 4PT engine is inscydEngine4pt_v05_scientific.ts (used via /api/inscyd).
 * The active 2PT engine is metabolicModelV06.ts (used via /api/inscyd/v06).
 *
 * This file provides display helpers imported by /api/inscyd for post-processing:
 *   calcTrainingZones  — physiology-anchored 7-zone system
 *   fitLactate         — 2-point exponential lactate curve
 *   vlaNLow/High       — VLamax ±10% confidence interval helpers
 *   ftpLow/High        — FTP ±5% confidence interval helpers
 *
 * Source of truth: INSCYD_MODEL/model_3pt_production.py (frozen 2026-03-22)
 * ALL functions are pure (no side-effects, no React imports).
 */

import type {
  TrainingZone,
  LactateModel,
  Phenotype,
} from '@/lib/types';

// ── Helpers ────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ── VO2max ─────────────────────────────────────────────────────────
// 3PT v1.0 (n=40, R²=0.943, MAE=1.08 ml/kg/min, LOAO-CV).
// Source: INSCYD_MODEL/model_3pt_production.py  VO2_COEF / VO2_INTERCEPT
// VO2max = 12.080 × (P300 / BM) − 0.485

export function calcVO2max(p300: number, bodyMass: number): number {
  return clamp(12.080 * (p300 / bodyMass) - 0.485, 20, 85);
}

// ── Log power slope ────────────────────────────────────────────────
// Slope of log(Power) ~ log(Time).
//
// Primary path (p12min present):
//   Exact 2-point formula matching 3PT v1.0 production model.
//   Anchors: P20 at t=20 s, P12min at t=720 s.
//   P300 is deliberately excluded (matches model_3pt_production.py calc_log_slope).
//
// Fallback (p12min absent):
//   2-point OLS from P20 and P300 only.
//   Not part of the 3PT production model — used only for partial-input sessions.

export function calcLogSlope(p20s: number, p300: number, p12min?: number): number {
  if (p12min && p12min > 0) {
    return (Math.log(p12min) - Math.log(p20s)) / (Math.log(720) - Math.log(20));
  }
  // Fallback: 2-point from P20 and P300.
  return (Math.log(p300) - Math.log(p20s)) / (Math.log(300) - Math.log(20));
}

// ── VLamax ─────────────────────────────────────────────────────────
// 3PT v1.0 (n=40, R²=0.927, MAE=0.023 mmol/L/s, LOAO-CV).
// Source: INSCYD_MODEL/model_3pt_production.py  VLA_COEF_* / VLA_INTERCEPT
// VLamax = 0.0397×(P20/FFM) + 0.0039×(P20/BM) − 0.5852×log_slope − 0.1533
// Note: clamp lower bound is 0.20 (app constraint); Python model clamps to 0.0.

export function calcVLamax(
  p20s:   number,
  p300:   number,
  bodyMass: number,
  bodyFat:  number,
  p12min?:  number,
): number {
  const ffm      = bodyMass * (1 - bodyFat / 100);
  const logSlope = calcLogSlope(p20s, p300, p12min);
  const v =  0.0397 * (p20s / ffm)
           + 0.0039 * (p20s / bodyMass)
           - 0.5852 * logSlope
           - 0.1533;
  return clamp(v, 0.20, 1.20);
}

// ── Critical Power (CP) and W' ─────────────────────────────────────
// Hyperbolic model: P(t) = CP + W' / t
//
// Primary path (p12min present):
//   Exact 2-point solution matching 3PT v1.0 production model.
//   Anchors: P300 at t=300 s and P12min at t=720 s.
//   P20 is deliberately excluded from the fit (matches model_3pt_production.py calc_cp_wp).
//   W' = (P300 − P12min) × 300 × 720 / (720 − 300)
//   CP = P300 − W' / 300
//
// Fallback (p12min absent):
//   2-point OLS from P20 and P300 (linearised: P·t = CP·t + W').
//   Not part of the 3PT production model — used only for partial-input sessions.

export function calcCP(
  p20s:   number,
  p300:   number,
  p12min?: number,
): { cp: number; wPrime: number } {
  if (p12min && p12min > 0) {
    const wPrime = (p300 - p12min) * 300 * 720 / (720 - 300);
    const cp     = p300 - wPrime / 300;
    return {
      cp:     clamp(cp, 50, 1000),
      wPrime: clamp(wPrime, 0, 100_000),
    };
  }
  // Fallback: 2-point OLS from P20 and P300.
  const pts: [number, number][] = [[20, p20s], [300, p300]];
  const t  = pts.map(([ti]) => ti);
  const Pt = pts.map(([ti, pi]) => ti * pi);

  const n   = pts.length;
  const sx  = t.reduce((a, b) => a + b, 0);
  const sy  = Pt.reduce((a, b) => a + b, 0);
  const sxy = t.reduce((a, ti, i) => a + ti * Pt[i], 0);
  const sxx = t.reduce((a, ti) => a + ti * ti, 0);
  const denom = n * sxx - sx * sx;

  let cp: number, wPrime: number;
  if (Math.abs(denom) < 1e-9) {
    cp     = p300 * 0.85;
    wPrime = (p20s - cp) * 20;
  } else {
    cp     = (n * sxy - sx * sy) / denom;
    wPrime = (sy - cp * sx) / n;
  }
  return {
    cp:     clamp(cp, 50, 1000),
    wPrime: clamp(wPrime, 0, 100_000),
  };
}

// ── MLSS ───────────────────────────────────────────────────────────
// 3PT v1.0 ElasticNet (n=40, LOAO-CV, Bias=+0.0W, MAE=16.8W).
// Source: INSCYD_MODEL/model_3pt_production.py  MLSS_INTERCEPT / MLSS_COEF_*
// MLSS = −2.8738 − 80.6411×VLa + 2.0176×VO2 + 0.6879×CP

export function calcMLSS(vlamax: number, vo2max: number, cp: number): number {
  return clamp(-2.8738 - 80.6411 * vlamax + 2.0176 * vo2max + 0.6879 * cp, 50, 600);
}

// ── LT1 ────────────────────────────────────────────────────────────
// 3PT v1.0 M4 ElasticNet (n=31, deployment R²=0.966, MAE=4.5W).
// Source: INSCYD_MODEL/model_3pt_production.py  LT1_INTERCEPT / LT1_COEF_*
// LT1 = 7.668597 − 178.616451×VLa + 1.142957×VO2 + 0.588138×CP + 2.108800×W'[kJ]

export function calcLT1(
  vlamax: number,
  vo2max: number,
  cp:     number,
  wPrime: number,  // joules
): number {
  const wPrimeKj = wPrime / 1000;
  const lt1 =    7.668597
            + (-178.616451) * vlamax
            +    1.142957   * vo2max
            +    0.588138   * cp
            +    2.108800   * wPrimeKj;
  return clamp(lt1, 50, 450);
}

// ── Phenotype ──────────────────────────────────────────────────────

export function calcPhenotype(vlamax: number): Phenotype {
  if (vlamax < 0.40) return 'Endurance';
  if (vlamax > 0.60) return 'Sprinter';
  return 'Balanced';
}

// ── Training Zones ─────────────────────────────────────────────────
//
// Physiology-anchored zone system.
//
// Parameters:
//   lt1  — LT1 (aerobic threshold) in watts
//   lt2  — LT2 / MLSS (anaerobic threshold) in watts
//   ppo  — VO2max anchor power in watts
//          4PT path: PPO = 0.80×P360 + 0.20×P180 (Inscyd4ptSciResult.ppo)
//          3PT path: P300 (the VO2max regression anchor in calcVO2max)
//   p20s — 20-second sprint peak power in watts (upper display ceiling for Zone 7)
//
// Zone structure:
//   Zone 1   0 → 80% LT1
//   Zone 2   80% LT1 → 100% LT1
//   Zone 3A  100% LT1 → 110% LT1
//   Zone 3B  110% LT1 → 95% LT2
//   Zone 4A  95% LT2 → 100% LT2
//   Zone 4B  100% LT2 → 90% PPO     (conditional — omitted when gap ≤ 0)
//   Zone 5   90% PPO → 100% PPO
//   Zone 6   100% PPO → 110% PPO
//   Zone 7   110% PPO → p20s

export function calcTrainingZones(
  lt1:  number,
  lt2:  number,
  ppo:  number,
  p20s: number,
): TrainingZone[] {
  const z1High  = Math.round(lt1 * 0.80);
  const z2High  = Math.round(lt1);
  const z3aHigh = Math.round(lt1 * 1.10);
  const z3bHigh = Math.round(lt2 * 0.95);
  const z4High  = Math.round(lt2);
  const z5bLow  = Math.round(ppo * 0.90);  // 90% VO2max power — Zone 5A/5B boundary
  const z5bHigh = Math.round(ppo);          // 100% VO2max power — Zone 5B ceiling
  const z6High  = Math.round(p20s * 0.90); // 90% P20 — Zone 6/7 boundary
  const z7High  = Math.round(p20s);

  // Monotonicity check on the always-present boundaries (conditional zones excluded).
  const requiredBoundaries: [string, number][] = [
    ['Zone 1 high  (0.80×LT1)',  z1High],
    ['Zone 2 high  (LT1)',       z2High],
    ['Zone 3A high (1.10×LT1)', z3aHigh],
    ['Zone 3B high (0.95×LT2)', z3bHigh],
    ['Zone 4 high  (LT2)',      z4High],
    ['Zone 5B high (PPO)',      z5bHigh],
    ['Zone 7 high  (P20)',      z7High],
  ];

  for (let i = 1; i < requiredBoundaries.length; i++) {
    if (requiredBoundaries[i][1] <= requiredBoundaries[i - 1][1]) {
      console.error(
        `[calcTrainingZones] Non-monotonic boundary: ${requiredBoundaries[i][0]}=${requiredBoundaries[i][1]} ≤ ` +
        `${requiredBoundaries[i - 1][0]}=${requiredBoundaries[i - 1][1]}. ` +
        `Inputs: lt1=${Math.round(lt1)}, lt2=${Math.round(lt2)}, ppo=${Math.round(ppo)}, p20s=${p20s}`,
      );
      return [];
    }
  }

  const zones: TrainingZone[] = [
    { name: 'Zone 1',  label: 'Recovery',         low: 0,       high: z1High  },
    { name: 'Zone 2',  label: 'Base Endurance',    low: z1High,  high: z2High  },
    { name: 'Zone 3A', label: 'Aerobic Threshold', low: z2High,  high: z3aHigh },
    { name: 'Zone 3B', label: 'Tempo',             low: z3aHigh, high: z3bHigh },
    { name: 'Zone 4',  label: 'Threshold',         low: z3bHigh, high: z4High  },
  ];

  // Zone 5A — sub-VO2max bridge; only when 90% of VO2max power strictly exceeds LT2.
  // When omitted, Zone 5B starts at LT2 to keep the system contiguous.
  if (z5bLow > z4High) {
    zones.push({ name: 'Zone 5A', label: 'Sub-VO2max', low: z4High,  high: z5bLow  });
    zones.push({ name: 'Zone 5B', label: 'VO2max',     low: z5bLow,  high: z5bHigh });
  } else {
    zones.push({ name: 'Zone 5B', label: 'VO2max',     low: z4High,  high: z5bHigh });
  }

  // Zone 6 — anaerobic; only when 90% of P20 strictly exceeds VO2max power.
  // When omitted, Zone 7 starts at VO2max power to keep the system contiguous.
  if (z6High > z5bHigh) {
    zones.push({ name: 'Zone 6', label: 'Anaerobic',     low: z5bHigh, high: z6High  });
    zones.push({ name: 'Zone 7', label: 'Neuromuscular', low: z6High,  high: z7High  });
  } else {
    zones.push({ name: 'Zone 7', label: 'Neuromuscular', low: z5bHigh, high: z7High  });
  }

  return zones;
}

// ── Lactate model ──────────────────────────────────────────────────
// Exponential two-point fit: La(P) = 1.0 + A·(e^(kP) − 1)
// Anchored at (LT1, 1.3 mmol/L) and (MLSS, 2.9 mmol/L).

const LA_D1 = 0.3;
const LA_D2 = 1.9;
const LA_R  = LA_D2 / LA_D1; // 19/3

export function fitLactate(lt1: number, mlss: number): LactateModel | null {
  const g = (k: number): number => {
    const e1 = Math.exp(k * lt1);
    const e2 = Math.exp(k * mlss);
    if (!isFinite(e1) || !isFinite(e2)) return Infinity;
    return (e2 - 1) / (e1 - 1) - LA_R;
  };

  let lo = 1e-12;
  let hi = 1.0;
  for (let i = 0; i < 120 && g(hi) < 0; i++) hi *= 2;
  if (g(lo) >= 0 || g(hi) <= 0) return null;

  for (let i = 0; i < 280; i++) {
    const m = (lo + hi) / 2;
    g(m) < 0 ? (lo = m) : (hi = m);
    if (hi - lo < 1e-13) break;
  }
  const k = (lo + hi) / 2;
  const A = LA_D1 / (Math.exp(k * lt1) - 1);
  return { A, k };
}

export function lactateCurve(watts: number, model: LactateModel): number {
  return 1.0 + model.A * (Math.exp(model.k * watts) - 1);
}

// ── Confidence interval helpers ────────────────────────────────────

export function vlaNLow(vlamax: number):  number { return Math.round(vlamax * 0.90 * 1000) / 1000; }
export function vlaNHigh(vlamax: number): number { return Math.round(vlamax * 1.10 * 1000) / 1000; }
export function ftpLow(ftp: number):   number { return Math.round(ftp * 0.95); }
export function ftpHigh(ftp: number):  number { return Math.round(ftp * 1.05); }

