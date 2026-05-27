'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { exportToPdf } from '@/lib/pdf/exportPdf';
import type { RunningFuelingResult, RunFuelConfig, RunCarbRatio, RunningEventType } from '@/lib/engine/runningTypes';
import { RUN_RATIO_OPTIONS } from '@/lib/engine/runningTypes';
import RunningSubstrateCurveChart from './RunningSubstrateCurveChart';
import RunningFuelingTimeline from './RunningFuelingTimeline';
import InfoTooltip from '@/components/shared/InfoTooltip';
import { ZONE_DOT, ZONE_ROW_BG } from '@/lib/zones/zoneDefinitions';
import { buildRunningProfilerZones } from '@/lib/engine/runningZones';
import { substrateAtSpeed, adjustEconomyForSpeed, formatPace } from '@/lib/engine/runningMetabolicEngine';
import type { SubstrateAnchors } from '@/lib/engine/runningMetabolicEngine';

const FREQ_OPTIONS = [10, 15, 20, 30, 45, 60] as const;

interface Props {
  result:             RunningFuelingResult;
  mlssSpeedMs:        number;
  lt1SpeedMs:         number;
  fatmaxSpeedMs?:     number;
  vlamaxMmolLS?:      number;
  vVO2maxSpeedMs?:    number;
  massKg?:            number;
  name?:              string;
  eventType?:         RunningEventType | string;
  userPlannedCHO?:    number | null;  // explicitly entered by user; null = not set → show "—"
  fuelConfig:         RunFuelConfig;
  onFuelConfigChange: (c: RunFuelConfig) => void;
  gphGels:            number;
  gphDrinks:          number;
  gphSolids:          number;
}

const LEVEL_STYLES = {
  GREEN: { bar: 'bg-green-500',  badge: 'bg-green-100 text-green-800',  bg: 'bg-green-50',  text: 'text-green-800' },
  AMBER: { bar: 'bg-amber-400',  badge: 'bg-amber-100 text-amber-800',  bg: 'bg-amber-50',  text: 'text-amber-800' },
  RED:   { bar: 'bg-red-500',    badge: 'bg-red-100 text-red-800',      bg: 'bg-red-50',    text: 'text-red-800'   },
};

function planLevel(gap: number, required: number): 'GREEN' | 'AMBER' | 'RED' {
  if (required <= 0) return 'GREEN';
  const pct = gap / required;
  if (pct >= -0.10) return 'GREEN';
  if (pct >= -0.35) return 'AMBER';
  return 'RED';
}

// ── Glucose / fructose breakdown ──────────────────────────────────────────────

function ratioParts(ratio: RunCarbRatio | undefined): { glu: number; fru: number } {
  switch (ratio) {
    case 'Glucose': return { glu: 1,         fru: 0           };
    case '2:1':     return { glu: 2 / 3,     fru: 1 / 3       };
    case '1:1':     return { glu: 0.5,       fru: 0.5         };
    case '1:0.8':   return { glu: 1 / 1.8,   fru: 0.8 / 1.8   };
    default:        return { glu: 0.5,       fru: 0.5         }; // Unknown → 1:1 estimate
  }
}

function computeSubstrateBreakdown(
  config: RunFuelConfig, gphGels: number, gphDrinks: number, gphSolids: number,
) {
  const { glu: gGlu, fru: gFru } = ratioParts(config.gelRatio);
  const { glu: dGlu, fru: dFru } = ratioParts(config.drinkRatio);
  const { glu: sGlu, fru: sFru } = ratioParts(config.solidRatio);
  return {
    glucoseGph:  Math.round(gphGels * gGlu + gphDrinks * dGlu + gphSolids * sGlu),
    fructoseGph: Math.round(gphGels * gFru + gphDrinks * dFru + gphSolids * sFru),
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NumField({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <input
        type="number" min={min} max={max} step={step}
        defaultValue={value}
        key={value}
        onBlur={e => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
    </div>
  );
}

function FreqField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <select
        value={value}
        onChange={e => onChange(parseInt(e.target.value, 10))}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        {FREQ_OPTIONS.map(f => <option key={f} value={f}>{f} min</option>)}
      </select>
    </div>
  );
}

function RatioSelect({ value, onChange }: { value: RunCarbRatio | undefined; onChange: (r: RunCarbRatio) => void }) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">Ratio</label>
      <select
        value={value ?? 'Unknown'}
        onChange={e => onChange(e.target.value as RunCarbRatio)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        {RUN_RATIO_OPTIONS.map(r => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
    </div>
  );
}

export default function RunningFuelingResults({
  result, mlssSpeedMs, lt1SpeedMs, fatmaxSpeedMs, vlamaxMmolLS, vVO2maxSpeedMs, massKg,
  name, eventType, userPlannedCHO, fuelConfig, onFuelConfigChange, gphGels, gphDrinks, gphSolids,
}: Props) {
  // showPlanned: true only when the user explicitly entered a planned CHO value
  const showPlanned = userPlannedCHO != null && userPlannedCHO > 0;
  const [showAdvice,   setShowAdvice]   = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [exporting,    setExporting]    = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  const handleExportPdf = useCallback(async () => {
    if (!mainRef.current) return;
    setExporting(true);
    try {
      const slug = name ? name.toLowerCase().replace(/\s+/g, '-') : 'athlete';
      await exportToPdf(mainRef.current, `running-fueling-${slug}.pdf`);
    } finally {
      setExporting(false);
    }
  }, [name]);

  const { target, advice, carb90, substrateCurve, dietNote, fatmaxPace, mfoGH } = result;
  const { strategy, carbRequirement, gapAnalysis } = advice;

  // rawRequired = raw modeled CHO oxidation (display only — NOT a fueling target)
  // recommended = practical capped intake target (gap/level/bar baseline)
  const planned     = gapAnalysis.planned;
  const rawRequired = carbRequirement.requiredGH;
  const recommended = carbRequirement.recommendedGH;
  const gap         = gapAnalysis.gap;  // planned − recommended

  const level = planLevel(gap, recommended);
  const s     = LEVEL_STYLES[level];

  const dirRaw    = gapAnalysis.direction;
  const isOver    = dirRaw === 'over';
  const isAligned = dirRaw === 'aligned';

  const barPct      = recommended > 0 ? Math.min(100, Math.round((planned / recommended) * 100)) : 0;
  const cautionFlag = recommended > 80 || planned > 80;

  const pctLT2      = target.pctMLSS;
  const pacingLabel = pctLT2 >= 90 ? 'Aggressive' : pctLT2 >= 75 ? 'Well paced' : 'Conservative';
  const pacingChip  = pctLT2 >= 90 ? 'bg-amber-100 text-amber-800' : pctLT2 >= 75 ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800';

  const demandLabel = rawRequired <= 60 ? 'Low demand' : rawRequired <= 100 ? 'Moderate' : 'High demand';
  const demandChip  = rawRequired <= 60 ? 'bg-green-100 text-green-800' : rawRequired <= 100 ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800';

  const plannedChipText = isAligned ? 'On target' : isOver ? `+${Math.round(gap)} g/h above` : `${Math.round(Math.abs(gap))} g/h below`;
  const plannedChip     = isAligned ? 'bg-green-100 text-green-800' : isOver ? 'bg-blue-100 text-blue-800' : s.badge;

  function gapLabelText(): string {
    if (isAligned) return 'On target';
    if (isOver)    return `+${Math.round(gap)} g/h above recommended target`;
    return `${Math.round(Math.abs(gap))} g/h below recommended target`;
  }

  // Glucose/fructose breakdown — display-only, derived from planned fuel config ratios
  const totalGph = Math.round(gphGels + gphDrinks + gphSolids);
  const subBreakdown = computeSubstrateBreakdown(fuelConfig, gphGels, gphDrinks, gphSolids);

  // ── Zone substrate table ──────────────────────────────────────────────────────
  const zoneRows = (() => {
    if (!vlamaxMmolLS || !massKg || !vVO2maxSpeedMs) return [];
    const s20proxy = vVO2maxSpeedMs * 1.30;
    const profilerZones = buildRunningProfilerZones(lt1SpeedMs, mlssSpeedMs, vVO2maxSpeedMs, s20proxy);
    const anchors: SubstrateAnchors | undefined = fatmaxSpeedMs ? { fatmaxSpeedMs, mfoGH } : undefined;
    return profilerZones.map(z => {
      const mid = (z.speedLow + z.speedHigh) / 2;
      const eco = adjustEconomyForSpeed(target.baseEconomyMlKgKm, mid, mlssSpeedMs);
      const sub = substrateAtSpeed(mid, vlamaxMmolLS, mlssSpeedMs, massKg, anchors, eco);
      return {
        name: z.name, label: z.label, paceRange: z.paceRange, paceMid: formatPace(mid),
        fatGH: Math.round(sub.fat_g_h), choGH: Math.round(sub.cho_g_h), kcalH: Math.round(sub.total_kcal_h),
      };
    });
  })();

  function patch(partial: Partial<RunFuelConfig>) {
    onFuelConfigChange({ ...fuelConfig, ...partial });
  }

  return (
    <div ref={mainRef} className="space-y-6">

      {/* Export */}
      <div className="flex justify-end">
        <button
          onClick={handleExportPdf}
          disabled={exporting}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
        >
          {exporting ? (
            <>
              <span className="animate-spin h-3 w-3 border border-gray-400 border-t-transparent rounded-full" />
              Generating…
            </>
          ) : (
            '↓ Export PDF'
          )}
        </button>
      </div>

      {/* Diet note */}
      {dietNote && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 leading-relaxed">
          <span className="font-bold block mb-1">Fat-adapted diet — advisory note</span>
          {dietNote}
        </div>
      )}

      {/* ── Key metrics row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 border-l-4 border-amber-400 shadow-sm">
          <p className="text-xs font-bold uppercase text-gray-400 flex items-center">FATmax<InfoTooltip term="FATmax" /></p>
          <p className="text-2xl font-black text-gray-900">{fatmaxPace}</p>
          <p className="text-xs text-gray-400">MFO {Math.round(mfoGH)} g/h</p>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-blue-500 shadow-sm">
          <p className="text-xs font-bold uppercase text-gray-400 flex items-center">CARB90<InfoTooltip term="CARB90" /></p>
          <p className="text-2xl font-black text-gray-900">
            {carb90.found ? (carb90.pace ?? '—') : 'Not found'}
          </p>
          <p className="text-xs text-gray-400">
            {carb90.found ? `${carb90.speedMs?.toFixed(2)} m/s` : 'Above modelled range'}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-gray-400 shadow-sm">
          <p className="text-xs font-bold uppercase text-gray-400">Total EE</p>
          <p className="text-2xl font-black text-gray-900">{Math.round(target.kcalHour)}</p>
          <p className="text-xs text-gray-400">kcal/h at target</p>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-violet-500 shadow-sm">
          <p className="text-xs font-bold uppercase text-gray-400">CHO @ Target</p>
          <p className="text-2xl font-black text-gray-900">{Math.round(target.choGHour)}</p>
          <p className="text-xs text-gray-400">g/h modeled demand</p>
        </div>
      </div>

      {/* ── Substrate curve ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h3 className="text-sm font-bold text-gray-800 mb-1">Substrate Oxidation (kcal/h)</h3>
        <p className="text-xs text-gray-400 mb-3">Fat and carbohydrate contribution across pace</p>
        <RunningSubstrateCurveChart
          curve={substrateCurve}
          lt1SpeedMs={lt1SpeedMs}
          fatmaxSpeedMs={fatmaxSpeedMs}
          mlssSpeedMs={mlssSpeedMs}
          carb90SpeedMs={carb90.found && carb90.speedMs ? carb90.speedMs : undefined}
          targetSpeedMs={target.speedMs}
        />
      </div>

      {/* ── Fueling Plan Card ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

        {/* Header */}
        <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
          <p className="text-sm font-bold text-gray-800">Fueling Plan</p>
          {showPlanned ? (
            <>
              <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${s.badge}`}>{level}</span>
              <span className={`text-sm font-black ${s.text}`}>
                {Math.round(planned)} g/h ({Math.round(planned * 4)} kcal/h)
              </span>
              <span className="text-xs text-gray-400">{gapLabelText()}</span>
            </>
          ) : (
            <span className="text-xs text-gray-400">Recommended: {Math.round(recommended)} g/h</span>
          )}
          {totalGph > 0 && (
            <>
              <span className="text-gray-200 select-none">|</span>
              <span className="text-xs text-gray-500">
                {subBreakdown.glucoseGph}g glucose · {subBreakdown.fructoseGph}g fructose
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

        {/* 4-column summary */}
        <div className="grid grid-cols-4 border-t border-gray-100 divide-x divide-gray-100 text-center">
          <div className="px-2 pt-2.5 pb-3 bg-emerald-50">
            <p className="text-xs text-gray-400 mb-0.5">Target Pace</p>
            <p className="text-lg font-black text-emerald-900">{target.pace}</p>
            <p className="text-xs text-emerald-600 font-semibold mb-1">{Math.round(pctLT2)}% LT2</p>
            <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${pacingChip}`}>{pacingLabel}</span>
          </div>
          <div className="px-2 pt-2.5 pb-3">
            <p className="text-xs text-gray-400 mb-0.5">Modeled</p>
            <p className="text-lg font-black text-gray-900">{Math.round(rawRequired)}</p>
            <p className="text-xs text-gray-400 mb-1">g/h oxidation</p>
            <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${demandChip}`}>{demandLabel}</span>
          </div>
          <div className={`px-2 pt-2.5 pb-3 ${s.bg}`}>
            <p className="text-xs text-gray-400 mb-0.5">Recommended</p>
            <p className={`text-lg font-black ${s.text}`}>{Math.round(recommended)}</p>
            <p className="text-xs text-gray-400 mb-1">g/h</p>
            <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">Practical target</span>
          </div>
          <div className="px-2 pt-2.5 pb-3">
            <p className="text-xs text-gray-400 mb-0.5">Planned</p>
            {showPlanned ? (
              <>
                <p className="text-lg font-black text-gray-900">{Math.round(planned)}</p>
                <p className="text-xs text-gray-400 mb-1">g/h</p>
                <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${plannedChip}`}>{plannedChipText}</span>
              </>
            ) : (
              <>
                <p className="text-lg font-black text-gray-300">—</p>
                <p className="text-xs text-gray-300 mb-1">g/h</p>
                <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">Not set</span>
              </>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-4 py-3 border-t border-gray-100">
          {showPlanned ? (
            <>
              <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                <span>0 g/h</span>
                <span>Recommended: {Math.round(recommended)} g/h</span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${isOver ? 'bg-blue-400' : s.bar}`}
                  style={{ width: `${barPct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className={`font-semibold ${isOver ? 'text-blue-600' : s.text}`}>{barPct}% of recommended</span>
                {cautionFlag && <span className="text-amber-700 font-semibold">High intake — gut training required</span>}
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-400">
              Enter a planned CHO target in the sidebar to see gap analysis.
            </p>
          )}
        </div>

        {/* Insights panel */}
        {showAdvice && (
          <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3 text-xs text-gray-600">
            <div>
              <p className="font-semibold text-gray-800 mb-0.5">Strategy</p>
              <p>{strategy.detail}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-800 mb-0.5">CHO demand</p>
              <p>{carbRequirement.detail}</p>
            </div>
            {rawRequired > 90 && (
              <div>
                <p className="font-semibold text-gray-800 mb-0.5">Modeled vs practical</p>
                <p>
                  Estimated carbohydrate oxidation at this pace is ~{Math.round(rawRequired)} g/h.
                  Most of this is supplied by stored muscle glycogen and blood glucose — these cannot be fully replaced in real time.
                  The practical intake target ({Math.round(recommended)} g/h) reflects what can be absorbed and utilised exogenously.
                </p>
              </div>
            )}
            <div>
              <p className="font-semibold text-gray-800 mb-0.5">Running economy</p>
              <p>
                Base economy: {Math.round(result.target.baseEconomyMlKgKm)} mL/kg/km
                {' · '}
                Speed-adjusted: {Math.round(result.target.economyMlKgKm)} mL/kg/km
                {' · '}
                VO₂ cost: {result.target.vo2CostMlKgMin.toFixed(1)} mL/kg/min
              </p>
            </div>
            {carb90.found && (
              <div>
                <p className="font-semibold text-gray-800 mb-0.5">Multi-carb threshold</p>
                <p>
                  CHO oxidation reaches 90 g/h at {carb90.pace} ({carb90.speedMs?.toFixed(2)} m/s).
                  Multi-carb formulations (2:1 glucose:fructose) recommended above this pace.
                </p>
              </div>
            )}
            {totalGph > 0 && (
              <div>
                <p className="font-semibold text-gray-800 mb-0.5">Substrate mix</p>
                <p>
                  {subBreakdown.glucoseGph} g/h glucose (incl. maltodextrin) · {subBreakdown.fructoseGph} g/h fructose
                </p>
                {subBreakdown.glucoseGph > 60 && (
                  <p className="mt-1.5 font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                    Glucose exceeds 60 g/h — mixed carbohydrate sources (2:1 or higher) improve absorption and reduce GI risk.
                  </p>
                )}
              </div>
            )}
            {cautionFlag && (
              <p className="font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                Planned intake is high. Gut training is recommended to achieve reliable absorption at this rate.
              </p>
            )}
          </div>
        )}

        {/* ── Fuel source controls ────────────────────────────────────────────── */}
        {showControls && (
          <div className="border-t border-gray-100 px-4 pb-5 pt-4 space-y-6">

            {/* Gels */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Gels</p>
                  {gphGels > 0 && (
                    <span className="text-xs font-semibold text-violet-600">
                      {Math.round(gphGels)} g/h ({Math.round(gphGels * 4)} kcal/h)
                    </span>
                  )}
                </div>
              </div>
              {!fuelConfig.gelsOn ? (
                <p className="text-xs text-gray-400">No gels — enable Gels in the sidebar to configure.</p>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_1.5fr_1fr] gap-3">
                    <NumField label="Carbs/gel (g)" value={fuelConfig.gelCarbs} min={5} max={80} step={1}
                      onChange={v => patch({ gelCarbs: v })} />
                    <RatioSelect value={fuelConfig.gelRatio} onChange={v => patch({ gelRatio: v })} />
                    <FreqField label="Every (min)" value={fuelConfig.gelFreq}
                      onChange={v => patch({ gelFreq: v })} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    {Math.round(gphGels)} g/h ({Math.round(gphGels * 4)} kcal/h) per gel
                  </p>
                  {fuelConfig.gelRatio === 'Glucose' && planned >= 60 && (
                    <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                      At {Math.round(planned)} g/h, glucose-only gels limit absorption. Switching to 2:1 or 1:1 reduces GI risk.
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Sports Drinks */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Sports Drinks</p>
                  {gphDrinks > 0 && (
                    <span className="text-xs font-semibold text-blue-600">
                      {Math.round(gphDrinks)} g/h ({Math.round(gphDrinks * 4)} kcal/h)
                    </span>
                  )}
                  {fuelConfig.drinksOn && (
                    <span className="text-xs text-blue-400">
                      · {Math.round((fuelConfig.drinkVol / fuelConfig.drinkFreq) * 60)} ml/h
                    </span>
                  )}
                </div>
              </div>
              {!fuelConfig.drinksOn ? (
                <p className="text-xs text-gray-400">No drinks — enable Drinks in the sidebar to configure.</p>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-3">
                    <NumField label="Volume (ml)" value={fuelConfig.drinkVol} min={50} max={1000} step={10}
                      onChange={v => patch({ drinkVol: v })} />
                    <NumField label="Conc. (g/L)" value={fuelConfig.drinkConc} min={10} max={150} step={5}
                      onChange={v => patch({ drinkConc: v })} />
                    <RatioSelect value={fuelConfig.drinkRatio} onChange={v => patch({ drinkRatio: v })} />
                    <FreqField label="Every (min)" value={fuelConfig.drinkFreq}
                      onChange={v => patch({ drinkFreq: v })} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    {Math.round((fuelConfig.drinkConc * fuelConfig.drinkVol) / 1000)} g CHO/serving
                    {' · '}
                    {Math.round(gphDrinks)} g/h ({Math.round(gphDrinks * 4)} kcal/h)
                    {' · '}
                    {Math.round((fuelConfig.drinkVol / fuelConfig.drinkFreq) * 60)} ml/h fluid
                  </p>
                </>
              )}
            </div>

            {/* Solid Food */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Solid Food</p>
                  {gphSolids > 0 && (
                    <span className="text-xs font-semibold text-amber-600">
                      {Math.round(gphSolids)} g/h ({Math.round(gphSolids * 4)} kcal/h)
                    </span>
                  )}
                </div>
              </div>
              {!fuelConfig.solidsOn ? (
                <p className="text-xs text-gray-400">No solid food — enable Solids in the sidebar or use for long events.</p>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_1.5fr_1fr] gap-3">
                    <NumField label="Carbs/serving (g)" value={fuelConfig.solidCarbs} min={5} max={100} step={1}
                      onChange={v => patch({ solidCarbs: v })} />
                    <RatioSelect value={fuelConfig.solidRatio} onChange={v => patch({ solidRatio: v })} />
                    <FreqField label="Every (min)" value={fuelConfig.solidFreq}
                      onChange={v => patch({ solidFreq: v })} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    {Math.round(gphSolids)} g/h ({Math.round(gphSolids * 4)} kcal/h) per serving
                  </p>
                </>
              )}
            </div>

          </div>
        )}
      </div>

      {/* ── Intake Timeline ──────────────────────────────────────────────────── */}
      {eventType && (
        <RunningFuelingTimeline
          fuelConfig={fuelConfig}
          eventType={eventType}
          gphGels={gphGels}
          gphDrinks={gphDrinks}
          gphSolids={gphSolids}
        />
      )}

      {/* ── Zone Substrate Summary ───────────────────────────────────────────── */}
      {zoneRows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-800">Zone Substrate Summary</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400">
                  <th className="text-left px-4 py-2 font-semibold">Zone</th>
                  <th className="text-left px-2 py-2 font-semibold whitespace-nowrap">Pace range</th>
                  <th className="text-left px-2 py-2 font-semibold">Target</th>
                  <th className="text-right px-2 py-2 font-semibold text-amber-600">Fat g/h</th>
                  <th className="text-right px-2 py-2 font-semibold text-blue-600">CHO g/h</th>
                  <th className="text-right px-4 py-2 font-semibold">kcal/h</th>
                </tr>
              </thead>
              <tbody>
                {zoneRows.map(z => {
                  const dot = ZONE_DOT[z.name] ?? 'bg-gray-400';
                  const row = ZONE_ROW_BG[z.name] ?? 'bg-gray-50';
                  return (
                    <tr key={z.name} className={`border-b border-gray-50 ${row}`}>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
                          <span className="font-bold text-gray-700 whitespace-nowrap">{z.name}</span>
                          <span className="text-gray-500 hidden sm:inline">{z.label}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 font-mono text-gray-600 whitespace-nowrap">{z.paceRange}</td>
                      <td className="px-2 py-2 font-mono font-semibold text-gray-800">{z.paceMid}</td>
                      <td className="px-2 py-2 text-right text-amber-700 font-semibold">{z.fatGH}</td>
                      <td className="px-2 py-2 text-right text-blue-700 font-semibold">{z.choGH}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{z.kcalH}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Support */}
      <div className="border-t border-gray-100 pt-4 text-center">
        <p className="text-xs text-gray-400">
          Need help or spotted an issue?{' '}
          <Link href="/support" className="font-semibold text-violet-600 hover:text-violet-800 transition">
            Contact support
          </Link>
          {' · '}
          <Link href="/support" className="font-semibold text-violet-600 hover:text-violet-800 transition">
            Report a bug
          </Link>
        </p>
      </div>
    </div>
  );
}
