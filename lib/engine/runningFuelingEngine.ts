/**
 * runningFuelingEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Running fueling engine — substrate, CHO requirements, and fueling advice
 * for a target running pace.
 *
 * SOURCE OF TRUTH: running_metabolic_model_spec_v2_app_safe.md
 *
 * ISOLATION: imports only from runningTypes and runningMetabolicEngine.
 * No imports from bike fuelingEngine.ts or any other bike file.
 *
 * dietType handling (see spec §18.1):
 *   SUBSTRATE NUMBERS ARE NOT MODIFIED BY dietType in the current implementation.
 *   dietType affects advice text and the dietNote field only.
 *   Running-specific fat-adapted substrate coefficients require a calibration
 *   dataset before any numerical effect can be added.
 */

import type {
  RunningFuelingInputs,
  RunningFuelingResult,
  RunningDietType,
  FuelingAlignmentLabel,
  StrategySeverity,
} from './runningTypes';
import {
  substrateAtSpeed,
  detectCARB90,
  buildRunningSubstrateCurve,
  calculateFATmax,
  calculateMFO,
  formatPace,
  estimateBaseRunningEconomy,
  adjustEconomyForSpeed,
  type SubstrateAnchors,
} from './runningMetabolicEngine';
import { buildRunningZones } from './runningZones';
import type { RunningEventType } from './runningTypes';

// ── Duration bucket — mirrors cycling's durationBucket() for running events ───

function runningDurationBucket(eventType: RunningEventType): 'short' | 'medium' | 'long' {
  if (eventType === 'Marathon')     return 'medium';
  if (eventType === 'Ultra (>4h)')  return 'long';
  return 'short';  // 5K, 10K, Half Marathon
}

// ── Practical intake target — converts raw CHO oxidation to exogenous cap ─────
//
// Raw CHO oxidation at race pace can reach 120–150 g/h for heavier or faster
// runners. This is physiologically accurate as an oxidation rate but not a
// practical intake prescription — stored glycogen and blood glucose bridge the
// gap. This function applies event-type-specific caps matching real-world gut
// absorption limits and carriage constraints in running.
//
// SHORT (5K, 10K, Half Marathon — ≤ ~2h):
//   Blood-glucose maintenance focus; glycogen stores bridge the remainder.
//   Hard cap: 60 g/h regardless of modeled demand.
//
// MEDIUM (Marathon — ~3–4h):
//   Glycogen depletion risk real; partial gap closure important.
//   Hard cap: 80 g/h.
//
// LONG (Ultra — > 4h):
//   Sustained effort with solid food option; highest tolerance.
//   Precision curve; hard cap: 100 g/h.
//
// This function is recommendation-layer logic only — no substrate values change.
export function computeRunningRecommendedTarget(
  required:  number,
  eventType: RunningEventType,
): number {
  const bucket = runningDurationBucket(eventType);

  if (bucket === 'short') {
    if (required <= 30) return 30;
    if (required <= 60) return Math.round(required);
    return 60;
  }

  if (bucket === 'medium') {
    if (required <= 60)  return Math.round(required);
    if (required <= 100) return Math.round(60 + 0.5 * (required - 60));
    return 80;
  }

  // LONG — precision curve with 100 g/h ceiling
  let target: number;
  if      (required <= 60)  target = required;
  else if (required <= 90)  target = 60 + (required - 60) * 0.60;
  else if (required <= 120) target = 78 + (required - 90) * 0.467;
  else if (required <= 140) target = 92 + (required - 120) * 0.400;
  else                      target = 100;
  return Math.round(target);
}

// ── Event duration estimates (used for CHO requirement scaling) ───────────────

const EVENT_DURATION_H: Record<RunningEventType, number> = {
  'Running 5K':     0.25,
  'Running 10K':    0.55,
  'Half Marathon':  1.75,
  'Marathon':       3.25,
  'Ultra (>4h)':    5.00,
};

// ── Alignment logic ───────────────────────────────────────────────────────────

function deriveAlignment(
  targetSpeedMs: number,
  lt1SpeedMs: number,
  mlssSpeedMs: number,
): FuelingAlignmentLabel {
  const pct = targetSpeedMs / mlssSpeedMs;
  if (targetSpeedMs <= lt1SpeedMs) return 'Below LT1';
  if (pct <= 1.00)                 return 'LT1–MLSS';
  if (pct <= 1.03)                 return 'At MLSS';
  return 'Above MLSS';
}

// ── Strategy advice ───────────────────────────────────────────────────────────

function strategyDetail(
  alignment: FuelingAlignmentLabel,
  eventType: RunningEventType,
  dietType: RunningDietType,
): { label: string; severity: StrategySeverity; detail: string } {
  const isDuration = eventType === 'Marathon' || eventType === 'Ultra (>4h)';
  const isFatAdapted = dietType === 'Keto';

  switch (alignment) {
    case 'Below LT1':
      return {
        label:    'Recovery / Easy',
        severity: 'green',
        detail:   isFatAdapted
          ? 'Recovery pace. Fat oxidation dominates. Fat-adapted athletes typically sustain this intensity almost entirely on fat. CHO intake generally unnecessary at this effort.'
          : 'Training or recovery pace. Fat oxidation dominates. CHO intake optional — mainly for palatability and gut training.',
      };
    case 'LT1–MLSS':
      return {
        label:    isDuration ? 'Race Pace' : 'Threshold',
        severity: 'amber',
        detail:   isDuration
          ? (isFatAdapted
              ? 'Sustained race pace. Fat-adapted athletes may show higher fat oxidation than estimated here. CHO requirements may be lower in practice — start conservative and adjust by feel.'
              : 'Sustained race pace. CHO needs rise significantly with duration. Consistent fueling is important.')
          : (isFatAdapted
              ? 'Tempo to threshold range. Fat-adapted athletes often tolerate longer sub-threshold sessions with minimal CHO. Use estimated demand as an upper bound.'
              : 'Tempo to threshold range. Moderate CHO oxidation. Short session: low CHO need. Longer session: plan intake.'),
      };
    case 'At MLSS':
      return {
        label:    'Threshold / Race Effort',
        severity: 'amber',
        detail:   'At or very near maximal lactate steady state. Glycogen is the dominant fuel at this intensity regardless of diet adaptation. Fueling strategy critical for durations >40 min.',
      };
    case 'Above MLSS':
      return {
        label:    'Supramaximal',
        severity: 'red',
        detail:   'Pace exceeds MLSS. Sustainable only for short intervals. Exogenous CHO has limited impact — endogenous glycogen dominates regardless of diet adaptation.',
      };
  }
}

// ── CHO requirement ───────────────────────────────────────────────────────────

function deriveCHORequirement(
  choGHour: number,
  eventType: RunningEventType,
  alignment: FuelingAlignmentLabel,
  dietType: RunningDietType,
): { requiredGH: number; recommendedGH: number; severity: StrategySeverity; label: string; detail: string } {
  const durationH = EVENT_DURATION_H[eventType];
  const required = Math.max(0, choGHour);
  const isFatAdapted = dietType === 'Keto';

  // Advisory suffix appended when fat-adapted — does not change the number
  const fatAdaptedSuffix = isFatAdapted
    ? ' (Fat-adapted: actual demand may be 10–20% lower — substrate numbers reflect standard metabolic economy; see diet note.)'
    : '';

  let severity: StrategySeverity;
  let label: string;
  let detail: string;

  if (alignment === 'Below LT1' || choGHour < 30) {
    severity = 'green';
    label    = 'Low CHO demand';
    detail   = `Fat oxidation covers most of the energy cost. Fueling optional.${fatAdaptedSuffix}`;
  } else if (choGHour < 60) {
    severity = 'green';
    label    = 'Moderate CHO demand';
    detail   = `~${Math.round(required)} g/h. ${durationH >= 1.5 ? 'Important to fuel consistently for this duration.' : 'Manageable with standard sports nutrition.'}${fatAdaptedSuffix}`;
  } else if (choGHour < 90) {
    severity = isFatAdapted ? 'green' : 'amber';
    label    = 'High CHO demand';
    detail   = `~${Math.round(required)} g/h. Consistent fueling required.${isFatAdapted ? ' Fat-adapted athletes may need less — use as upper bound.' : ' Gut training recommended if not already practised.'}`;
  } else {
    severity = isFatAdapted ? 'amber' : 'red';
    label    = 'Very high CHO demand';
    detail   = `~${Math.round(required)} g/h exceeds standard single-source gut tolerance. Multi-carb formulations (2:1 glucose:fructose) recommended.${fatAdaptedSuffix}`;
  }

  const recommendedGH = computeRunningRecommendedTarget(required, eventType);
  return { requiredGH: required, recommendedGH, severity, label, detail };
}

// ── Gap analysis ──────────────────────────────────────────────────────────────
//
// Gap is measured against the PRACTICAL INTAKE TARGET (recommended), not the
// raw modeled CHO oxidation. Raw required is kept in the return value for
// display as "modeled demand" but must not be used as a fueling target.

function deriveGapAnalysis(
  planned:     number,
  rawRequired: number,   // raw CHO oxidation — display only
  recommended: number,   // practical capped intake target — gap baseline
): RunningFuelingResult['advice']['gapAnalysis'] {
  const gap    = planned - recommended;
  const absPct = recommended > 0 ? Math.abs(gap) / recommended : 0;

  let direction: 'under' | 'over' | 'aligned';
  let detail: string;

  if (absPct <= 0.10) {
    direction = 'aligned';
    detail    = `Planned CHO intake is well matched to the practical target of ${Math.round(recommended)} g/h. Adjust based on training response.`;
  } else if (gap < 0) {
    direction = 'under';
    if (planned > 100) {
      // Already very high — never advise increasing past 100 g/h
      detail = `Planned intake is below the practical target but already high. Focus on pacing and metabolic efficiency rather than increasing intake further.`;
    } else {
      detail = `Planned intake is ${Math.abs(Math.round(gap))} g/h below the practical target of ${Math.round(recommended)} g/h. Build toward this progressively with gut training.`;
    }
  } else {
    direction = 'over';
    detail    = `Planned intake is ${Math.round(gap)} g/h above the practical target. Ensure this level has been tested in training — GI tolerance under race stress varies.`;
  }

  return {
    planned,
    required:    rawRequired,   // alias to raw for backward compat
    recommended,
    gap,
    direction,
    detail,
  };
}

// ── Diet note (fat-adapted advisory, advice-only) ─────────────────────────────

function buildDietNote(dietType: RunningDietType): string | undefined {
  if (dietType !== 'Keto') return undefined;

  return [
    'Fat-adapted diet selected.',
    'Substrate numbers (fat g/h, CHO g/h, CARB90) are calculated using the standard running metabolic model.',
    'Running-specific fat-adapted substrate coefficients have not yet been validated.',
    'Fat-adapted athletes typically show 10–20% higher fat oxidation at sub-threshold paces and may require less exogenous CHO than estimated.',
    'Use these outputs as an upper bound for CHO requirements and adjust based on individual training response.',
    'Substrate-level diet effects will be added once a running-specific calibration dataset is available (see spec §18.1).',
  ].join(' ');
}


// ── Master fueling calculation ────────────────────────────────────────────────

export function calculateRunningFueling(inputs: RunningFuelingInputs): RunningFuelingResult {
  const {
    massKg,
    mlssSpeedMs,
    lt1SpeedMs,
    vlamaxMmolLS,
    vo2maxMlKgMin,
    dietType,
    eventType,
    targetSpeedMs,
    targetCHO,
  } = inputs;

  // v2.5: running economy — VO2max-individualised, speed-adjusted
  const baseEconomy   = estimateBaseRunningEconomy(vo2maxMlKgMin);
  const targetEconomy = adjustEconomyForSpeed(baseEconomy, targetSpeedMs, mlssSpeedMs);
  // vo2CostMlKgMin = economy [mL/kg/km] × speedKmh / 60
  const targetVo2Cost = targetEconomy * targetSpeedMs * 3.6 / 60;

  // v2.4: compute FATmax + MFO anchors for substrate curve (FATzero anchoring)
  // calculateMFO retains RE_CONST internally — fat curve shape is unchanged.
  const { fatmaxSpeedMs, fatmaxFraction } = calculateFATmax(vo2maxMlKgMin, vlamaxMmolLS, mlssSpeedMs);
  const { mfoGH, mfoKcalH } = calculateMFO(mlssSpeedMs, vlamaxMmolLS, massKg);
  const anchors: SubstrateAnchors = { fatmaxSpeedMs, mfoGH };

  // Substrate numbers — NOT modified by dietType (see spec §18.1)
  // v2.5: economy passed so target energy uses athlete-specific economy
  const targetSub = substrateAtSpeed(targetSpeedMs, vlamaxMmolLS, mlssSpeedMs, massKg, anchors, targetEconomy);

  const alignment   = deriveAlignment(targetSpeedMs, lt1SpeedMs, mlssSpeedMs);
  const { label, severity, detail } = strategyDetail(alignment, eventType, dietType);
  const carbReq     = deriveCHORequirement(targetSub.cho_g_h, eventType, alignment, dietType);
  const gapAnalysis = deriveGapAnalysis(targetCHO, carbReq.requiredGH, carbReq.recommendedGH);

  // v2.5: baseEconomy threaded so CARB90 and curve use consistent speed-adjusted economy
  const carb90SpeedMs = detectCARB90(vlamaxMmolLS, mlssSpeedMs, massKg, anchors, baseEconomy);
  const carb90Found   = carb90SpeedMs < mlssSpeedMs * 1.15;

  const substrateCurve = buildRunningSubstrateCurve(vlamaxMmolLS, mlssSpeedMs, massKg, anchors, baseEconomy);

  // Zones — xf fraction from calculateFATmax (computed above)
  const zones = buildRunningZones(lt1SpeedMs, mlssSpeedMs, fatmaxFraction, vlamaxMmolLS, massKg);
  const dietNote       = buildDietNote(dietType);

  return {
    target: {
      speedMs:  targetSpeedMs,
      pace:     formatPace(targetSpeedMs),
      pctMLSS:  (targetSpeedMs / mlssSpeedMs) * 100,
      choGHour: targetSub.cho_g_h,
      fatGHour: targetSub.fat_g_h,
      kcalHour: targetSub.total_kcal_h,
      alignment,
      economyMlKgKm:     targetEconomy,
      baseEconomyMlKgKm: baseEconomy,
      vo2CostMlKgMin:    targetVo2Cost,
    },
    substrateCurve,
    fatmaxSpeedMs,
    fatmaxPace: formatPace(fatmaxSpeedMs),
    mfoGH,
    mfoKcalH,
    advice: {
      strategy:        { label, alignment, severity, detail },
      carbRequirement: carbReq,
      gapAnalysis,
    },
    carb90: {
      found:   carb90Found,
      speedMs: carb90Found ? carb90SpeedMs : null,
      pace:    carb90Found ? formatPace(carb90SpeedMs) : null,
    },
    zones,
    dietNote,
  };
}
