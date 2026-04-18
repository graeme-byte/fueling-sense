/**
 * athleteBenchmarks.ts
 * ────────────────────
 * DISPLAY LAYER ONLY — static reference bands for the
 * "See How I Stack Up" comparison section.
 *
 * These functions must NEVER be called from any engine calculation.
 * They return label/colour data only and have no side-effects on model outputs.
 *
 * Reference tables: sex-specific bands for sprint power (W/kg) and VLamax
 * (mmol/L/s) based on published norms for trained endurance/cycling athletes.
 * Bands are intentionally overlapping; a value matching multiple bands is
 * assigned the highest-level category it reaches.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type BandSex = 'Male' | 'Female';

export type AthleteBandCategory =
  | 'Health & Fitness'
  | 'Recreational'
  | 'Developmental'
  | 'Competitive'
  | 'Top AG'
  | 'PRO';

export interface ClassificationResult {
  category: AthleteBandCategory;
  color:    string;   // Tailwind badge classes
}

export interface VlamaxClassification extends ClassificationResult {
  /** Neutral tendency label — e.g. "Moderate glycolytic profile". Independent of sex. */
  tendencyLabel: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

interface BandRange {
  category: AthleteBandCategory;
  low:      number;
  high:     number;
}

/** Ordered from lowest to highest level — used to pick the best match. */
const CATEGORY_ORDER: AthleteBandCategory[] = [
  'Health & Fitness',
  'Recreational',
  'Developmental',
  'Competitive',
  'Top AG',
  'PRO',
];

const CATEGORY_COLORS: Record<AthleteBandCategory, string> = {
  'Health & Fitness': 'text-gray-600   bg-gray-50   border-gray-200',
  'Recreational':     'text-sky-700    bg-sky-50    border-sky-200',
  'Developmental':    'text-blue-700   bg-blue-50   border-blue-200',
  'Competitive':      'text-green-700  bg-green-50  border-green-200',
  'Top AG':           'text-amber-700  bg-amber-50  border-amber-200',
  'PRO':              'text-violet-700 bg-violet-50 border-violet-200',
};

/**
 * Given a numeric value and an ordered set of overlapping bands, returns the
 * highest-level category the value falls within.
 *
 * If below all bands → lowest category.
 * If above all bands → highest category.
 */
function classifyInBands(value: number, bands: BandRange[]): ClassificationResult {
  const matching = bands.filter(b => value >= b.low && value <= b.high);

  let category: AthleteBandCategory;
  if (matching.length === 0) {
    category = value < bands[0].low
      ? bands[0].category
      : bands[bands.length - 1].category;
  } else {
    category = matching.reduce((best, curr) =>
      CATEGORY_ORDER.indexOf(curr.category) > CATEGORY_ORDER.indexOf(best.category) ? curr : best,
    ).category;
  }

  return { category, color: CATEGORY_COLORS[category] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reference tables — static, deterministic, display-only
// ─────────────────────────────────────────────────────────────────────────────

const SPRINT_WKG_BANDS: Record<BandSex, BandRange[]> = {
  Male: [
    { category: 'Health & Fitness', low: 5.0,  high: 8.0  },
    { category: 'Recreational',     low: 7.0,  high: 10.0 },
    { category: 'Developmental',    low: 8.0,  high: 11.0 },
    { category: 'Competitive',      low: 9.0,  high: 12.0 },
    { category: 'Top AG',           low: 11.0, high: 14.0 },
    { category: 'PRO',              low: 13.0, high: 17.0 },
  ],
  Female: [
    { category: 'Health & Fitness', low: 4.5,  high: 7.0  },
    { category: 'Recreational',     low: 6.0,  high: 9.0  },
    { category: 'Developmental',    low: 7.0,  high: 10.0 },
    { category: 'Competitive',      low: 8.0,  high: 11.0 },
    { category: 'Top AG',           low: 9.5,  high: 12.5 },
    { category: 'PRO',              low: 11.0, high: 15.0 },
  ],
};

const VLAMAX_BANDS: Record<BandSex, BandRange[]> = {
  Male: [
    { category: 'Health & Fitness', low: 0.20, high: 0.40 },
    { category: 'Recreational',     low: 0.30, high: 0.60 },
    { category: 'Developmental',    low: 0.40, high: 0.80 },
    { category: 'Competitive',      low: 0.50, high: 0.90 },
    { category: 'Top AG',           low: 0.70, high: 1.20 },
    { category: 'PRO',              low: 1.00, high: 1.50 },
  ],
  Female: [
    { category: 'Health & Fitness', low: 0.18, high: 0.38 },
    { category: 'Recreational',     low: 0.28, high: 0.55 },
    { category: 'Developmental',    low: 0.38, high: 0.75 },
    { category: 'Competitive',      low: 0.45, high: 0.85 },
    { category: 'Top AG',           low: 0.65, high: 1.10 },
    { category: 'PRO',              low: 0.90, high: 1.40 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Public classification helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify 20s sprint power (W/kg) against sex-specific reference bands.
 * Falls back to Male bands when sex is absent.
 */
export function classifySprintWkg(
  wkg: number,
  sex?: 'Male' | 'Female',
): ClassificationResult {
  return classifyInBands(wkg, SPRINT_WKG_BANDS[sex ?? 'Male']);
}

/**
 * Classify VLamax (mmol/L/s) against sex-specific reference bands.
 * Also returns a neutral tendency label derived from the raw value (sex-independent).
 * Falls back to Male bands when sex is absent.
 */
export function classifyVlamax(
  vlamax: number,
  sex?: 'Male' | 'Female',
): VlamaxClassification {
  const base = classifyInBands(vlamax, VLAMAX_BANDS[sex ?? 'Male']);

  let tendencyLabel: string;
  if      (vlamax < 0.20) tendencyLabel = 'Very low glycolytic power';
  else if (vlamax < 0.35) tendencyLabel = 'Low glycolytic profile';
  else if (vlamax < 0.55) tendencyLabel = 'Moderate glycolytic profile';
  else if (vlamax < 0.80) tendencyLabel = 'High glycolytic profile';
  else                    tendencyLabel = 'Very high glycolytic power';

  return { ...base, tendencyLabel };
}

/**
 * Classify VO2max (ml/kg/min) against sex-specific reference bands.
 * Female thresholds are shifted ~5 ml/kg/min lower (published cycling norms).
 * Falls back to Male bands when sex is absent.
 */
export function classifyVO2max(
  vo2max: number,
  sex?: 'Male' | 'Female',
): ClassificationResult {
  // VO2max bands do not use the same category structure as sprint/VLamax,
  // so they are defined inline here using simpler threshold ranges.
  const isFemale = sex === 'Female';
  const bands: BandRange[] = isFemale
    ? [
        { category: 'Health & Fitness', low: 0,  high: 30 },
        { category: 'Recreational',     low: 30, high: 40 },
        { category: 'Developmental',    low: 35, high: 46 },
        { category: 'Competitive',      low: 40, high: 56 },
        { category: 'Top AG',           low: 50, high: 63 },
        { category: 'PRO',              low: 60, high: 999 },
      ]
    : [
        { category: 'Health & Fitness', low: 0,  high: 35 },
        { category: 'Recreational',     low: 35, high: 45 },
        { category: 'Developmental',    low: 40, high: 52 },
        { category: 'Competitive',      low: 45, high: 62 },
        { category: 'Top AG',           low: 55, high: 70 },
        { category: 'PRO',              low: 65, high: 999 },
      ];
  return classifyInBands(vo2max, bands);
}

/**
 * Classify LT2 W/kg — sex-neutral broad bands.
 */
export function classifyLT2Wkg(wkg: number): ClassificationResult {
  const bands: BandRange[] = [
    { category: 'Health & Fitness', low: 0,   high: 2.5 },
    { category: 'Recreational',     low: 2.1, high: 3.3 },
    { category: 'Developmental',    low: 2.7, high: 3.7 },
    { category: 'Competitive',      low: 3.3, high: 4.2 },
    { category: 'Top AG',           low: 3.8, high: 4.8 },
    { category: 'PRO',              low: 4.0, high: 999 },
  ];
  return classifyInBands(wkg, bands);
}
