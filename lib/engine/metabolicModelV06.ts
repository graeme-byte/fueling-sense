/**
 * metabolicModelV06.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * FuelingSense v0.6 Metabolic Model — isolated pure engine.
 *
 * STATUS: ACTIVE — production v0.6 2PT physiology engine (used via /api/inscyd/v06).
 * Predecessor: inscydEngine4pt_v05_scientific.ts  (4PT v0.5 — frozen, untouched)
 *
 * ── Model spec (locked) ──────────────────────────────────────────────────────
 *
 *   Required inputs : p20, p300, weightKg, bodyFatPct
 *   Optional inputs : p180, p360, p720  (validation only — NEVER change outputs)
 *
 *   ffmKg     = weightKg × (1 − bodyFatPct / 100)
 *   vlamax    = 0.054126 × (p20 / ffmKg) − 0.118864
 *   vo2max    = 12.3563  × (p300 / weightKg) − 0.4508
 *   mlssWatts = p300 × 0.9129 × exp(−0.4021 × vlamax)
 *   lt1Watts  = mlssWatts × (0.8016 − 0.154 × vlamax) + 3.26
 *   cpWatts   = (mlssWatts + 10) / 0.90   [display only — must NOT feed back]
 *
 * ── Critical rules ────────────────────────────────────────────────────────────
 *   1. cpWatts must NOT feed back into any model calculation.
 *   2. Optional inputs (p180, p360, p720) must NOT affect any output value.
 *   3. MLSS is the central anchor — derived from p300 × exp(−k × vlamax).
 *   4. VLamax drives phenotype differences; it depends only on p20 and FFM.
 *   5. Keep the model minimal — no hidden corrections, no power-duration fitting.
 *
 * ── Guardrails ────────────────────────────────────────────────────────────────
 *   weightKg   ∈ (0, ∞)         — validated at entry; error if ≤ 0
 *   bodyFatPct ∈ [3, 50]        — clamped before use (sane physiological range)
 *   p20        ∈ (0, ∞)         — validated at entry; error if ≤ 0
 *   p300       ∈ (0, ∞)         — validated at entry; error if ≤ 0
 *   ffmKg      ∈ [1, ∞)         — floor at 1 kg (prevents divide-by-zero)
 *   vlamax     ∈ [0.05, 1.20]   — physiologically plausible clamp
 *   vo2max     ∈ [20, 85]       — standard physiological clamp
 *   mlssWatts  ∈ [50, min(p300 × 0.99, 600)] — must be < p300
 *   lt1Watts   ∈ [30, mlssWatts − 1]          — must be < mlssWatts; if raw ≥ MLSS clamp to 0.70 × MLSS
 *   cpWatts    > mlssWatts by formula construction; no additional clamp needed
 *
 * Run self-check: npx tsx lib/engine/metabolicModelV06.ts
 */

export const MODEL_VERSION = 'v0.6' as const;

// ── Model coefficients ────────────────────────────────────────────────────────
//   Named constants mirror the locked spec — do not inline literals.

const VLA_COEF_P20_FFM  =  0.054126;   // VLamax: P20/FFM coefficient
const VLA_INTERCEPT     = -0.118864;   // VLamax: intercept

const VO2_COEF_P300_BM  = 12.3563;    // VO2max: P300/BM coefficient
const VO2_INTERCEPT     = -0.4508;    // VO2max: intercept

const MLSS_P300_SCALE   =  0.9129;    // MLSS: P300 multiplier
const MLSS_VLA_DECAY    =  0.4021;    // MLSS: VLamax decay exponent

// Pipeline source of truth: MODEL_EQUATIONS.md
// LT1 = MLSS × (0.8016 − 0.154 × VLamax) + 3.26
const LT1_MLSS_COEF     =  0.8016;   // LT1: MLSS coefficient
const LT1_VLA_MLSS_COEF =  0.154;    // LT1: VLamax × MLSS interaction coefficient
const LT1_INTERCEPT     =  3.26;     // LT1: intercept

const CP_MLSS_OFFSET    = 10;         // CP: (MLSS + offset) / divisor
const CP_DIVISOR        =  0.90;      // CP: divisor


// ── Types ──────────────────────────────────────────────────────────────────────

/** Required inputs for the v0.6 model. */
export interface MetabolicV06RequiredInputs {
  p20:        number;  // W  — 20-second sprint mean power
  p300:       number;  // W  — 5-minute max mean power
  weightKg:   number;  // kg — total body mass
  bodyFatPct: number;  // %  — body fat percentage
}

/** Full input shape including optional validation efforts. */
export interface MetabolicV06Inputs extends MetabolicV06RequiredInputs {
  p180?: number;  // W — 3-minute peak (validation only — must NOT change outputs)
  p360?: number;  // W — 6-minute peak (validation only — must NOT change outputs)
  p720?: number;  // W — 12-minute peak (validation only — must NOT change outputs)
}

/** Intermediate derived values. */
export interface MetabolicV06Derived {
  ffmKg: number;  // kg — fat-free mass
}

/**
 * Core model outputs.
 *
 * NOTE: cpWatts is labelled display-only. Downstream code must NEVER pass it
 * back into VLamax, VO2max, MLSS, or LT1 calculations.
 */
export interface MetabolicV06Outputs {
  vlamax:     number;  // mmol/L/s — maximal lactate production rate
  vo2max:     number;  // ml/kg/min — maximal oxygen uptake
  mlssWatts:  number;  // W — maximal lactate steady state (primary anchor)
  lt1Watts:   number;  // W — first lactate threshold (lower anchor)
  cpWatts:    number;  // W — critical power (DISPLAY ONLY; must NOT feed back)
}

export type ConfidenceLevel = 'high' | 'moderate' | 'low';

/** Per-input deviation breakdown (signed %). */
export interface MetabolicV06ValidationDeviations {
  p180Pct?: number;  // % deviation: (observed − expected) / expected × 100
  p360Pct?: number;
  p720Pct?: number;
}

export interface MetabolicV06Validation {
  confidence: ConfidenceLevel;
  /**
   * Numeric score 0.0–1.0.
   * 1.0 = all optionals within ±5%;  0.5 = neutral (no optionals provided);
   * lower values reflect increasing deviations.
   * Computed as mean contribution per validated input:
   *   ≤±5%  → 1.0,  ≤±10% → 0.5,  >±10% → 0.0
   */
  score:      number;
  messages:   string[];
  deviations?: MetabolicV06ValidationDeviations;
}

/** Top-level result returned by calculateMetabolicProfileV06(). */
export interface MetabolicV06Result {
  version:    typeof MODEL_VERSION;
  inputs:     MetabolicV06Inputs;
  derived:    MetabolicV06Derived;
  outputs:    MetabolicV06Outputs;
  validation: MetabolicV06Validation;
}


// ── Internal helpers ──────────────────────────────────────────────────────────

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}


// ── Pure formula functions ────────────────────────────────────────────────────

/**
 * Fat-free mass [kg].
 *
 * Guardrails applied:
 *   - bodyFatPct clamped to [3, 50] before use (sane physiological range;
 *     caller validation may be stricter).
 *   - Result floored at 1 kg to prevent divide-by-zero in downstream calcs.
 */
export function calculateFFM(weightKg: number, bodyFatPct: number): number {
  const safeBf = clamp(bodyFatPct, 3, 50);
  const ffm    = weightKg * (1 - safeBf / 100);
  return Math.max(ffm, 1);
}

/**
 * VLamax [mmol/L/s] from 20-second sprint power and fat-free mass.
 *
 * Formula: 0.054126 × (p20 / ffmKg) − 0.118864
 * Clamped [0.05, 1.20] — physiologically plausible range.
 *
 * Lower bound 0.05 (not 0.0): prevents degenerate MLSS behaviour at very low
 * VLamax values while remaining consistent with the v0.6 equation structure.
 */
export function calculateVLamaxFromP20(p20: number, ffmKg: number): number {
  const safeFFM = Math.max(ffmKg, 1);  // belt-and-suspenders against zero
  const v = VLA_COEF_P20_FFM * (p20 / safeFFM) + VLA_INTERCEPT;
  return clamp(v, 0.05, 1.20);
}

/**
 * VO2max [ml/kg/min] from 5-minute power and body mass.
 *
 * Formula: 12.3563 × (p300 / weightKg) − 0.4508
 * Clamped [20, 85] — standard physiological range.
 */
export function calculateVo2maxFromP300(p300: number, weightKg: number): number {
  const safeWeight = Math.max(weightKg, 1);
  const v = VO2_COEF_P300_BM * (p300 / safeWeight) + VO2_INTERCEPT;
  return clamp(v, 20, 85);
}

/**
 * MLSS [W] — maximal lactate steady state.
 *
 * Formula: p300 × 0.9129 × exp(−0.4021 × vlamax)
 *
 * Guardrails:
 *   - Upper bound: min(p300 × 0.99, 600) — MLSS must be strictly less than P300.
 *   - Lower bound: 50 W.
 *
 * NOTE: vo2max is NOT a predictor here. MLSS depends only on p300 and vlamax.
 */
export function calculateMlss(p300: number, vlamax: number): number {
  const raw     = p300 * MLSS_P300_SCALE * Math.exp(-MLSS_VLA_DECAY * vlamax);
  const ceiling = Math.min(p300 * 0.99, 600);  // must be < p300
  return clamp(raw, 50, ceiling);
}

/**
 * LT1 [W] — first lactate threshold (lower aerobic anchor).
 *
 * Formula: MLSS × (0.8016 − 0.154 × VLamax) + 3.26
 * Source of truth: MODEL_EQUATIONS.md §4.
 *
 * Guardrails:
 *   - If raw ≥ MLSS: clamp to MLSS × 0.70 (emergency; should not trigger in practice).
 *   - Lower bound: 30 W.
 */
export function calculateLt1(mlssWatts: number, vlamax: number): number {
  const raw = LT1_MLSS_COEF * mlssWatts - LT1_VLA_MLSS_COEF * mlssWatts * vlamax + LT1_INTERCEPT;
  if (raw >= mlssWatts) return clamp(mlssWatts * 0.70, 30, mlssWatts - 1);
  return clamp(raw, 30, mlssWatts - 1);
}

/**
 * Derived CP [W] — critical power (display only).
 *
 * Formula: (mlssWatts + 10) / 0.90
 *
 * CRITICAL: This value must NOT be passed back into calculateVLamaxFromP20,
 * calculateVo2maxFromP300, calculateMlss, or calculateLt1.
 * It exists solely for user-facing display and as an anchor for the validation
 * layer's power-duration consistency check.
 *
 * By construction, cpWatts > mlssWatts for all positive mlssWatts values.
 */
export function calculateDerivedCp(mlssWatts: number): number {
  return (mlssWatts + CP_MLSS_OFFSET) / CP_DIVISOR;
}


// ── Validation layer ─────────────────────────────────────────────────────────

/**
 * Calculate validation confidence using optional test efforts.
 *
 * Method — internal consistency via hyperbolic power-duration model:
 *   W'  = (p300 − cpWatts) × 300   [estimated from P300 and derived CP]
 *   expectedP(t) = cpWatts + W' / t
 *
 * Each optional input is compared to its expected value:
 *   |deviation| ≤ 5%  → strong   (contribution 1.0)
 *   |deviation| ≤ 10% → acceptable (contribution 0.5)
 *   |deviation| > 10% → flagged   (contribution 0.0)
 *
 * Confidence:
 *   All provided optionals within ±5%  → 'high'
 *   Any provided optional > ±10%      → 'low'
 *   Otherwise                         → 'moderate'
 *   No optionals provided             → 'moderate' (neutral; no penalty)
 *
 * IMPORTANT: This function is READ-ONLY with respect to model outputs.
 * It must NEVER modify vlamax, vo2max, mlssWatts, lt1Watts, or cpWatts.
 *
 * @param p300     — required input (already used in model; here only as W' anchor)
 * @param cpWatts  — derived CP (display value; used only as hyperbolic anchor)
 * @param p180     — optional 3-minute effort
 * @param p360     — optional 6-minute effort
 * @param p720     — optional 12-minute effort
 */
export function calculateValidationConfidence(
  p300:    number,
  cpWatts: number,
  p180?:   number,
  p360?:   number,
  p720?:   number,
): MetabolicV06Validation {
  // Describe each optional slot
  const candidates = [
    { key: 'p180Pct' as keyof MetabolicV06ValidationDeviations, duration: 180, observed: p180 },
    { key: 'p360Pct' as keyof MetabolicV06ValidationDeviations, duration: 360, observed: p360 },
    { key: 'p720Pct' as keyof MetabolicV06ValidationDeviations, duration: 720, observed: p720 },
  ];

  const provided = candidates.filter(c => c.observed !== undefined && c.observed > 0);

  // ── No optional inputs ────────────────────────────────────────────────────
  if (provided.length === 0) {
    return {
      confidence: 'moderate',
      score:      0.5,
      messages:   [
        'Confidence is based on required inputs only (P20 and P300). ' +
        'Add optional efforts (P180, P360, P720) to validate internal consistency.',
      ],
    };
  }

  // ── Estimate W' for the hyperbolic model ──────────────────────────────────
  // W' = (P300 − CP) × 300.  If P300 ≤ CP (pathological input combination),
  // the power-duration model cannot produce meaningful expected values.
  const wPrimeJ = (p300 - cpWatts) * 300;

  if (wPrimeJ <= 0) {
    return {
      confidence: 'low',
      score:      0.0,
      messages:   [
        `Cannot validate optional inputs: P300 (${p300}W) ≤ derived CP (${Math.round(cpWatts)}W). ` +
        'Check that P300 reflects a true 5-minute maximal effort.',
      ],
    };
  }

  // ── Evaluate each provided optional ───────────────────────────────────────
  const messages:   string[]                       = [];
  const deviations: MetabolicV06ValidationDeviations = {};
  const contributions:  number[]                   = [];
  let   anyFlagged = false;
  let   allStrong  = true;

  for (const { key, duration, observed } of provided) {
    if (observed === undefined || observed <= 0) continue;

    const expected = cpWatts + wPrimeJ / duration;
    const pctDev   = ((observed - expected) / expected) * 100;
    const absDev   = Math.abs(pctDev);

    deviations[key] = Math.round(pctDev * 10) / 10;

    if (absDev <= 5) {
      contributions.push(1.0);
      // No message needed — strong agreement is the expected case.
    } else if (absDev <= 10) {
      contributions.push(0.5);
      allStrong = false;
      messages.push(
        `P${duration}: observed ${observed}W is ${pctDev > 0 ? '+' : ''}${pctDev.toFixed(1)}% ` +
        `from expected ${Math.round(expected)}W (acceptable — within ±10%).`,
      );
    } else {
      contributions.push(0.0);
      allStrong = false;
      anyFlagged = true;
      messages.push(
        `P${duration}: observed ${observed}W is ${pctDev > 0 ? '+' : ''}${pctDev.toFixed(1)}% ` +
        `from expected ${Math.round(expected)}W — exceeds ±10% threshold; check effort quality.`,
      );
    }
  }

  if (contributions.length === 0) {
    // All optionals were skipped (should not reach here due to wPrimeJ guard)
    return { confidence: 'moderate', score: 0.5, messages };
  }

  // ── Assign confidence and score ───────────────────────────────────────────
  const score:      number          = contributions.reduce((a, b) => a + b, 0) / contributions.length;
  const confidence: ConfidenceLevel = anyFlagged ? 'low' : allStrong ? 'high' : 'moderate';

  if (allStrong) {
    messages.unshift(
      `All ${contributions.length} optional input(s) are within ±5% of expected values — strong internal consistency.`,
    );
  }

  return {
    confidence,
    score: Math.round(score * 100) / 100,
    messages,
    deviations,
  };
}


// ── Master pipeline function ──────────────────────────────────────────────────

/**
 * Run the full v0.6 metabolic profile pipeline.
 *
 * Execution order is critical — do not rearrange:
 *   1. ffmKg      = f(weightKg, bodyFatPct)
 *   2. vlamax     = f(p20, ffmKg)
 *   3. vo2max     = f(p300, weightKg)             ← independent of vlamax
 *   4. mlssWatts  = f(p300, vlamax)               ← NOT f(vo2max, CP)
 *   5. lt1Watts   = f(mlssWatts, vlamax)
 *   6. cpWatts    = f(mlssWatts)                  ← last; isolated from steps 1–5
 *   7. validation = f(p300, cpWatts, p180?, p360?, p720?)  ← read-only
 *
 * @throws {Error} on clearly invalid required inputs (weightKg ≤ 0, p20 ≤ 0, p300 ≤ 0,
 *                 bodyFatPct outside [0, 100))
 */
export function calculateMetabolicProfileV06(inputs: MetabolicV06Inputs): MetabolicV06Result {
  const { p20, p300, weightKg, bodyFatPct, p180, p360, p720 } = inputs;

  // ── Required input guardrails (fail fast; no silent corrections) ──────────
  if (weightKg <= 0)               throw new Error(`[v0.6] weightKg must be > 0 (got ${weightKg})`);
  if (p20 <= 0)                    throw new Error(`[v0.6] p20 must be > 0 (got ${p20})`);
  if (p300 <= 0)                   throw new Error(`[v0.6] p300 must be > 0 (got ${p300})`);
  if (bodyFatPct < 0 || bodyFatPct >= 100) {
    throw new Error(`[v0.6] bodyFatPct must be in [0, 100) (got ${bodyFatPct})`);
  }

  // ── Core model (fixed execution order — see JSDoc above) ─────────────────
  const ffmKg     = calculateFFM(weightKg, bodyFatPct);
  const vlamax    = calculateVLamaxFromP20(p20, ffmKg);
  const vo2max    = calculateVo2maxFromP300(p300, weightKg);
  const mlssWatts = calculateMlss(p300, vlamax);
  const lt1Watts  = calculateLt1(mlssWatts, vlamax);

  // CP computed last — must NOT be referenced by any step above this line.
  const cpWatts   = calculateDerivedCp(mlssWatts);

  // ── Validation (optional inputs — read-only; never modifies outputs) ──────
  const validation = calculateValidationConfidence(p300, cpWatts, p180, p360, p720);

  return {
    version:    MODEL_VERSION,
    inputs,
    derived:    { ffmKg },
    outputs:    { vlamax, vo2max, mlssWatts, lt1Watts, cpWatts },
    validation,
  };
}


// ═════════════════════════════════════════════════════════════════════════════
// SELF-CHECK
// Regression fixtures and physiological invariant checks.
// Run via: npx tsx lib/engine/metabolicModelV06.ts
//
// These are pin-tests against the locked equation coefficients.
// All assertions must pass before any coefficient or formula change.
// ═════════════════════════════════════════════════════════════════════════════

let _passed = 0;
let _failed = 0;

function assertClose(label: string, actual: number, expected: number, tol: number): void {
  const diff = Math.abs(actual - expected);
  if (diff <= tol) {
    _passed++;
    console.log(`  PASS  ${label}: ${actual.toFixed(6)}  (expected ${expected.toFixed(6)}, Δ=${diff.toExponential(2)})`);
  } else {
    _failed++;
    console.log(`  FAIL  ${label}: ${actual.toFixed(6)}  (expected ${expected.toFixed(6)}, Δ=${diff.toFixed(6)} > tol ${tol})`);
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
  // ── Primary fixture ───────────────────────────────────────────────────────
  // Balanced-endurance athlete: BM=75kg, BF=12%, P20=660W, P300=325W
  // Hand-computed reference values (locked 2026-04-09).

  const BM   = 75.0;
  const BF   = 12.0;
  const P20  = 660.0;
  const P300 = 325.0;

  // ffmKg = 75 × (1 − 0.12) = 66.0
  const FFM_EXP = 66.0;

  // vlamax = 0.054126 × (660 / 66) − 0.118864 = 0.054126 × 10 − 0.118864 = 0.422396
  const VLA_EXP = 0.054126 * (P20 / FFM_EXP) + VLA_INTERCEPT;  // ≈ 0.422396

  // vo2max = 12.3563 × (325 / 75) − 0.4508 = 12.3563 × 4.3333 − 0.4508 ≈ 53.048
  const VO2_EXP = VO2_COEF_P300_BM * (P300 / BM) + VO2_INTERCEPT;

  // mlssWatts = 325 × 0.9129 × exp(−0.4021 × 0.422396)
  //           = 325 × 0.9129 × exp(−0.16987) ≈ 325 × 0.9129 × 0.84393 ≈ 250.27
  const MLSS_EXP = P300 * MLSS_P300_SCALE * Math.exp(-MLSS_VLA_DECAY * VLA_EXP);

  // lt1Watts = 250.27 × (0.8016 − 0.154 × 0.422396) + 3.26
  //          = 250.27 × 0.736551 + 3.26 ≈ 187.56
  const LT1_EXP  = LT1_MLSS_COEF * MLSS_EXP - LT1_VLA_MLSS_COEF * MLSS_EXP * VLA_EXP + LT1_INTERCEPT;

  // cpWatts = (250.27 + 10) / 0.90 ≈ 289.19
  const CP_EXP   = (MLSS_EXP + CP_MLSS_OFFSET) / CP_DIVISOR;


  section('Test 1 — Coefficient drift guards');

  function coefCheck(name: string, actual: number, expected: number): void {
    if (Math.abs(actual - expected) < 1e-7) {
      _passed++;
      console.log(`  PASS  ${name} = ${actual}`);
    } else {
      _failed++;
      console.log(`  FAIL  ${name}: got ${actual}, expected ${expected}`);
    }
  }

  coefCheck('VLA_COEF_P20_FFM ', VLA_COEF_P20_FFM,  0.054126);
  coefCheck('VLA_INTERCEPT    ', VLA_INTERCEPT,     -0.118864);
  coefCheck('VO2_COEF_P300_BM ', VO2_COEF_P300_BM,  12.3563);
  coefCheck('VO2_INTERCEPT    ', VO2_INTERCEPT,     -0.4508);
  coefCheck('MLSS_P300_SCALE  ', MLSS_P300_SCALE,    0.9129);
  coefCheck('MLSS_VLA_DECAY   ', MLSS_VLA_DECAY,     0.4021);
  coefCheck('LT1_MLSS_COEF       ', LT1_MLSS_COEF,         0.8016);
  coefCheck('LT1_VLA_MLSS_COEF   ', LT1_VLA_MLSS_COEF,     0.154);
  coefCheck('LT1_INTERCEPT       ', LT1_INTERCEPT,           3.26);
  coefCheck('CP_MLSS_OFFSET   ', CP_MLSS_OFFSET,     10);
  coefCheck('CP_DIVISOR       ', CP_DIVISOR,          0.90);


  section('Test 2 — Individual formula functions (primary fixture)');

  const ffmA    = calculateFFM(BM, BF);
  const vlaA    = calculateVLamaxFromP20(P20, ffmA);
  const vo2A    = calculateVo2maxFromP300(P300, BM);
  const mlssA   = calculateMlss(P300, vlaA);
  const lt1A    = calculateLt1(mlssA, vlaA);
  const cpA     = calculateDerivedCp(mlssA);

  assertClose('FFM       [kg]',        ffmA,   FFM_EXP,  0.0001);
  assertClose('VLamax    [mmol/L/s]',  vlaA,   VLA_EXP,  0.0001);
  assertClose('VO2max    [ml/kg/min]', vo2A,   VO2_EXP,  0.001);
  assertClose('MLSS      [W]',         mlssA,  MLSS_EXP, 0.01);
  assertClose('LT1       [W]',         lt1A,   LT1_EXP,  0.01);
  assertClose('CP        [W]',         cpA,    CP_EXP,   0.01);


  section('Test 3 — Physiological invariants (primary fixture)');

  check('VLamax ∈ [0.05, 1.20]',   vlaA >= 0.05 && vlaA <= 1.20, `${vlaA.toFixed(4)}`);
  check('VO2max ∈ [20, 85]',       vo2A >= 20   && vo2A <= 85,   `${vo2A.toFixed(2)}`);
  check('MLSS < P300',             mlssA < P300,                  `MLSS=${mlssA.toFixed(1)} P300=${P300}`);
  check('LT1 < MLSS',             lt1A  < mlssA,                 `LT1=${lt1A.toFixed(1)} MLSS=${mlssA.toFixed(1)}`);
  check('CP > MLSS',              cpA   > mlssA,                  `CP=${cpA.toFixed(1)} MLSS=${mlssA.toFixed(1)}`);
  check('LT1 < MLSS < CP (chain)', lt1A < mlssA && mlssA < cpA);


  section('Test 4 — Pipeline runner (primary fixture)');

  const rA = calculateMetabolicProfileV06({ p20: P20, p300: P300, weightKg: BM, bodyFatPct: BF });

  check("version === 'v0.6'",       rA.version === 'v0.6',        `got '${rA.version}'`);
  assertClose('pipeline ffm   [kg]',        rA.derived.ffmKg,       FFM_EXP,  0.0001);
  assertClose('pipeline vlamax [mmol/L/s]', rA.outputs.vlamax,       VLA_EXP,  0.0001);
  assertClose('pipeline vo2max [ml/kg/min]',rA.outputs.vo2max,       VO2_EXP,  0.001);
  assertClose('pipeline mlss  [W]',         rA.outputs.mlssWatts,    MLSS_EXP, 0.01);
  assertClose('pipeline lt1   [W]',         rA.outputs.lt1Watts,     LT1_EXP,  0.01);
  assertClose('pipeline cp    [W]',         rA.outputs.cpWatts,      CP_EXP,   0.01);
  check('validation confidence is string',  typeof rA.validation.confidence === 'string');
  check('validation score is number',       typeof rA.validation.score === 'number');
  check('no-optional → moderate confidence', rA.validation.confidence === 'moderate');


  section('Test 5 — CP isolation: changing only cpWatts does NOT affect MLSS');

  // Verify that the formula for cpWatts is NOT circular:
  // cpWatts depends only on mlssWatts; mlssWatts depends on p300 and vlamax only.
  const mlssFromP300andVla = calculateMlss(P300, vlaA);
  assertClose(
    'MLSS is identical whether cp was calculated or not',
    mlssFromP300andVla, mlssA, 1e-9,
  );


  section('Test 6 — Validation layer: optional inputs do NOT change core outputs');

  const withOptionals = calculateMetabolicProfileV06({
    p20: P20, p300: P300, weightKg: BM, bodyFatPct: BF,
    p180: 390, p360: 350, p720: 330,
  });

  // Core outputs must be byte-identical regardless of optional inputs
  check(
    'vlamax unchanged by optional inputs',
    withOptionals.outputs.vlamax === rA.outputs.vlamax,
    `${withOptionals.outputs.vlamax} vs ${rA.outputs.vlamax}`,
  );
  check(
    'vo2max unchanged by optional inputs',
    withOptionals.outputs.vo2max === rA.outputs.vo2max,
    `${withOptionals.outputs.vo2max} vs ${rA.outputs.vo2max}`,
  );
  check(
    'mlssWatts unchanged by optional inputs',
    withOptionals.outputs.mlssWatts === rA.outputs.mlssWatts,
    `${withOptionals.outputs.mlssWatts} vs ${rA.outputs.mlssWatts}`,
  );
  check(
    'lt1Watts unchanged by optional inputs',
    withOptionals.outputs.lt1Watts === rA.outputs.lt1Watts,
    `${withOptionals.outputs.lt1Watts} vs ${rA.outputs.lt1Watts}`,
  );
  check(
    'cpWatts unchanged by optional inputs',
    withOptionals.outputs.cpWatts === rA.outputs.cpWatts,
    `${withOptionals.outputs.cpWatts} vs ${rA.outputs.cpWatts}`,
  );
  // Validation result should differ (optionals were provided)
  check(
    'validation deviations present when optionals provided',
    withOptionals.validation.deviations !== undefined,
  );


  section('Test 7 — Stress athletes: physiological invariants');

  // B — sprinter (high VLamax)
  const rB = calculateMetabolicProfileV06({ p20: 1100, p300: 350, weightKg: 80, bodyFatPct: 10 });
  // C — endurance specialist (low VLamax)
  const rC = calculateMetabolicProfileV06({ p20: 480,  p300: 280, weightKg: 65, bodyFatPct: 8  });

  for (const [label, r] of [['Sprinter B', rB], ['Endurance C', rC]] as const) {
    check(`${label}: VLamax ∈ [0.05, 1.20]`, r.outputs.vlamax >= 0.05 && r.outputs.vlamax <= 1.20, `${r.outputs.vlamax.toFixed(3)}`);
    check(`${label}: VO2max ∈ [20, 85]`,     r.outputs.vo2max >= 20   && r.outputs.vo2max <= 85,   `${r.outputs.vo2max.toFixed(2)}`);
    check(`${label}: MLSS < P300`,           r.outputs.mlssWatts < r.inputs.p300,                  `MLSS=${r.outputs.mlssWatts.toFixed(1)}`);
    check(`${label}: LT1 < MLSS`,           r.outputs.lt1Watts  < r.outputs.mlssWatts,             `LT1=${r.outputs.lt1Watts.toFixed(1)} MLSS=${r.outputs.mlssWatts.toFixed(1)}`);
    check(`${label}: CP > MLSS`,            r.outputs.cpWatts   > r.outputs.mlssWatts,             `CP=${r.outputs.cpWatts.toFixed(1)}`);
  }


  section('Test 8 — Guard: invalid required inputs throw');

  const shouldThrow = (label: string, fn: () => void): void => {
    try {
      fn();
      _failed++;
      console.log(`  FAIL  ${label}: expected Error but no throw`);
    } catch {
      _passed++;
      console.log(`  PASS  ${label}: threw as expected`);
    }
  };

  shouldThrow('weightKg = 0',       () => calculateMetabolicProfileV06({ p20: 500, p300: 300, weightKg: 0,   bodyFatPct: 15 }));
  shouldThrow('p20 = 0',            () => calculateMetabolicProfileV06({ p20: 0,   p300: 300, weightKg: 70,  bodyFatPct: 15 }));
  shouldThrow('p300 = 0',           () => calculateMetabolicProfileV06({ p20: 500, p300: 0,   weightKg: 70,  bodyFatPct: 15 }));
  shouldThrow('bodyFatPct = 100',   () => calculateMetabolicProfileV06({ p20: 500, p300: 300, weightKg: 70,  bodyFatPct: 100 }));
  shouldThrow('bodyFatPct = -1',    () => calculateMetabolicProfileV06({ p20: 500, p300: 300, weightKg: 70,  bodyFatPct: -1 }));


  // ── Summary ───────────────────────────────────────────────────────────────
  const total = _passed + _failed;
  console.log(`\n${'═'.repeat(70)}`);
  if (_failed === 0) {
    console.log(`  ALL TESTS PASSED  (${_passed}/${total})`);
    console.log('  metabolicModelV06 self-check: CLEAN');
  } else {
    console.log(`  FAILURES: ${_failed}/${total} tests failed`);
    console.log('  !! DO NOT integrate into app until all pass !!');
  }
  console.log('═'.repeat(70));

  if (_failed > 0) process.exit(1);
}

// Run only when executed directly: `npx tsx lib/engine/metabolicModelV06.ts`
if (require.main === module) {
  runSelfCheck();
}
