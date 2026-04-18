/**
 * fuelingStrategy.ts
 * ──────────────────
 * Pure types and utilities for the fueling strategy planner.
 * Display / planning layer only — no impact on substrate model or engine equations.
 * All functions are pure and safe to import in client components.
 */

/** Shared carbohydrate ratio type used across all fuel sources (gels, drinks, solids). */
export type CarbRatio = 'Glucose' | '2:1' | '1:1' | '1:0.8' | 'Unknown';
/** @deprecated Use CarbRatio */
export type GelRatio = CarbRatio;

/** Shared ratio options — single source of truth for all fuel source dropdowns. */
export const RATIO_OPTIONS: { value: CarbRatio; label: string }[] = [
  { value: 'Glucose', label: 'Glucose only' },
  { value: '2:1',     label: '2:1 (maltodextrin : fructose)' },
  { value: '1:1',     label: '1:1 (maltodextrin : fructose)' },
  { value: '1:0.8',   label: '1:0.8 (maltodextrin : fructose)' },
  { value: 'Unknown', label: 'Unknown' },
];
/** @deprecated Use RATIO_OPTIONS */
export const GEL_RATIO_OPTIONS = RATIO_OPTIONS;

/**
 * Frequency options for gels and solid food (minutes).
 * Both share the same options since solid food can be taken as frequently as a gel.
 */
export const GEL_SOLID_FREQ_OPTIONS = [10, 15, 20, 30, 45, 60] as const;
export type GelSolidFreqOption = typeof GEL_SOLID_FREQ_OPTIONS[number];

/** Frequency options for sports drinks (minutes). Shorter intervals for fluid pacing. */
export const DRINK_FREQ_OPTIONS = [10, 15, 20, 30] as const;
export type DrinkFreqOption = typeof DRINK_FREQ_OPTIONS[number];

export interface GelItem {
  id:          string;
  carbsPerGel: number;             // g per gel
  ratio:       CarbRatio;
  freqMin:     GelSolidFreqOption; // one gel every N minutes
}

export interface DrinkItem {
  id:       string;
  volumeMl: number;           // ml per serving
  concGL:   number;           // g carbs per litre
  freqMin:  DrinkFreqOption;  // one serving every N minutes
  ratio?:   CarbRatio;        // display/context only — not used in calculations
}

export interface SolidItem {
  id:       string;
  name:     string;               // e.g. 'Banana', 'Rice cake'
  carbsPer: number;               // g carbs per serving
  freqMin:  GelSolidFreqOption;   // one serving every N minutes
  ratio?:   CarbRatio;            // display/context only — not used in calculations
}

export interface FuelingStrategy {
  gels:   GelItem[];
  drinks: DrinkItem[];
  solids: SolidItem[];
}

// ── Fluid thresholds (ml/h) ───────────────────────────────────────────────────

export const FLUID_LOW_ML_H  = 600;
export const FLUID_HIGH_ML_H = 1000;

// ── Pure arithmetic helpers ───────────────────────────────────────────────────

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
function lcm(a: number, b: number): number {
  return (a * b) / gcd(a, b);
}

/** Carbs per drink serving from volume + concentration. */
export function drinkCarbsPerServing(volumeMl: number, concGL: number): number {
  return (volumeMl * concGL) / 1000;
}

// ── Timeline generation (with solid-over-gel collision rule) ──────────────────

/** A discrete intake event on the timeline. */
export interface TimelinePoint {
  minute: number;
  type:   'gel' | 'drink' | 'solid';
  name:   string;
  carbsG: number;
}

/**
 * Generate a sorted list of intake events from strategy start to durationMin.
 *
 * Collision rule: when a gel event and a solid food event fall on the same
 * minute, the solid food replaces the gel. Drinks are never displaced.
 */
export function generateTimeline(strategy: FuelingStrategy, durationMin: number): TimelinePoint[] {
  const points: TimelinePoint[] = [];

  // Build set of solid minutes for collision detection
  const solidMinutes = new Set<number>();
  for (const s of strategy.solids) {
    if (s.freqMin <= 0) continue;
    for (let t = s.freqMin; t <= durationMin; t += s.freqMin) {
      solidMinutes.add(t);
    }
  }

  // Gels — skip minutes occupied by solid food
  for (const g of strategy.gels) {
    if (g.freqMin <= 0) continue;
    for (let t = g.freqMin; t <= durationMin; t += g.freqMin) {
      if (!solidMinutes.has(t)) {
        points.push({ minute: t, type: 'gel', name: `Gel (${g.ratio})`, carbsG: g.carbsPerGel });
      }
    }
  }

  // Drinks — no displacement rule
  for (const d of strategy.drinks) {
    if (d.freqMin <= 0) continue;
    const carbsG = Math.round(drinkCarbsPerServing(d.volumeMl, d.concGL));
    for (let t = d.freqMin; t <= durationMin; t += d.freqMin) {
      points.push({ minute: t, type: 'drink', name: 'Drink', carbsG });
    }
  }

  // Solids — always included
  for (const s of strategy.solids) {
    if (s.freqMin <= 0) continue;
    for (let t = s.freqMin; t <= durationMin; t += s.freqMin) {
      points.push({ minute: t, type: 'solid', name: s.name, carbsG: s.carbsPer });
    }
  }

  return points.sort((a, b) => a.minute - b.minute || a.type.localeCompare(b.type));
}

// ── CHO and fluid rate calculations ──────────────────────────────────────────

/**
 * Calculate actual planned CHO g/h from a strategy.
 * Uses the LCM of all item frequencies as a representative cycle window,
 * so the solid-over-gel collision rule is reflected in the total.
 */
export function strategyToChoPerHour(strategy: FuelingStrategy): number {
  const allFreqs = [
    ...strategy.gels.filter(g => g.freqMin > 0).map(g => g.freqMin),
    ...strategy.drinks.filter(d => d.freqMin > 0).map(d => d.freqMin),
    ...strategy.solids.filter(s => s.freqMin > 0).map(s => s.freqMin),
  ];
  if (allFreqs.length === 0) return 0;

  const windowMin = allFreqs.reduce(lcm, 1);
  const points    = generateTimeline(strategy, windowMin);
  const totalCarbs = points.reduce((sum, p) => sum + p.carbsG, 0);
  return Math.round((totalCarbs / windowMin) * 60);
}

/**
 * Collision-aware per-source CHO breakdown (g/h).
 *
 * Uses the same LCM-window + timeline approach as strategyToChoPerHour so that
 * source contributions are computed from the resolved event list — gels that are
 * replaced by solid food events are excluded from the gel total.
 *
 * The three values sum to the same result as strategyToChoPerHour (within 1 g/h
 * rounding), so they can be used for consistent display everywhere.
 */
export function strategyToSourceBreakdown(strategy: FuelingStrategy): {
  gels:   number;
  drinks: number;
  solids: number;
} {
  const allFreqs = [
    ...strategy.gels.filter(g => g.freqMin > 0).map(g => g.freqMin),
    ...strategy.drinks.filter(d => d.freqMin > 0).map(d => d.freqMin),
    ...strategy.solids.filter(s => s.freqMin > 0).map(s => s.freqMin),
  ];
  if (allFreqs.length === 0) return { gels: 0, drinks: 0, solids: 0 };

  const windowMin = allFreqs.reduce(lcm, 1);
  const points    = generateTimeline(strategy, windowMin);
  const factor    = 60 / windowMin;

  return {
    gels:   Math.round(points.filter(p => p.type === 'gel').reduce((s, p)   => s + p.carbsG, 0) * factor),
    drinks: Math.round(points.filter(p => p.type === 'drink').reduce((s, p) => s + p.carbsG, 0) * factor),
    solids: Math.round(points.filter(p => p.type === 'solid').reduce((s, p) => s + p.carbsG, 0) * factor),
  };
}

/** Calculate total fluid intake ml/h from sports drink items. */
export function strategyToFluidMlPerHour(strategy: FuelingStrategy): number {
  let total = 0;
  for (const d of strategy.drinks) {
    if (d.freqMin > 0) total += (d.volumeMl / d.freqMin) * 60;
  }
  return Math.round(total);
}

// ── Fuel source config (submitted from left panel) ───────────────────────────

/**
 * Left-panel config — only records which sources the user has enabled.
 * All item parameters (carbs, ratio, volume, etc.) are managed in the main panel
 * via the FuelingStrategy items directly.
 */
export interface FuelSourceConfig {
  gels:   { enabled: boolean };
  drinks: { enabled: boolean };
  solids: { enabled: boolean };
}

// Hardcoded defaults used when seeding the initial strategy from the config.
// These become editable in the main panel after plan generation.
const STRATEGY_DEFAULTS = {
  gel:   { carbsPerGel: 25, ratio: '2:1' as CarbRatio, freqMin: 30 as GelSolidFreqOption },
  drink: { volumeMl: 100,   concGL: 60,                freqMin: 10 as DrinkFreqOption,    ratio: '2:1' as CarbRatio },
  solid: { name: 'Banana',  carbsPer: 25,              freqMin: 60 as GelSolidFreqOption, ratio: 'Unknown' as CarbRatio },
};

/**
 * Default fuel source config based on event duration.
 * Solids are enabled for long events (>4h) only; gels and drinks always enabled.
 */
export function defaultConfigForEventType(eventType: string): FuelSourceConfig {
  return {
    gels:   { enabled: true },
    drinks: { enabled: true },
    solids: { enabled: eventType.includes('>4h') },
  };
}

/**
 * Generate an initial strategy with a fixed hydration + solid baseline,
 * then search gel frequencies to best fit the recommended target.
 *
 * Generation order:
 *   1. Drinks — always at the default baseline (100 ml/10 min → 600 ml/h fluid).
 *   2. Solids — always at the default (Banana, 25 g, every 60 min) when enabled.
 *   3. Gels   — frequency searched across GEL_SOLID_FREQ_OPTIONS to minimise
 *               |planned_total − targetGph|, using the collision-aware timeline
 *               so displaced gel events are not counted toward the total.
 *
 * Tiebreaking (all lower = better):
 *   1. |planned − target|       primary fit
 *   2. event density            fewer interventions per minute is more practical
 *   3. total planned g/h        prefer under-shooting when fits are equal
 *
 * If targetGph is not provided or gels are disabled, default frequencies are used.
 */
export function generateStrategyFromConfig(
  config:     FuelSourceConfig,
  targetGph?: number,
): FuelingStrategy {
  const d = STRATEGY_DEFAULTS;

  // 1. Drinks — fixed at default baseline
  const drinks: DrinkItem[] = config.drinks.enabled
    ? [{ id: 'cfg-drink-1', ...d.drink }]
    : [];

  // 2. Solids — fixed at default (Banana / 27 g / every 60 min)
  const solids: SolidItem[] = config.solids.enabled
    ? [{ id: 'cfg-solid-1', ...d.solid }]
    : [];

  // 3. Gels — search frequencies when a target is known; otherwise use default
  if (!config.gels.enabled) {
    return { gels: [], drinks, solids };
  }

  if (targetGph === undefined) {
    return { gels: [{ id: 'cfg-gel-1', ...d.gel }], drinks, solids };
  }

  let bestGelFreq     = d.gel.freqMin;
  let bestPrimary     = Infinity;
  let bestDensity     = Infinity;
  let bestPlanned     = Infinity;

  for (const freq of GEL_SOLID_FREQ_OPTIONS as readonly GelSolidFreqOption[]) {
    const candidate: FuelingStrategy = {
      gels:   [{ id: 'cfg-gel-1', ...d.gel, freqMin: freq }],
      drinks,
      solids,
    };

    const planned  = strategyToChoPerHour(candidate);
    const primary  = Math.abs(planned - targetGph);

    // Event density from the LCM-window timeline (collision-aware)
    const allFreqs = [freq as number, ...drinks.map(x => x.freqMin), ...solids.map(x => x.freqMin)];
    const window   = allFreqs.reduce(lcm, 1);
    const density  = generateTimeline(candidate, window).length / window;

    const better =
      primary  < bestPrimary  ||
      (primary  === bestPrimary  && density < bestDensity) ||
      (primary  === bestPrimary  && density === bestDensity && planned < bestPlanned);

    if (better) {
      bestGelFreq = freq;
      bestPrimary = primary;
      bestDensity = density;
      bestPlanned = planned;
    }
  }

  return {
    gels:   [{ id: 'cfg-gel-1', ...d.gel, freqMin: bestGelFreq }],
    drinks,
    solids,
  };
}

/** Derive a representative event duration in minutes from the event type string. */
export function eventDurationMin(eventType: string): number {
  if (eventType.includes('<2h')) return 90;
  if (eventType.includes('>4h')) return 300;
  return 180;   // 2–4h bucket default
}
