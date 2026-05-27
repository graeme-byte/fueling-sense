/**
 * runningTypes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TypeScript contracts for the running metabolic engine.
 *
 * SOURCE OF TRUTH: running_metabolic_model_spec_v2_app_safe.md
 *
 * These types are RUNNING-SPECIFIC. Do not import from or merge with bike types.
 * The running engine (runningMetabolicEngine.ts) uses only these types.
 */

// ── Enumerations ──────────────────────────────────────────────────────────────

export type RunningEventType =
  | 'Running 5K'
  | 'Running 10K'
  | 'Half Marathon'
  | 'Marathon'
  | 'Ultra (>4h)';

// ── Confidence flags ──────────────────────────────────────────────────────────

export interface RunningConfidenceFlag {
  level: 'info' | 'warn' | 'error';
  message: string;
}

// ── Profiler zone (bike-aligned — no substrate columns) ───────────────────────
//
// Produced by buildRunningProfilerZones() in runningZones.ts.
// Used by RunningZonesTable (profiler view only).
// Zone names, colours, and tooltip definitions are shared with the bike profiler
// via lib/zones/zoneDefinitions.ts.

export interface RunningProfilerZone {
  name:      string;  // 'Zone 1', 'Zone 3A', etc.
  label:     string;  // 'Recovery', 'Base Endurance', etc.
  paceRange: string;  // display e.g. '5:44/km – 4:47/km' (slow → fast)
  speedLow:  number;  // m/s — easier boundary
  speedHigh: number;  // m/s — harder boundary
}

// ── Fueling zone (substrate-rich — used on fueling page) ─────────────────────

export interface RunningZone {
  name: string;
  code: string;
  speed_lo: number;     // m/s
  speed_hi: number;     // m/s
  speed_target: number; // m/s
  pace_lo: string;      // min:ss/km — slower bound (lower speed = slower pace)
  pace_hi: string;      // min:ss/km — faster bound
  pace_target: string;
  fat_g_h: number;
  cho_g_h: number;
  kcal_h: number;
  pct_fat: number;
  pct_cho: number;
}

// ── Substrate curve point ─────────────────────────────────────────────────────

export interface RunningSubstratePoint {
  speed: number;     // m/s
  pace: string;      // min:ss/km
  fat_g_h: number;
  cho_g_h: number;
  total_kcal_h: number;
}

// ── Primary profile output ────────────────────────────────────────────────────

export interface RunningMetabolicProfile {
  inputs: {
    sprintDistanceM: number;
    sprintTimeS: number;        // actual sprint duration used for S20 derivation
    threeMinDistanceM: number;
    sixMinDistanceM: number;
    massKg: number;
    bodyFatPct: number;
  };

  speeds: {
    s20: number;   // m/s — sprint speed
    s180: number;  // m/s — 3-minute speed
    s360: number;  // m/s — 6-minute speed
  };

  bodyComposition: {
    massKg: number;
    bodyFatPct: number;
    fatFreeMassKg: number;
  };

  primary: {
    vo2maxMlKgMin: number;
    vo2maxAbsMlMin: number;
    vlamaxMmolLS: number;
    mlssSpeedMs: number;
    mlssPace: string;
    lt1SpeedMs: number;
    lt1Pace: string;
    fatmaxSpeedMs: number;
    fatmaxPace: string;
    mfoGH: number;
    mfoKcalH: number;
    carb90SpeedMs: number;
    carb90Pace: string;
  };

  derived: {
    lt1Fraction: number;
    fatmaxFraction: number;
    pctVO2AtMLSS: number;
    glycogenGKgFFM: number;
    glycogenTotalG: number;
    aerobicGlycolyticRatio: number;
    vVO2maxSpeedMs: number;
    vVO2maxPace: string;
  };

  zones: RunningZone[];

  substrateCurve: RunningSubstratePoint[];

  classification: {
    type: string;
    description: string;
  };

  confidenceFlags: RunningConfidenceFlag[];
}

// ── Running fueling inputs ────────────────────────────────────────────────────

// Mirrors cycling DietType string values; kept as a local literal so the
// running types remain independent of lib/types/index.ts.
export type RunningDietType = 'Standard' | 'Keto';

export interface RunningFuelingInputs {
  // Athlete context
  name?: string;
  sex: 'Male' | 'Female';
  age?: number;
  massKg: number;
  bodyFatPct: number;

  // Metabolic anchors from running profiler
  mlssSpeedMs: number;
  lt1SpeedMs: number;
  vlamaxMmolLS: number;
  vo2maxMlKgMin: number;

  // Diet / fat-adaptation context.
  // SUBSTRATE NUMBERS ARE NOT MODIFIED BY DIET TYPE in the current implementation.
  // dietType affects advice text only. See spec §18.1 for the criteria required
  // before running-specific substrate fat-adaptation coefficients can be added.
  dietType: RunningDietType;

  // Event context
  eventType: RunningEventType;

  // vVO2max — 6-minute test speed, passed from profiler for display calculations
  vVO2maxSpeedMs?: number;

  // Target
  targetSpeedMs: number;  // m/s — target race/training pace
  targetCHO: number;      // g/h — planned CHO intake
}

// ── Carbohydrate ratio type (running-specific, mirrors cycling CarbRatio) ─────
export type RunCarbRatio = 'Glucose' | '2:1' | '1:1' | '1:0.8' | 'Unknown';

export const RUN_RATIO_OPTIONS: { value: RunCarbRatio; label: string }[] = [
  { value: 'Glucose', label: 'Glucose only'                },
  { value: '2:1',     label: '2:1 (maltodextrin : fructose)' },
  { value: '1:1',     label: '1:1 (glucose : fructose)'   },
  { value: '1:0.8',   label: '1:0.8 (glucose : fructose)' },
  { value: 'Unknown', label: 'Unknown / mixed'             },
];

// ── Running fuel source configuration ────────────────────────────────────────
// Managed in RunningFuelingPage and passed to both sidebar form and central panel.
export interface RunFuelConfig {
  gelsOn:    boolean;
  drinksOn:  boolean;
  solidsOn:  boolean;
  gelCarbs:  number;          // g per gel
  gelFreq:   number;          // minutes between gels
  gelRatio?: RunCarbRatio;    // glucose:fructose ratio for gels
  drinkVol:  number;          // ml per serving
  drinkConc: number;          // g/L concentration
  drinkFreq: number;          // minutes between drinks
  drinkRatio?: RunCarbRatio;  // glucose:fructose ratio for drinks
  solidCarbs: number;         // g per serving
  solidFreq:  number;         // minutes between solid servings
  solidRatio?: RunCarbRatio;  // glucose:fructose ratio for solids
}

// ── Running fueling result ────────────────────────────────────────────────────

export type FuelingAlignmentLabel =
  | 'Below LT1'
  | 'LT1–MLSS'
  | 'At MLSS'
  | 'Above MLSS';

export type StrategySeverity = 'green' | 'amber' | 'red';

export interface RunningFuelingResult {
  target: {
    speedMs: number;
    pace: string;
    pctMLSS: number;
    choGHour: number;
    fatGHour: number;
    kcalHour: number;
    alignment: FuelingAlignmentLabel;
    // v2.5 economy fields
    economyMlKgKm: number;       // speed-adjusted running economy used for this calculation
    baseEconomyMlKgKm: number;   // VO2max-derived base economy before speed adjustment
    vo2CostMlKgMin: number;      // VO2 demand at target pace (mL/kg/min)
  };

  substrateCurve: RunningSubstratePoint[];

  // FATmax & MFO — for summary cards
  fatmaxSpeedMs: number;
  fatmaxPace: string;
  mfoGH: number;
  mfoKcalH: number;

  advice: {
    strategy: {
      label: string;
      alignment: FuelingAlignmentLabel;
      severity: StrategySeverity;
      detail: string;
    };
    carbRequirement: {
      requiredGH:    number;   // raw modeled CHO oxidation (g/h) — display only
      recommendedGH: number;   // practical capped intake target — used for gap/level
      severity: StrategySeverity;
      label: string;
      detail: string;
    };
    gapAnalysis: {
      planned:   number;
      required:  number;   // raw CHO oxidation (= requiredGH above, kept for compat)
      recommended: number; // practical intake target (= recommendedGH above)
      gap:       number;   // planned − recommended (NOT planned − rawRequired)
      direction: 'under' | 'over' | 'aligned';
      detail:    string;
    };
  };

  carb90: {
    found: boolean;
    speedMs: number | null;
    pace: string | null;
  };

  zones: RunningZone[];
  dietNote?: string;
}
