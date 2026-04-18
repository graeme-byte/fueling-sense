// ─────────────────────────────────────────────────────────────────
//  Shared TypeScript types for Fuelling Sense + INSCYD pipeline
// ─────────────────────────────────────────────────────────────────

// ── Enumerations ──────────────────────────────────────────────────

export type AthleteLevel = 'Health & Fitness' | 'Recreational' | 'Developmental' | 'Competitive' | 'Top Age Group' | 'Pro';
export type DietType     = 'Standard' | 'Keto';
export type Sex          = 'Male' | 'Female';
export type Phenotype    = 'Endurance' | 'Balanced' | 'Sprinter';
export type SubscriptionTier = 'free' | 'pro';
export type IntensityZoneLabel = 'Below LT1' | 'LT1–LT2' | 'Above LT2';
export type EventType =
  | 'Cycling <2h'
  | 'Cycling 2–4h'
  | 'Cycling >4h'
  | 'Triathlon <2h'
  | 'Triathlon 2–4h'
  | 'Triathlon >4h';

// ── INSCYD Input — 3PT (legacy; kept for backward compat with inscydEngine.ts) ──

export interface InscydInputs {
  name:    string;
  bodyMass: number;       // kg
  bodyFat:  number;       // %
  p20s:     number;       // watts — 20-second mean sprint power
  p300:     number;       // watts — 5-minute mean power
  p12min?:  number;       // watts — optional 12-minute effort
}

// ── INSCYD Input — 4PT (v0.5 engine; active protocol) ─────────────

export interface Inscyd4ptInputs {
  name:     string;
  bodyMass: number;   // kg
  bodyFat:  number;   // %
  p20s:     number;   // watts — 20-second sprint
  p180:     number;   // watts — 3-minute peak
  p360:     number;   // watts — 6-minute peak
  p720:     number;   // watts — 12-minute peak
}

// ── INSCYD Result ─────────────────────────────────────────────────
// FTP remains a first-class output of the INSCYD profiler.
// It is retained here for profiler display and training zone calculations.
// It is NOT passed into FuelSense calculations.

export interface InscydResult {
  // Inputs echoed back (3PT path: InscydInputs; 4PT path: Inscyd4ptInputs)
  inputs: InscydInputs | Inscyd4ptInputs;

  // Model metadata
  modelVersion?: string;  // e.g. '4PT_v0.5_scientific_candidate'

  // Body composition
  ffm:          number;   // fat-free mass (kg)
  muscleMass?:  number;   // estimated muscle mass (kg) — 3PT only
  sprintPerKg?: number;   // W/kg — 3PT only
  sprintPerFFM?: number;  // W/kg-FFM — 3PT only
  p300PerKg?:   number;   // W/kg — deprecated; p300 no longer required

  // Derived metrics
  vo2max:    number;   // ml/kg/min
  vlamax:    number;   // mmol/L/s
  ftp:       number;   // watts — profiler display only; not used in FuelSense
  ppo?:      number;   // W — PPO anchor (v0.5 only: 0.80×P360 + 0.20×P180)
  cp:        number;   // watts
  wPrime:    number;   // joules
  wPrimeKj?: number;   // kJ convenience
  mlss:      number;   // watts — primary upper metabolic anchor
  lt1:       number;   // watts — lower metabolic anchor
  logSlope:  number;   // OLS slope of log(W)~log(t)
  phenotype: Phenotype;

  // Confidence intervals
  vlaNLow:  number;
  vlaNHigh: number;
  ftpLow:   number;
  ftpHigh:  number;

  // Training zones (FTP-based — profiler display only)
  zones: TrainingZone[];

  // Lactate curve model parameters
  lactate: LactateModel | null;
}

export interface TrainingZone {
  name:  string;
  label: string;
  low:   number;  // watts
  high:  number;  // watts
}

export interface LactateModel {
  A: number;
  k: number;
}

// ── Fuelling Sense Input ──────────────────────────────────────────
// Primary anchors are MLSS (upper) and LT1 (lower).
// FTP is no longer a FuelSense input.

export interface FuelingInputs {
  // Athlete profile — UI context only; name/sex/age do NOT enter engine calculations
  name:         string;
  sex:          Sex;
  age?:         number;   // years — display/benchmarking only
  weight:       number;   // kg
  bodyFat:      number;   // %
  // athleteLevel is no longer a physiological driver — all metabolic parameters
  // (FATmax position via M3, FATmax magnitude via G6, GE via VO2max) are continuous.
  // Retained as optional for backward compat with stored results and display use only.
  athleteLevel?: AthleteLevel;
  dietType:      DietType;

  // Metabolic anchors — replace FTP as the intensity reference
  mlssWatts:    number;   // primary upper anchor (MLSS / anaerobic threshold)
  lt1Watts:     number;   // lower anchor (LT1 / aerobic threshold) — used for zone display only

  // VLamax modifier for FATmax position adjustment.
  // Optional for backward compat — legacy inputs without this field default to neutral (0.55).
  // Higher VLamax → lower FATmax intensity; lower VLamax → higher FATmax intensity.
  vlamax?:         number;   // mmol/L/s — carried from INSCYD metabolic profiler

  // VO2max — drives continuous GE model (GE1: GE = 0.2443 − 0.000259 × vo2max_rel).
  // Optional for backward compat — carried from INSCYD prefill; absent on manual-entry forms.
  vo2maxMlKgMin?: number;   // ml/kg/min

  // Event context — drives fueling strategy classification
  eventType:    EventType;

  // Session targets
  targetWatts:  number;   // race/session target power
  targetCHO:    number;   // planned CHO intake g/h

  // Auto-populated from INSCYD (optional)
  inscydResultId?: string;
}

// ── Fuelling Sense Result ─────────────────────────────────────────

export interface FuelingResult {
  inputs: FuelingInputs;

  // Lookup values
  ge:             number;   // Gross Efficiency (0.20–0.27, continuous VO2max-based formula)
  fatmaxPctMLSS:  number;   // fraction of MLSS where fat oxidation peaks (xf)
  fatzeroPctMLSS: number;   // fraction of MLSS where fat oxidation → 0 (xz)
  fatmaxWkg:      number;   // peak fat oxidation g/h (scaled) — NOTE: field name is a historical artifact; stores g/h, not W/kg
  fatmaxKcal:     number;   // peak fat oxidation kcal/h

  // Target power analysis
  target: {
    pctMLSS:     number;   // target intensity as fraction of MLSS
    pctLT1:      number;   // target intensity as fraction of LT1
    kcalPerHour: number;
    fatKcalHour: number;
    fatGHour:    number;
    choKcalHour: number;
    choGHour:    number;
    choRange:    string;   // "79–96"
  };

  // Intensity zone context (replaces ftpValidRange)
  intensityAnchors: {
    mlssWatts:     number;
    lt1Watts:      number;
    targetPctMLSS: number;         // same as target.pctMLSS — convenience
    targetPctLT1:  number;
    zoneLabel:     IntensityZoneLabel;
  };

  // Structured coaching advice (two independent sections)
  advice: FuelingAdvice;

  // Dense 1 W substrate series — single source of truth for chart + CARB90
  denseSubstrateSeries: DenseSubstratePoint[];

  // CARB90 threshold — solved from dense 1 W model evaluation, not snapped to display rows
  carb90: {
    watts:       number;   // interpolated crossing point rounded to nearest whole watt
    pctLT2:      number;   // whole-number % of LT2
    found:       boolean;  // false when 90 g/h is not reached within the modelled range
    choAtCarb90: number;   // CHO g/h re-evaluated at the exact crossing (~90); validation check
  };

  // Zone-by-zone substrate summary table (Zones 1–5B, excl. 6 & 7)
  zoneSubstrateTable: ZoneSubstrateRow[];
}

// ── Fuelling Sense Advice ─────────────────────────────────────────

export type IntensityAlignment = 'BELOW' | 'WITHIN' | 'ABOVE';

export type StrategyLabel =
  | 'Easily Achievable'
  | 'Achievable'
  | 'Needs Work'
  | 'Reaching'
  | 'Overreaching'
  | 'Rethink';

// Machine-readable strategy diagnosis — separate from the user-facing StrategyLabel.
// These categories identify WHAT is wrong (intake / pacing / both / over-fueling).
export type PrimaryProblem =
  | 'manageable'                  // within tolerance, normal pacing
  | 'manageable_with_buffer'      // planned slightly above required (≤10% overshoot)
  | 'intake_too_low'              // significant underfueling, pacing acceptable
  | 'demand_too_high'             // pacing is above range and driving the deficit
  | 'both_demand_and_intake'      // ABOVE range, high demand, AND large intake gap
  | 'aggressive_but_supported'    // ABOVE range, but intake covers demand
  | 'ceiling_exceeded'            // required CHO > 120 g/h — physiologically extreme
  | 'overfueled_buffered'         // planned 10–20% above required
  | 'overfueled_aggressive'       // planned >20% above required AND planned > 90 g/h
  | 'overfueled_excessive';       // planned > 120 g/h regardless of required

// What the athlete should change first.
export type ActionPriority =
  | 'maintain'                          // strategy is already well-calibrated
  | 'increase_intake'                   // intake is the primary limiter
  | 'reduce_pacing'                     // pacing is too high, demand-side fix needed
  | 'increase_intake_and_reduce_pacing' // both corrections needed (intake first)
  | 'reduce_intake'                     // planned intake exceeds requirement
  | 'reduce_pacing_or_build_physiology'; // demand too high to fuel through; structural fix required

// Binary flags for programmatic consumers and conditional UI.
export interface StrategyFlags {
  highIntakePlanned:    boolean;   // planned > 90 g/h
  extremeIntakePlanned: boolean;   // planned > 120 g/h — never advise increasing further
  extremeDemand:        boolean;   // required > 120 g/h
  highDemand:           boolean;   // required > 90 g/h
  pacingAboveRange:     boolean;   // alignment === 'ABOVE'
  largeFuelingGap:      boolean;   // underfueling gap > 20 g/h
}

export interface FuelingStrategyAdvice {
  eventType:           EventType;
  intensityPctLT2:     number;             // target / LT2, e.g. 0.82
  expectedRangeLow:    number;             // e.g. 0.78
  expectedRangeHigh:   number;             // e.g. 0.90
  alignment:           IntensityAlignment;
  strategyLabel:       StrategyLabel;      // user-facing achievability label
  primaryProblem:      PrimaryProblem;     // machine-readable diagnosis category
  actionPriority:      ActionPriority;     // what the athlete should change first
  flags:               StrategyFlags;      // binary flags for conditional logic / UI
  nutritionAnalysis:   string;             // plain text — planned vs required CHO, ratios, gut guidance
  pacingAnalysis:      string;             // plain text — intensity alignment + fueling-gap overlay
}

export interface CarbRequirementAdvice {
  level:           'GREEN' | 'AMBER' | 'RED';
  requiredCHO_gph: number;
  highIntakeFlag:  boolean;
  performanceText: string;
  riskText:        string;
  decisionText:    string;
}

export interface GapAnalysisAdvice {
  level:               'GREEN' | 'AMBER' | 'RED';
  direction:           'UNDER' | 'OVER' | 'ALIGNED';
  gap_gph:             number;   // signed: negative = underfueling, positive = overfueling
  gapPct:              number;   // signed fraction: negative = underfueling, positive = overfueling (0 when required === 0)
  gapKcal_h:           number;
  recommendedTarget:   number;   // progressive gap-close target (g/h); hard ceiling 120
  performanceText:     string;
  riskText:            string;
  decisionText:        string;
  cautionFlag:         boolean;  // true when recommendedTarget ≥ 90 g/h — high-intake caution
  cautionText:         string;   // non-empty only when cautionFlag is true
}

export interface FuelingAdvice {
  strategy:        FuelingStrategyAdvice;
  carbRequirement: CarbRequirementAdvice;
  gapAnalysis:     GapAnalysisAdvice;
}

// ── Dense substrate series ────────────────────────────────────────
// 1 W resolution, 50%–150% LT2. Single source of truth for the chart
// and CARB90 threshold detection.

export interface DenseSubstratePoint {
  watts:       number;
  pctLT2:      number;   // whole-number % of LT2
  fatG:        number;   // g/h, 1-decimal
  choG:        number;   // g/h, UNROUNDED — used for CARB90 interpolation
  kcalPerHour: number;   // whole number
  fatKcalH:    number;   // kcal/h, whole number
  choKcalH:    number;   // kcal/h, whole number
  fatPct:      number;   // 0–100, whole number
}

// ── Zone substrate table ──────────────────────────────────────────

export interface ZoneSubstratePoint {
  fatG:        number;
  choG:        number;
  kcalPerHour: number;
}

export interface ZoneSubstrateRow {
  name:   string;   // e.g. 'Zone 3A'
  label:  string;   // e.g. 'Aerobic Threshold'
  low:    number;   // watts — zone lower boundary
  mid:    number;   // watts — zone midpoint
  high:   number;   // watts — zone upper boundary (capped at model max)
  atLow:  ZoneSubstratePoint;
  atMid:  ZoneSubstratePoint;
  atHigh: ZoneSubstratePoint;
}

// ── Data pipeline bridge ──────────────────────────────────────────
// Maps INSCYD outputs to Fuelling Sense pre-fill values.
// mlss and lt1 are the primary anchors; ftp is retained for
// display purposes in the profiler but not forwarded to the fueling engine.

export interface INSCYDToFuelingSenseBridge {
  mlssWatts:      number;   // primary upper anchor → FuelSense mlssWatts
  lt1Watts:       number;   // lower anchor → FuelSense lt1Watts (zone display only)
  vlamax:         number;   // mmol/L/s → FuelSense FATmax position modifier
  weight:         number;
  bodyFat:        number;
  suggestedLevel: AthleteLevel;
  mlssPerKg:      number;   // for level display
  phenotype:      Phenotype;
  vo2maxMlKgMin?: number;   // ml/kg/min → FuelSense continuous GE model
  // ftp retained for profiler display only — not forwarded to FuelSense
  ftpWattsProfilerOnly: number;
}

// ── Stored DB records ─────────────────────────────────────────────

export interface SavedInscydResult {
  id:        string;
  userId:    string;
  createdAt: Date;
  inputs:    InscydInputs;
  result:    InscydResult;
}

export interface SavedFuelingResult {
  id:              string;
  userId:          string;
  inscydResultId?: string;
  createdAt:       Date;
  inputs:          FuelingInputs;
  result:          FuelingResult;
}
