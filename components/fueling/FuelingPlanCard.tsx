'use client';

import { useState } from 'react';
import type { FuelingStrategy, CarbRatio } from '@/lib/engine/fuelingStrategy';
import {
  strategyToSourceBreakdown,
  drinkCarbsPerServing,
} from '@/lib/engine/fuelingStrategy';
import {
  buildGapAnalysisAdvice, buildFuelingStrategyAdvice, buildCarbRequirementAdvice,
  computeRecommendedTarget,
} from '@/lib/engine/fuelingEngine';
import type { EventType } from '@/lib/types';
import StrategyControls from './StrategyControls';

// ── Glucose / fructose breakdown (display-only) ───────────────────────────────

/** Glucose and fructose fractions for a given carb ratio. Unknown treated as 1:1. */
function ratioParts(ratio: CarbRatio | undefined): { glu: number; fru: number } {
  switch (ratio) {
    case 'Glucose': return { glu: 1,       fru: 0       };
    case '2:1':     return { glu: 2 / 3,   fru: 1 / 3   };
    case '1:1':     return { glu: 0.5,     fru: 0.5     };
    case '1:0.8':   return { glu: 1 / 1.8, fru: 0.8 / 1.8 };
    default:        return { glu: 0.5,     fru: 0.5     }; // Unknown → 1:1 estimate
  }
}

interface SubstrateBreakdown {
  glucoseGph:  number;
  fructoseGph: number;
  hasUnknown:  boolean;
}

/**
 * Compute glucose / fructose g/h from the planned strategy.
 * Uses the collision-aware per-source effective g/h from strategyToSourceBreakdown,
 * then applies a weighted-average ratio fraction across all items of each source type.
 * Display-only — does not affect any engine calculation.
 */
function computeSubstrateBreakdown(strategy: FuelingStrategy): SubstrateBreakdown {
  const { gels: gelGph, drinks: drinkGph, solids: solidGph } = strategyToSourceBreakdown(strategy);
  let glucoseGph  = 0;
  let fructoseGph = 0;
  let hasUnknown  = false;

  // ── Gels ─────────────────────────────────────────────────────────────
  const totalRawGelGph = strategy.gels.reduce(
    (s, g) => s + (g.carbsPerGel / g.freqMin) * 60, 0,
  );
  if (totalRawGelGph > 0 && gelGph > 0) {
    let wGlu = 0, wFru = 0;
    for (const g of strategy.gels) {
      const w = ((g.carbsPerGel / g.freqMin) * 60) / totalRawGelGph;
      const { glu, fru } = ratioParts(g.ratio);
      wGlu += w * glu;
      wFru += w * fru;
      if (!g.ratio || g.ratio === 'Unknown') hasUnknown = true;
    }
    glucoseGph  += gelGph * wGlu;
    fructoseGph += gelGph * wFru;
  }

  // ── Drinks ────────────────────────────────────────────────────────────
  const totalRawDrinkGph = strategy.drinks.reduce(
    (s, d) => s + (drinkCarbsPerServing(d.volumeMl, d.concGL) / d.freqMin) * 60, 0,
  );
  if (totalRawDrinkGph > 0 && drinkGph > 0) {
    let wGlu = 0, wFru = 0;
    for (const d of strategy.drinks) {
      const w = ((drinkCarbsPerServing(d.volumeMl, d.concGL) / d.freqMin) * 60) / totalRawDrinkGph;
      const { glu, fru } = ratioParts(d.ratio);
      wGlu += w * glu;
      wFru += w * fru;
      if (!d.ratio || d.ratio === 'Unknown') hasUnknown = true;
    }
    glucoseGph  += drinkGph * wGlu;
    fructoseGph += drinkGph * wFru;
  }

  // ── Solids ────────────────────────────────────────────────────────────
  const totalRawSolidGph = strategy.solids.reduce(
    (s, sol) => s + (sol.carbsPer / sol.freqMin) * 60, 0,
  );
  if (totalRawSolidGph > 0 && solidGph > 0) {
    let wGlu = 0, wFru = 0;
    for (const sol of strategy.solids) {
      const w = ((sol.carbsPer / sol.freqMin) * 60) / totalRawSolidGph;
      const { glu, fru } = ratioParts(sol.ratio);
      wGlu += w * glu;
      wFru += w * fru;
      if (!sol.ratio || sol.ratio === 'Unknown') hasUnknown = true;
    }
    glucoseGph  += solidGph * wGlu;
    fructoseGph += solidGph * wFru;
  }

  return {
    glucoseGph:  Math.round(glucoseGph),
    fructoseGph: Math.round(fructoseGph),
    hasUnknown,
  };
}

interface Props {
  strategy:        FuelingStrategy;
  onStrategy:      (s: FuelingStrategy) => void;
  plannedGph:      number;
  requiredGph:     number;   // live — from dense series at effectivePowerW
  effectivePowerW: number;   // current target power (form value or live override)
  mlssWatts:       number;
  onPowerChange:   (w: number) => void;
  eventType:       EventType;
  displayUnit:     'g' | 'kcal';
}

const LEVEL_STYLES = {
  GREEN: {
    bar:    'bg-green-500',
    badge:  'bg-green-100 text-green-800',
    border: 'border-green-200',
    bg:     'bg-green-50',
    text:   'text-green-800',
    power:  'bg-violet-50 border-r border-violet-100',
  },
  AMBER: {
    bar:    'bg-amber-400',
    badge:  'bg-amber-100 text-amber-800',
    border: 'border-amber-200',
    bg:     'bg-amber-50',
    text:   'text-amber-800',
    power:  'bg-violet-50 border-r border-violet-100',
  },
  RED: {
    bar:    'bg-red-500',
    badge:  'bg-red-100 text-red-800',
    border: 'border-red-200',
    bg:     'bg-red-50',
    text:   'text-red-800',
    power:  'bg-violet-50 border-r border-violet-100',
  },
};

export default function FuelingPlanCard({
  strategy, onStrategy, plannedGph, requiredGph,
  effectivePowerW, mlssWatts, onPowerChange, eventType, displayUnit,
}: Props) {
  const [showControls, setShowControls] = useState(true);
  const [showAdvice,   setShowAdvice]   = useState(false);

  const recommendedGph = computeRecommendedTarget(requiredGph, eventType);
  const gapAdv         = buildGapAnalysisAdvice(requiredGph, plannedGph, eventType);

  const { level } = gapAdv;
  const s = LEVEL_STYLES[level];

  const pctLT2 = mlssWatts > 0 ? Math.round((effectivePowerW / mlssWatts) * 100) : 0;

  // Display-unit helpers (presentation only — all internals remain in grams)
  const toDisp = (g: number) => displayUnit === 'kcal' ? Math.round(g * 4) : Math.round(g);
  const uRate  = displayUnit === 'kcal' ? 'kcal/h' : 'g/h';

  // Glucose / fructose breakdown — display-only, computed from ratio metadata
  const subBreakdown = computeSubstrateBreakdown(strategy);

  // Progress bar: clamped to 0–100% of requirement; overflow shown at 100% + special styling
  const barPct    = requiredGph > 0 ? Math.min(100, Math.round((plannedGph / requiredGph) * 100)) : 0;
  const isOver    = gapAdv.direction === 'OVER';
  const isAligned = gapAdv.direction === 'ALIGNED';

  // ── Insights (replaces standalone panels) ────────────────────────
  const stratAdv = buildFuelingStrategyAdvice(eventType, effectivePowerW, mlssWatts, requiredGph, plannedGph);
  const carbAdv  = buildCarbRequirementAdvice(requiredGph);

  // Compact chip labels
  const pacingLabel     = stratAdv.alignment === 'WITHIN' ? 'Well paced' : stratAdv.alignment === 'ABOVE' ? 'Aggressive' : 'Conservative';
  const pacingChip      = stratAdv.alignment === 'WITHIN' ? 'bg-green-100 text-green-800' : stratAdv.alignment === 'ABOVE' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800';
  const demandLabel     = requiredGph <= 60 ? 'Low demand' : requiredGph <= 90 ? 'Moderate' : 'High demand';
  const demandChip      = requiredGph <= 60 ? 'bg-green-100 text-green-800' : requiredGph <= 90 ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800';
  const plannedChipText = isAligned ? 'On target' : isOver ? `+${toDisp(gapAdv.gap_gph)} ${uRate} above` : `${toDisp(Math.abs(gapAdv.gap_gph))} ${uRate} below`;
  const plannedChip     = isAligned ? 'bg-green-100 text-green-800' : isOver ? 'bg-blue-100 text-blue-800' : s.badge;

  function gapLabel(): string {
    if (isAligned) return 'On target';
    if (isOver)    return `+${toDisp(gapAdv.gap_gph)} ${uRate} above`;
    return `${toDisp(Math.abs(gapAdv.gap_gph))} ${uRate} below target`;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="px-4 py-3 flex items-center gap-3">
        <p className="text-sm font-bold text-gray-800">Fueling Plan</p>
        <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${s.badge}`}>
          {level}
        </span>
        <span className={`text-sm font-black ${s.text}`}>
          {Math.round(plannedGph)} g/h ({Math.round(plannedGph * 4)} kcal/h)
        </span>
        <span className="text-xs text-gray-400">{gapLabel()}</span>
        {plannedGph > 0 && (
          <>
            <span className="text-gray-200 select-none">|</span>
            <span className="text-xs text-gray-500">
              {subBreakdown.glucoseGph}g glucose · {subBreakdown.fructoseGph}g fructose
              {subBreakdown.hasUnknown && ' (est.)'}
            </span>
            {subBreakdown.glucoseGph > 60 && (
              <span className="text-xs font-semibold text-amber-600">Glucose high</span>
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setShowAdvice(v => !v)}
            className="text-xs font-semibold text-gray-400 hover:text-gray-700 transition"
          >
            {showAdvice ? 'Hide insights ↑' : 'Insights ↓'}
          </button>
          <button
            onClick={() => setShowControls(v => !v)}
            className="text-xs font-semibold text-gray-500 hover:text-gray-800 transition"
          >
            {showControls ? 'Collapse ↑' : 'Edit plan ↓'}
          </button>
        </div>
      </div>

      {/* ── 4-column summary: Power | Required | Recommended | Planned ── */}
      <div className="grid grid-cols-4 border-t border-gray-100 divide-x divide-gray-100 text-center">

        {/* Target Power */}
        <div className="px-2 pt-2.5 pb-3 bg-violet-50">
          <p className="text-xs text-gray-400 mb-0.5">Target Power</p>
          <p className="text-lg font-black text-violet-900">{Math.round(effectivePowerW)}</p>
          <p className="text-xs text-violet-600 font-semibold mb-1">{pctLT2}% LT2</p>
          <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${pacingChip}`}>
            {pacingLabel}
          </span>
        </div>

        {/* Required */}
        <div className="px-2 pt-2.5 pb-3">
          <p className="text-xs text-gray-400 mb-0.5">Required</p>
          <p className="text-lg font-black text-gray-900">{toDisp(requiredGph)}</p>
          <p className="text-xs text-gray-400 mb-1">{uRate}</p>
          <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${demandChip}`}>
            {demandLabel}
          </span>
        </div>

        {/* Recommended */}
        <div className={`px-2 pt-2.5 pb-3 ${s.bg}`}>
          <p className="text-xs text-gray-400 mb-0.5">Recommended</p>
          <p className={`text-lg font-black ${s.text}`}>{toDisp(recommendedGph)}</p>
          <p className="text-xs text-gray-400 mb-1">{uRate}</p>
          <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800">
            Practical target
          </span>
        </div>

        {/* Planned */}
        <div className="px-2 pt-2.5 pb-3">
          <p className="text-xs text-gray-400 mb-0.5">Planned</p>
          <p className="text-lg font-black text-gray-900">{toDisp(plannedGph)}</p>
          <p className="text-xs text-gray-400 mb-1">{uRate}</p>
          <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${plannedChip}`}>
            {plannedChipText}
          </span>
        </div>
      </div>

      {/* ── Progress bar ─────────────────────────────────────────── */}
      <div className="px-4 py-3 border-t border-gray-100">
        <div className="flex justify-between text-xs text-gray-400 mb-1.5">
          <span>0 {uRate}</span>
          <span>Required: {toDisp(requiredGph)} {uRate}</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${isOver ? 'bg-blue-400' : s.bar}`}
            style={{ width: `${barPct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs mt-1">
          <span className={`font-semibold ${isOver ? 'text-blue-600' : s.text}`}>
            {barPct}% of requirement
          </span>
          {gapAdv.cautionFlag && (
            <span className="text-amber-700 font-semibold">High intake — gut training required</span>
          )}
        </div>
      </div>

      {/* ── Insights panel ────────────────────────────────────────── */}
      {showAdvice && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3 text-xs text-gray-600">
          <div>
            <p className="font-semibold text-gray-800 mb-0.5">Nutrition</p>
            <p>{stratAdv.nutritionAnalysis}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800 mb-0.5">Pacing</p>
            <p>{stratAdv.pacingAnalysis}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800 mb-0.5">Risk</p>
            <p>{carbAdv.riskText}</p>
            {gapAdv.cautionFlag && (
              <p className="mt-1.5 font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                {gapAdv.cautionText}
              </p>
            )}
          </div>
          {plannedGph > 0 && (
            <div>
              <p className="font-semibold text-gray-800 mb-0.5">Substrate mix</p>
              <p>
                {subBreakdown.glucoseGph} g/h glucose (incl. maltodextrin)
                {' · '}
                {subBreakdown.fructoseGph} g/h fructose
                {subBreakdown.hasUnknown && (
                  <span className="text-gray-400"> — estimated using 1:1 for unknown sources</span>
                )}
              </p>
              {subBreakdown.glucoseGph > 60 && (
                <p className="mt-1.5 font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                  Glucose exceeds 60 g/h — mixed carbohydrate sources (2:1 or higher) improve absorption and reduce GI risk.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Strategy controls ─────────────────────────────────────── */}
      {showControls && (
        <div className="border-t border-gray-100 px-4 pb-5 pt-4">
          <StrategyControls
            strategy={strategy}
            onChange={onStrategy}
            plannedGph={plannedGph}
            recommendedGph={recommendedGph}
            targetWatts={effectivePowerW}
            mlssWatts={mlssWatts}
            onPowerChange={onPowerChange}
            displayUnit={displayUnit}
          />
        </div>
      )}
    </div>
  );
}
