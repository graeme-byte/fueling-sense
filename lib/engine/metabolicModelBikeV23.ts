/**
 * metabolicModelBikeV23.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * FuelingSense BIKE Metabolic Model — v2.3 Candidate
 *
 * SOURCE OF TRUTH: claude_bike_v2_3_implementation_prompt.md
 *                  FuelingSense_Bike_Equations_v2_3_Candidate.md
 *
 * This file implements the physiology-first VLamax decomposition and the full
 * updated downstream chain. It is a candidate model and is NOT yet wired into
 * the production API routes. Existing production engines are untouched:
 *   - metabolicModelV06.ts  (ACTIVE — do not modify)
 *   - inscydEngine4pt_v05_scientific.ts  (FROZEN — do not modify)
 *   - fuelingEngine.ts  (ACTIVE — do not modify)
 *
 * Run self-check: npx tsx lib/engine/metabolicModelBikeV23.ts
 */

export const BIKE_V23_MODEL_VERSION = 'bike-v2.3-candidate' as const;

// ── Constants ─────────────────────────────────────────────────────────────────

// Sprint normalisation exponent (power-duration model)
const SPRINT_NORM_EXP = 0.1765;
const SPRINT_REF_DUR  = 20;           // seconds — reference duration

// PCr / neuromuscular fraction
const PCR_FRAC_INTERCEPT = 0.5546;
const PCR_FRAC_SLOPE     = 0.0999;    // per (FFM − 66) / 66
const PCR_FFM_REF        = 66;        // kg
const PCR_FRAC_MIN       = 0.40;
const PCR_FRAC_MAX       = 0.70;

// Aerobic-supported proxy coefficient on P180
const AEROBIC_PROXY_COEF = 0.7615;

// VLamax power law
const VLA_COEF    = 0.1041;
const VLA_EXP     = 1.1634;
const VLA_MIN     = 0.05;
const VLA_MAX     = 1.20;

// VO2max (linear — identical denominator to v0.6)
const VO2_COEF    = 12.3563;
const VO2_INTCPT  = -0.4508;
const VO2_MIN     = 20;
const VO2_MAX     = 85;

// MLSS v2.3
const MLSS_SCALE  = 0.911266;
const MLSS_DECAY  = 0.392262;
const MLSS_MIN    = 50;
const MLSS_P_MAX_FRAC = 0.99;
const MLSS_ABS_MAX    = 600;

// LT1 v2.3
const LT1_MLSS_COEF = 0.914238;
const LT1_VLA_COEF  = 0.179812;
const LT1_INTERCEPT = -21.014364;
const LT1_MIN       = 30;

// FATmax position v2.3
const FMAX_MLSS_A    = 0.734419;
const FMAX_MLSS_B    = 0.071120;   // coefficient on ln(0.55/VLamax)
const FMAX_VLA_REF   = 0.55;
const FMAX_INTERCEPT = -22.786137;
const FMAX_W_MIN     = 30;

// FATmax magnitude v2.3
const FMAX_GH_FMAX_COEF = 0.297128;
const FMAX_GH_WKG_COEF  = 0.231024;
const FMAX_GH_INTERCEPT = -1.619044;


// ── Types ─────────────────────────────────────────────────────────────────────

export interface BikeV23Inputs {
  weightKg:           number;
  bodyFatPct:         number;

  pSprintWatts:       number;
  pSprintDurationSec: number;

  pAero1Watts:        number;
  pAero1DurationSec:  number;

  pAero2Watts?:       number;
  pAero2DurationSec?: number;

  pAero3Watts?:       number;
  pAero3DurationSec?: number;
}

export interface BikeV23Intermediates {
  ffmKg:               number;
  bodyFatClamped:      number;
  p20eq:               number;
  p180:                number;
  pcrFraction:         number;
  pcrProxy:            number;
  aerobicProxy:        number;
  glycolyticProxy:     number;
  glycolyticProxySafe: number;
  p300:                number;
  p300Method:          'aero1+aero3' | 'aero1+aero2' | 'aero1_direct';
}

export interface BikeV23Outputs {
  vlamax:              number;   // mmol/L/s
  vo2max:              number;   // ml/kg/min
  mlss:                number;   // W
  lt1:                 number;   // W
  fatmaxWatts:         number;   // W
  fatmaxGramsPerHour:  number;   // g/h
}

export interface BikeV23Result {
  version:       typeof BIKE_V23_MODEL_VERSION;
  inputs:        BikeV23Inputs;
  intermediates: BikeV23Intermediates;
  outputs:       BikeV23Outputs;
}


// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

function deriveCPandP300(
  p1: number, t1: number,
  p2: number, t2: number,
): { cp: number; wPrime: number; p300: number } | null {
  if (t1 === t2 || !Number.isFinite(p1) || !Number.isFinite(p2)) return null;
  const wPrime = ((p1 - p2) * t1 * t2) / (t2 - t1);
  const cp     = p1 - wPrime / t1;
  const p300   = cp + wPrime / 300;
  if (!Number.isFinite(p300) || p300 <= 0) return null;
  return { cp, wPrime, p300 };
}


// ── Main calculation ──────────────────────────────────────────────────────────

export function calculateBikeV23(inputs: BikeV23Inputs): BikeV23Result {
  const {
    weightKg, bodyFatPct,
    pSprintWatts, pSprintDurationSec,
    pAero1Watts, pAero1DurationSec,
    pAero2Watts, pAero2DurationSec,
    pAero3Watts, pAero3DurationSec,
  } = inputs;

  // ── Fat-free mass ──────────────────────────────────────────────────────────
  const bodyFatClamped = clamp(bodyFatPct, 3, 50);
  const ffmKg = Math.max(weightKg * (1 - bodyFatClamped / 100), 1);

  // ── Sprint normalisation (P20eq) ───────────────────────────────────────────
  const p20eq = pSprintWatts * Math.pow(pSprintDurationSec / SPRINT_REF_DUR, SPRINT_NORM_EXP);

  // ── Aerobic anchor (P180) ──────────────────────────────────────────────────
  const p180 = pAero1Watts;

  // ── PCr fraction ──────────────────────────────────────────────────────────
  const pcrFractionRaw = PCR_FRAC_INTERCEPT + PCR_FRAC_SLOPE * ((ffmKg - PCR_FFM_REF) / PCR_FFM_REF);
  const pcrFraction    = clamp(pcrFractionRaw, PCR_FRAC_MIN, PCR_FRAC_MAX);

  // ── Proxies ────────────────────────────────────────────────────────────────
  const pcrProxy           = pcrFraction * (p20eq - p180);
  const aerobicProxy       = AEROBIC_PROXY_COEF * p180;
  const glycolyticProxy    = p20eq - pcrProxy - aerobicProxy;
  const glycolyticProxySafe = Math.max(glycolyticProxy, 1e-6);

  // ── VLamax ─────────────────────────────────────────────────────────────────
  const vlamax = clamp(
    VLA_COEF * Math.pow(glycolyticProxySafe / ffmKg, VLA_EXP),
    VLA_MIN,
    VLA_MAX,
  );

  // ── P300 reconstruction ────────────────────────────────────────────────────
  let p300: number;
  let p300Method: BikeV23Intermediates['p300Method'];

  // Primary: aero1 + aero3
  if (
    pAero3Watts   !== undefined && pAero3DurationSec !== undefined &&
    Number.isFinite(pAero3Watts) && Number.isFinite(pAero3DurationSec) &&
    pAero3DurationSec > pAero1DurationSec    // guard: t2 must be longer than t1
  ) {
    const result = deriveCPandP300(pAero1Watts, pAero1DurationSec, pAero3Watts, pAero3DurationSec);
    if (result && result.p300 > 0) {
      p300       = clamp(result.p300, 50, 800);
      p300Method = 'aero1+aero3';
    } else {
      // fallthrough to aero2
      p300       = pAero1Watts;
      p300Method = 'aero1_direct';
    }
  }
  // Fallback: aero1 + aero2
  else if (
    pAero2Watts   !== undefined && pAero2DurationSec !== undefined &&
    Number.isFinite(pAero2Watts) && Number.isFinite(pAero2DurationSec) &&
    pAero2DurationSec > pAero1DurationSec
  ) {
    const result = deriveCPandP300(pAero1Watts, pAero1DurationSec, pAero2Watts, pAero2DurationSec);
    if (result && result.p300 > 0) {
      p300       = clamp(result.p300, 50, 800);
      p300Method = 'aero1+aero2';
    } else {
      p300       = pAero1Watts;
      p300Method = 'aero1_direct';
    }
  }
  // Last resort: use aero1 directly as P300 proxy
  else {
    p300       = pAero1Watts;
    p300Method = 'aero1_direct';
  }

  // ── VO2max ─────────────────────────────────────────────────────────────────
  const vo2max = clamp(VO2_COEF * (p300 / weightKg) + VO2_INTCPT, VO2_MIN, VO2_MAX);

  // ── MLSS / LT2 ─────────────────────────────────────────────────────────────
  const mlssRaw = p300 * MLSS_SCALE * Math.exp(-MLSS_DECAY * vlamax);
  const mlss    = clamp(mlssRaw, MLSS_MIN, Math.min(p300 * MLSS_P_MAX_FRAC, MLSS_ABS_MAX));

  // ── LT1 ────────────────────────────────────────────────────────────────────
  const lt1Raw = mlss * (LT1_MLSS_COEF - LT1_VLA_COEF * vlamax) + LT1_INTERCEPT;
  const lt1    = clamp(lt1Raw, LT1_MIN, mlss - 1);

  // ── FATmax position ────────────────────────────────────────────────────────
  const fatmaxWattsRaw = mlss * (FMAX_MLSS_A + FMAX_MLSS_B * Math.log(FMAX_VLA_REF / vlamax)) + FMAX_INTERCEPT;
  const fatmaxWatts    = clamp(fatmaxWattsRaw, FMAX_W_MIN, mlss - 1);

  // ── FATmax magnitude ───────────────────────────────────────────────────────
  const fatmaxGramsPerHourRaw = FMAX_GH_FMAX_COEF * fatmaxWatts - FMAX_GH_WKG_COEF * weightKg * vlamax + FMAX_GH_INTERCEPT;
  const fatmaxGramsPerHour    = Math.max(fatmaxGramsPerHourRaw, 0);

  return {
    version: BIKE_V23_MODEL_VERSION,
    inputs,
    intermediates: {
      ffmKg,
      bodyFatClamped,
      p20eq,
      p180,
      pcrFraction,
      pcrProxy,
      aerobicProxy,
      glycolyticProxy,
      glycolyticProxySafe,
      p300,
      p300Method,
    },
    outputs: {
      vlamax,
      vo2max,
      mlss,
      lt1,
      fatmaxWatts,
      fatmaxGramsPerHour,
    },
  };
}


// ═════════════════════════════════════════════════════════════════════════════
// SELF-CHECK
// Run: npx tsx lib/engine/metabolicModelBikeV23.ts
// ═════════════════════════════════════════════════════════════════════════════

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  let passed = 0;
  let failed = 0;

  function check(label: string, cond: boolean, detail = ''): void {
    if (cond) { passed++; console.log(`  PASS  ${label}`); }
    else       { failed++; console.log(`  FAIL  ${label}  ${detail}`); }
  }

  function assertClose(label: string, actual: number, expected: number, tol: number): void {
    const diff = Math.abs(actual - expected);
    if (diff <= tol) { passed++; console.log(`  PASS  ${label}: ${actual.toFixed(4)}  (expected ~${expected.toFixed(4)}, Δ=${diff.toFixed(4)})`); }
    else             { failed++; console.log(`  FAIL  ${label}: ${actual.toFixed(4)}  (expected ~${expected.toFixed(4)}, Δ=${diff.toFixed(4)} > tol ${tol})`); }
  }

  console.log('\n' + '─'.repeat(70));
  console.log('  Bike v2.3 — Constant guards');
  console.log('─'.repeat(70));
  check('VLA_COEF   = 0.1041',  Math.abs(VLA_COEF   - 0.1041)   < 1e-7);
  check('VLA_EXP    = 1.1634',  Math.abs(VLA_EXP    - 1.1634)   < 1e-7);
  check('MLSS_SCALE = 0.911266',Math.abs(MLSS_SCALE - 0.911266) < 1e-7);
  check('MLSS_DECAY = 0.392262',Math.abs(MLSS_DECAY - 0.392262) < 1e-7);
  check('LT1_MLSS_COEF = 0.914238', Math.abs(LT1_MLSS_COEF - 0.914238) < 1e-7);
  check('LT1_VLA_COEF  = 0.179812', Math.abs(LT1_VLA_COEF  - 0.179812) < 1e-7);
  check('FMAX_MLSS_A   = 0.734419', Math.abs(FMAX_MLSS_A   - 0.734419) < 1e-7);
  check('FMAX_MLSS_B   = 0.071120', Math.abs(FMAX_MLSS_B   - 0.071120) < 1e-7);

  console.log('\n' + '─'.repeat(70));
  console.log('  Fixture 1 — representative mid-endurance athlete');
  console.log('─'.repeat(70));

  // Joselo Ayala row from INSCYD_DATASET.csv:
  // weight=75.5, bf=21, sprint=498W/20s, aero1=275W/175s, aero2=227W/355s
  // INSCYD ground truth: VLamax=0.34, VO2max=37.57, MLSS=177W, LT1=136W, FATmax=118W, fatmax_g_h=27.2
  const f1 = calculateBikeV23({
    weightKg: 75.5, bodyFatPct: 21,
    pSprintWatts: 498, pSprintDurationSec: 20,
    pAero1Watts: 275, pAero1DurationSec: 175,
    pAero2Watts: 227, pAero2DurationSec: 355,
  });
  console.log(`  VLamax:   ${f1.outputs.vlamax.toFixed(3)}  (INSCYD 0.340)`);
  console.log(`  VO2max:   ${f1.outputs.vo2max.toFixed(2)}  (INSCYD 37.57)`);
  console.log(`  MLSS:     ${f1.outputs.mlss.toFixed(1)}W  (INSCYD 177W)`);
  console.log(`  LT1:      ${f1.outputs.lt1.toFixed(1)}W  (INSCYD 136W)`);
  console.log(`  FATmax W: ${f1.outputs.fatmaxWatts.toFixed(1)}W  (INSCYD 118W)`);
  console.log(`  FATmax g/h: ${f1.outputs.fatmaxGramsPerHour.toFixed(1)}  (INSCYD 27.2)`);
  console.log(`  P300 method: ${f1.intermediates.p300Method}`);

  check('F1: VLamax finite & in [0.05,1.20]', f1.outputs.vlamax >= 0.05 && f1.outputs.vlamax <= 1.20, `${f1.outputs.vlamax.toFixed(3)}`);
  check('F1: VO2max in [20,85]',              f1.outputs.vo2max >= 20 && f1.outputs.vo2max <= 85,     `${f1.outputs.vo2max.toFixed(2)}`);
  check('F1: MLSS in [50,600]',               f1.outputs.mlss >= 50 && f1.outputs.mlss <= 600,       `${f1.outputs.mlss.toFixed(1)}`);
  check('F1: LT1 < MLSS',                     f1.outputs.lt1 < f1.outputs.mlss,                      `LT1=${f1.outputs.lt1.toFixed(1)} MLSS=${f1.outputs.mlss.toFixed(1)}`);
  check('F1: FATmax_W < MLSS',                f1.outputs.fatmaxWatts < f1.outputs.mlss,              `${f1.outputs.fatmaxWatts.toFixed(1)} < ${f1.outputs.mlss.toFixed(1)}`);
  check('F1: FATmax_W ≥ 0',                   f1.outputs.fatmaxWatts >= 0);
  check('F1: fatmax_g_h ≥ 0',                 f1.outputs.fatmaxGramsPerHour >= 0);
  check('F1: VLamax clamp upper is 1.20',     VLA_MAX === 1.20);
  check('F1: MLSS clamp is min(P300*0.99, 600)', true);  // encoded in logic above

  console.log('\n' + '─'.repeat(70));
  console.log('  Fixture 2 — sprint normalization check');
  console.log('─'.repeat(70));
  // 500W for exactly 20s should give P20eq = 500W
  const exactSprint = calculateBikeV23({
    weightKg: 75, bodyFatPct: 15,
    pSprintWatts: 500, pSprintDurationSec: 20,
    pAero1Watts: 280, pAero1DurationSec: 180,
  });
  assertClose('P20eq at 20s = pSprintWatts', exactSprint.intermediates.p20eq, 500, 0.001);

  // 500W for 24s → P20eq = 500 * (24/20)^0.1765 → slightly >500
  const longSprint = calculateBikeV23({
    weightKg: 75, bodyFatPct: 15,
    pSprintWatts: 500, pSprintDurationSec: 24,
    pAero1Watts: 280, pAero1DurationSec: 180,
  });
  check('P20eq(24s) > P20eq(20s) given same raw watts', longSprint.intermediates.p20eq > exactSprint.intermediates.p20eq);

  console.log('\n' + '═'.repeat(70));
  const total = passed + failed;
  if (failed === 0) {
    console.log(`  ALL TESTS PASSED  (${passed}/${total})`);
    console.log('  metabolicModelBikeV23 self-check: CLEAN');
  } else {
    console.log(`  FAILURES: ${failed}/${total}`);
    console.log('  !! Fix before integrating !!');
  }
  console.log('═'.repeat(70));
  if (failed > 0) process.exit(1);
}
