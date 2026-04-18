/**
 * performanceProfile.ts
 *
 * Athlete classification logic for the "See how I stack up" feature.
 * Pure functions — no side effects, no imports from React or Next.js.
 *
 * Classification hierarchy (shared 7-tier ladder):
 *   Novice/Fair → Moderate/Rec → Good → Very Good → Excellent → Exceptional → World Class
 *
 * Applied to: VO2max, LT2 W/kg, LT2% of VO2max power, LT1% of LT2
 * VLamax uses a separate profile-based scale (not a rank ladder).
 */

// ── Types ────────────────────────────────────────────────────────────

/** Shared 7-tier rank ladder used across VO2max, LT2 W/kg, LT2%, and LT1%. */
export type ClassificationLevel =
  | 'World Class'
  | 'Exceptional'
  | 'Excellent'
  | 'Very Good'
  | 'Good'
  | 'Moderate/Rec'
  | 'Novice/Fair';

/** VLamax profile scale — describes metabolic character, not rank. */
export type VlamaxProfile =
  | 'Endurance Specialist'
  | 'Endurance-oriented'
  | 'Balanced'
  | 'Anaerobic-leaning'
  | 'Sprint-oriented';

// ── VO2max ────────────────────────────────────────────────────────────
//
// Age- and sex-specific thresholds.
// Each row is the lower bound for [Moderate/Rec, Good, Very Good, Excellent, Exceptional, World Class].
// Values below the first threshold → Novice/Fair.

const VO2MAX_LEVELS: ClassificationLevel[] = [
  'Novice/Fair', 'Moderate/Rec', 'Good', 'Very Good', 'Excellent', 'Exceptional', 'World Class',
];

const VO2MAX_THRESHOLDS: Record<'Male' | 'Female', Record<string, number[]>> = {
  Male: {
    '18-29': [37, 43, 51, 58, 65, 73],
    '30-39': [35, 41, 49, 56, 63, 71],
    '40-49': [32, 38, 46, 53, 60, 68],
    '50-59': [29, 35, 43, 50, 57, 65],
    '60+':   [25, 31, 39, 46, 53, 61],
  },
  Female: {
    '18-29': [32, 38, 46, 53, 59, 66],
    '30-39': [30, 36, 44, 51, 57, 64],
    '40-49': [27, 33, 41, 48, 54, 61],
    '50-59': [24, 30, 38, 45, 51, 58],
    '60+':   [21, 27, 35, 42, 48, 55],
  },
};

const VO2MAX_DESCRIPTIONS: Record<ClassificationLevel, string> = {
  'Novice/Fair':   'Below typical endurance sport entry level',
  'Moderate/Rec':  'Active — building a base for endurance sport',
  'Good':          'Club-level competitor with clear aerobic capacity',
  'Very Good':     'Strong club / category racer',
  'Excellent':     'Top of age group — elite amateur standard',
  'Exceptional':   'Professional or national-level standard',
  'World Class':   'Elite / international racing standard',
};

function ageGroup(age: number): string {
  if (age < 30) return '18-29';
  if (age < 40) return '30-39';
  if (age < 50) return '40-49';
  if (age < 60) return '50-59';
  return '60+';
}

export function classifyVO2max(
  vo2max: number,
  age:    number,
  sex:    'Male' | 'Female',
): { level: ClassificationLevel; description: string } {
  const thresholds = VO2MAX_THRESHOLDS[sex][ageGroup(age)];
  let idx = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (vo2max >= thresholds[i]) idx = i + 1;
  }
  const level = VO2MAX_LEVELS[idx];
  return { level, description: VO2MAX_DESCRIPTIONS[level] };
}

// ── LT1% of LT2 ───────────────────────────────────────────────────────
//
// LT1% = LT1 (W) / LT2 (W) × 100
// Represents how much of threshold power is supported by aerobic base.
//
// Lower bounds: [Moderate/Rec, Good, Very Good, Excellent, Exceptional, World Class]
//   60% → Moderate/Rec (health/recreational baseline)
//   64% → Good
//   68% → Very Good
//   72% → Excellent
//   76% → Exceptional
//   80% → World Class

const LT1_DESCRIPTIONS: Record<ClassificationLevel, string> = {
  'Novice/Fair':  'Aerobic base is underdeveloped relative to threshold — Zone 1–2 volume is the priority',
  'Moderate/Rec': 'Aerobic base is building — more low-intensity volume will help',
  'Good':         'Solid aerobic base supporting your threshold',
  'Very Good':    'Well-developed aerobic base relative to threshold',
  'Excellent':    'Strong aerobic base — a clear endurance strength',
  'Exceptional':  'Highly developed aerobic base relative to threshold',
  'World Class':  'Exceptional aerobic base — elite endurance characteristic',
};

export function classifyLT1Fraction(
  lt1: number,
  lt2: number,
): { pct: number; level: ClassificationLevel; description: string } {
  const pct = Math.round((lt1 / lt2) * 100);
  let level: ClassificationLevel;
  if (pct < 60)      level = 'Novice/Fair';
  else if (pct < 64) level = 'Moderate/Rec';
  else if (pct < 68) level = 'Good';
  else if (pct < 72) level = 'Very Good';
  else if (pct < 76) level = 'Excellent';
  else if (pct < 80) level = 'Exceptional';
  else               level = 'World Class';
  return { pct, level, description: LT1_DESCRIPTIONS[level] };
}

// ── LT2% of VO2max power ─────────────────────────────────────────────
//
// LT2% = LT2 (W) / PPO (W) × 100
// Represents threshold durability — how much of aerobic ceiling is usable at threshold.
//
// Lower bounds: [Moderate/Rec, Good, Very Good, Excellent, Exceptional, World Class]
//   65% → Moderate/Rec
//   70% → Good
//   75% → Very Good
//   80% → Excellent
//   86% → Exceptional
//   92% → World Class

const LT2_DESCRIPTIONS: Record<ClassificationLevel, string> = {
  'Novice/Fair':  'Threshold sits well below aerobic ceiling — large gains available',
  'Moderate/Rec': 'Below-average threshold durability for your aerobic capacity',
  'Good':         'Solid threshold relative to aerobic capacity',
  'Very Good':    'Good threshold durability',
  'Excellent':    'Strong threshold durability — you use your engine well',
  'Exceptional':  'Very high threshold utilisation — elite endurance characteristic',
  'World Class':  'Near-maximal threshold utilisation — exceptional durability',
};

export function classifyLT2Fraction(
  lt2: number,
  ppo: number,
): { pct: number; level: ClassificationLevel; description: string } {
  const pct = Math.round((lt2 / ppo) * 100);
  let level: ClassificationLevel;
  if (pct < 65)      level = 'Novice/Fair';
  else if (pct < 70) level = 'Moderate/Rec';
  else if (pct < 75) level = 'Good';
  else if (pct < 80) level = 'Very Good';
  else if (pct < 86) level = 'Excellent';
  else if (pct < 92) level = 'Exceptional';
  else               level = 'World Class';
  return { pct, level, description: LT2_DESCRIPTIONS[level] };
}

// ── LT2 W/kg ─────────────────────────────────────────────────────────
//
// LT2_wkg = LT2 (W) / body mass (kg)
// Sex-specific lower-bound thresholds; first match (descending) wins.
// Values below the lowest threshold → null (unclassified).

export type LT2WkgLevel = ClassificationLevel;

const LT2_WKG_THRESHOLDS: Record<'Male' | 'Female', Array<[number, ClassificationLevel]>> = {
  Male: [
    [5.83, 'World Class'],
    [5.26, 'Exceptional'],
    [4.69, 'Excellent'],
    [4.12, 'Very Good'],
    [3.55, 'Good'],
    [2.98, 'Moderate/Rec'],
    [1.83, 'Novice/Fair'],
  ],
  Female: [
    [5.01, 'World Class'],
    [4.51, 'Exceptional'],
    [4.01, 'Excellent'],
    [3.50, 'Very Good'],
    [3.00, 'Good'],
    [2.50, 'Moderate/Rec'],
    [0.99, 'Novice/Fair'],
  ],
};

export function classifyLT2Wkg(
  lt2Watts:   number,
  bodyMassKg: number,
  sex:        'Male' | 'Female',
): { wkg: number; level: ClassificationLevel | null } {
  const wkg = lt2Watts / bodyMassKg;
  let level: ClassificationLevel | null = null;
  for (const [threshold, label] of LT2_WKG_THRESHOLDS[sex]) {
    if (wkg >= threshold) { level = label; break; }
  }
  return { wkg, level };
}

// ── VLamax profile ────────────────────────────────────────────────────
//
// Profile-based scale — describes metabolic character, not rank.
// Thresholds (mmol/L/s): < 0.20 / 0.20–0.35 / 0.36–0.55 / 0.56–0.75 / ≥ 0.76

const VLAMAX_DESCRIPTIONS: Record<VlamaxProfile, string> = {
  'Endurance Specialist': 'Minimal glycolytic power — suited to ultra-long, steady efforts',
  'Endurance-oriented':   'Low glycolytic rate — best suited to sustained, aerobic racing',
  'Balanced':             'Balanced aerobic and anaerobic metabolism — versatile racer',
  'Anaerobic-leaning':    'Significant glycolytic power — suits shorter, high-intensity racing',
  'Sprint-oriented':      'High glycolytic capacity — explosive efforts and sprint finishes',
};

export function classifyVlamax(
  vlamax: number,
): { level: VlamaxProfile; description: string } {
  let level: VlamaxProfile;
  if (vlamax < 0.20)      level = 'Endurance Specialist';
  else if (vlamax < 0.36) level = 'Endurance-oriented';
  else if (vlamax < 0.56) level = 'Balanced';
  else if (vlamax < 0.76) level = 'Anaerobic-leaning';
  else                    level = 'Sprint-oriented';
  return { level, description: VLAMAX_DESCRIPTIONS[level] };
}

// ── Summary generation ────────────────────────────────────────────────

export function generateSummary(params: {
  vo2maxLevel:   ClassificationLevel;
  lt1Level:      ClassificationLevel;
  lt2Level:      ClassificationLevel;
  vlamaxProfile: VlamaxProfile;
}): string {
  const { vo2maxLevel, lt1Level, lt2Level, vlamaxProfile } = params;

  const TOP: ClassificationLevel[]  = ['World Class', 'Exceptional', 'Excellent'];
  const MID: ClassificationLevel[]  = ['Very Good', 'Good'];
  const LOW: ClassificationLevel[]  = ['Moderate/Rec', 'Novice/Fair'];

  const engineStrong = TOP.includes(vo2maxLevel);
  const engineMid    = MID.includes(vo2maxLevel);
  const engineWeak   = LOW.includes(vo2maxLevel);
  const baseGood     = [...TOP, 'Very Good'].includes(lt1Level as ClassificationLevel);
  const basePoor     = LOW.includes(lt1Level);
  const threshGood   = [...TOP, 'Very Good'].includes(lt2Level as ClassificationLevel);
  const threshPoor   = LOW.includes(lt2Level);
  const glycHigh     = ['Anaerobic-leaning', 'Sprint-oriented'].includes(vlamaxProfile);
  const glycLow      = ['Endurance Specialist', 'Endurance-oriented'].includes(vlamaxProfile);

  if (engineStrong && baseGood && threshGood) {
    return glycHigh
      ? 'Your engine, aerobic base, and threshold are all strong. Managing anaerobic load in training — keeping VLamax from climbing further — is the key lever for sustained performance.'
      : 'You have an excellent all-round physiological profile. Race-specificity, pacing discipline, and recovery quality are the primary differentiators at your level.';
  }

  if (engineStrong && basePoor) {
    return "You have a large aerobic engine, but your aerobic base hasn't kept pace with it. Prioritising Zone 1–2 volume will improve fatigue resistance and raise your LT1.";
  }

  if (engineStrong && threshPoor) {
    return 'Your aerobic capacity is strong, but threshold durability is the limiting factor. Structured threshold and tempo work targeting LT2 will have the biggest near-term impact on performance.';
  }

  if ((engineStrong || engineMid) && baseGood && threshGood) {
    return 'Your aerobic base and threshold efficiency are well-developed. Continuing to raise your VO2max ceiling through targeted high-intensity work will scale all your benchmarks upward.';
  }

  if (engineWeak && basePoor && threshPoor) {
    return 'Building your aerobic base is the clearest path forward. A structured endurance phase emphasising Zones 1–3 will lift both your LT1 and LT2 over time.';
  }

  if (glycHigh && threshPoor) {
    return 'High anaerobic activity is suppressing your threshold. Reducing high-intensity training volume and spending more time at aerobic base intensity will improve your LT2 and metabolic efficiency.';
  }

  if (glycLow && basePoor) {
    return 'You have a low glycolytic profile, which supports endurance, but your aerobic base needs development. More consistent Zone 2 volume will build the foundation you need.';
  }

  // Fallback: name the top strength and top opportunity
  const strengths: string[]     = [];
  const opportunities: string[] = [];
  if (engineStrong)  strengths.push('aerobic engine');
  if (baseGood)      strengths.push('aerobic base');
  if (threshGood)    strengths.push('threshold durability');
  if (engineWeak)    opportunities.push('aerobic capacity (VO2max)');
  if (basePoor)      opportunities.push('aerobic base (LT1)');
  if (threshPoor)    opportunities.push('threshold durability (LT2)');

  if (strengths.length > 0 && opportunities.length > 0) {
    return `Your ${strengths[0]} is a clear strength. Targeting your ${opportunities[0]} represents the biggest near-term performance opportunity.`;
  }

  return 'Your metabolic profile is balanced. Consistent training across all zones will continue to develop your capacity.';
}
