'use client';

import { useMemo, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import type { FuelingResult, DenseSubstratePoint } from '@/lib/types';
import type { FuelingStrategy } from '@/lib/engine/fuelingStrategy';
import SubstrateCurveChart from './SubstrateCurveChart';
import FuelingPlanCard from './FuelingPlanCard';
import FuelingTimeline from './FuelingTimeline';
import FuelingPrintView from './FuelingPrintView';
import InfoTooltip from '@/components/shared/InfoTooltip';
import { exportToPdf } from '@/lib/pdf/exportPdf';
import { ZONE_DOT, ZONE_ROW_BG } from '@/lib/zones/zoneDefinitions';
import SaveAccountPrompt from '@/components/SaveAccountPrompt';

// Maps cycling zone short names to shared ZONE_DOT / ZONE_ROW_BG keys
const CYCLING_ZONE_STYLE: Record<string, string> = {
  'Z1':  'Zone 1',
  'Z2':  'Zone 2',
  'Z3a': 'Zone 3A',
  'Z3b': 'Zone 3B',
  'Z4':  'Zone 4',
  'Z5a': 'Zone 5A',
};

interface Props {
  result:          FuelingResult;
  strategy:        FuelingStrategy;
  onStrategy:      (s: FuelingStrategy) => void;
  plannedGph:      number;
  effectivePowerW: number;   // form target OR live override from strategy controls
  onPowerChange:   (w: number) => void;
  isLoggedIn?:      boolean;
  onCreateAccount?: () => void;
}

/** Interpolate CHO g/h from the dense substrate series for an arbitrary watt target. */
function lookupChoAtWatts(series: DenseSubstratePoint[], watts: number): number {
  if (series.length === 0) return 0;
  const sorted = [...series].sort((a, b) => a.watts - b.watts);
  const lo = [...sorted].reverse().find(p => p.watts <= watts);
  const hi = sorted.find(p => p.watts > watts);
  if (!lo && hi) return hi.choG;
  if (!hi && lo) return lo.choG;
  if (!lo || !hi) return 0;
  const t = (watts - lo.watts) / (hi.watts - lo.watts);
  return lo.choG + t * (hi.choG - lo.choG);
}

/** Look up all substrate values from the series at a given watt target. */
function lookupSubstrateAtWatts(series: DenseSubstratePoint[], watts: number) {
  if (series.length === 0) return null;
  const sorted = [...series].sort((a, b) => a.watts - b.watts);
  const lo = [...sorted].reverse().find(p => p.watts <= watts);
  const hi = sorted.find(p => p.watts > watts);
  if (!lo && hi) return hi;
  if (!hi && lo) return lo;
  if (!lo || !hi) return null;
  const t = (watts - lo.watts) / (hi.watts - lo.watts);
  return {
    watts,
    pctLT2:      Math.round(lo.pctLT2 + t * (hi.pctLT2 - lo.pctLT2)),
    choG:        lo.choG        + t * (hi.choG        - lo.choG),
    fatG:        lo.fatG        + t * (hi.fatG        - lo.fatG),
    kcalPerHour: Math.round(lo.kcalPerHour + t * (hi.kcalPerHour - lo.kcalPerHour)),
    fatKcalH:    Math.round(lo.fatKcalH    + t * (hi.fatKcalH    - lo.fatKcalH)),
    choKcalH:    Math.round(lo.choKcalH    + t * (hi.choKcalH    - lo.choKcalH)),
    fatPct:      Math.round(lo.fatPct      + t * (hi.fatPct      - lo.fatPct)),
  };
}

const ZONE_LABEL_STYLES: Record<string, string> = {
  'Below LT1':  'text-green-700 bg-green-50 border-green-200',
  'LT1–LT2':   'text-blue-700  bg-blue-50  border-blue-200',
  'Above LT2':  'text-red-700   bg-red-50   border-red-200',
};

// ── Display-layer zone table ─────────────────────────────────────────────────
// Zone boundaries anchored to LT1 + LT2 (MLSS).
// All substrate values come from the engine's dense 1 W series via
// lookupSubstrateAtWatts — no new equations.

interface DisplayZoneDef {
  name:   string;
  label:  string;
  demand: string;
  low:    number;  // watts
  high:   number;  // watts
}

function buildDisplayZones(lt1Watts: number, mlssWatts: number): DisplayZoneDef[] {
  const z1Top  = Math.round(0.56 * lt1Watts);
  const z3Mid  = Math.round((lt1Watts + mlssWatts) / 2);
  const z4Top  = Math.round(1.06 * mlssWatts);
  const z5aTop = Math.round(1.20 * mlssWatts);
  return [
    { name: 'Z1',  label: 'Recovery',         demand: 'Very Low',      low: 0,         high: z1Top       },
    { name: 'Z2',  label: 'Base Endurance',    demand: 'Low',           low: z1Top,     high: lt1Watts    },
    { name: 'Z3a', label: 'Aerobic Threshold', demand: 'Moderate',      low: lt1Watts,  high: z3Mid       },
    { name: 'Z3b', label: 'Tempo',             demand: 'Moderate–High', low: z3Mid,     high: mlssWatts   },
    { name: 'Z4',  label: 'Threshold',         demand: 'High',          low: mlssWatts, high: z4Top       },
    { name: 'Z5a', label: 'Sub-VO₂max',        demand: 'Very High',     low: z4Top,     high: z5aTop      },
  ];
}

export default function FuelingResults({
  result, strategy, onStrategy, plannedGph, effectivePowerW, onPowerChange,
  isLoggedIn = false, onCreateAccount,
}: Props) {
  const { fatmaxPctMLSS, ge, inputs } = result;

  const printRef = useRef<HTMLDivElement>(null);
  const [exporting,    setExporting]    = useState(false);
  const [displayUnit,  setDisplayUnit]  = useState<'g' | 'kcal'>('g');

  // Display-unit helpers (presentation only — all internals remain in grams)
  const toDisp = (g: number) => displayUnit === 'kcal' ? Math.round(g * 4) : Math.round(g);
  const uRate  = displayUnit === 'kcal' ? 'kcal/h' : 'g/h';

  const handleExportPdf = useCallback(async () => {
    if (!printRef.current) return;
    setExporting(true);
    try {
      const slug = inputs.name && inputs.name !== 'Athlete'
        ? inputs.name.toLowerCase().replace(/\s+/g, '-')
        : 'athlete';
      await exportToPdf(printRef.current, `cycling-fueling-${slug}.pdf`);
    } finally {
      setExporting(false);
    }
  }, [inputs.name]);
  const fatmaxWatts = Math.round(fatmaxPctMLSS * inputs.mlssWatts);
  const { carb90 }  = result;

  // ── Live required CHO — from dense series at effectivePowerW ─────────────
  const liveRequiredGph = useMemo(() => {
    if (effectivePowerW === inputs.targetWatts) {
      return result.advice.carbRequirement.requiredCHO_gph;
    }
    return lookupChoAtWatts(result.denseSubstrateSeries, effectivePowerW);
  }, [effectivePowerW, inputs.targetWatts, result]);

  // ── Live substrate values at effectivePowerW ──────────────────────────────
  const liveSub = useMemo(() => {
    if (effectivePowerW === inputs.targetWatts) return result.target;
    const pt = lookupSubstrateAtWatts(result.denseSubstrateSeries, effectivePowerW);
    if (!pt) return result.target;
    return {
      pctMLSS:     effectivePowerW / inputs.mlssWatts,
      pctLT1:      inputs.lt1Watts > 0 ? effectivePowerW / inputs.lt1Watts : 0,
      kcalPerHour: pt.kcalPerHour,
      fatKcalHour: pt.fatKcalH,
      fatGHour:    pt.fatG,
      choKcalHour: pt.choKcalH,
      choGHour:    pt.choG,
      choRange:    result.target.choRange,
    };
  }, [effectivePowerW, inputs, result]);

  // ── Display-layer zone table ─────────────────────────────────────────────
  const displayZones = useMemo(
    () => inputs.lt1Watts > 0 ? buildDisplayZones(inputs.lt1Watts, inputs.mlssWatts) : [],
    [inputs.lt1Watts, inputs.mlssWatts],
  );

  // ── Live zone label ───────────────────────────────────────────────────────
  const liveZoneLabel =
    effectivePowerW < inputs.lt1Watts   ? 'Below LT1' :
    effectivePowerW < inputs.mlssWatts  ? 'LT1–LT2'  :
    'Above LT2';
  const anchorZoneStyle = ZONE_LABEL_STYLES[liveZoneLabel] ?? '';

  return (
    <div className="space-y-5">

      {/* Key metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 border-l-4 border-amber-400 shadow-sm">
          <p className="text-xs font-bold uppercase text-gray-400 flex items-center">FATmax<InfoTooltip term="FATmax" /></p>
          <p className="text-2xl font-black text-gray-900">{fatmaxWatts}</p>
          <p className="text-xs text-gray-400">W</p>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-blue-500 shadow-sm">
          <p className="text-xs font-bold uppercase text-gray-400 flex items-center">CARB90<InfoTooltip term="CARB90" /></p>
          <p className="text-2xl font-black text-gray-900">
            {carb90.found ? carb90.watts : `>${carb90.watts}`}
          </p>
          <p className="text-xs text-gray-400">{carb90.found ? 'W' : 'W — not reached'}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-gray-400 shadow-sm">
          <p className="text-xs font-bold uppercase text-gray-400">Total EE</p>
          <p className="text-2xl font-black text-gray-900">{liveSub.kcalPerHour}</p>
          <p className="text-xs text-gray-400">kcal/h</p>
        </div>
        <div className="bg-white rounded-xl p-4 border-l-4 border-violet-500 shadow-sm">
          <p className="text-xs font-bold uppercase text-gray-400">CHO @ Target</p>
          <p className="text-2xl font-black text-gray-900">{toDisp(liveRequiredGph)}</p>
          <p className="text-xs text-gray-400">{uRate}</p>
        </div>
      </div>

      {/* ── Save-account offer — logged-out users only ──────────────── */}
      {!isLoggedIn && onCreateAccount && (
        <SaveAccountPrompt
          headline="Save this fueling plan"
          body="Create a free account and we'll keep this calculation on file — no need to re-enter your numbers next time."
          onCreateAccount={onCreateAccount}
        />
      )}

      {/* Substrate curve chart */}
      <SubstrateCurveChart
        denseSubstrateSeries={result.denseSubstrateSeries}
        fatmaxPctMLSS={fatmaxPctMLSS}
        targetPctMLSS={liveSub.pctMLSS}
        mlssWatts={inputs.mlssWatts}
        lt1Watts={inputs.lt1Watts}
        carb90={result.carb90}
      />

      {/* Display unit toggle */}
      <div className="flex items-center gap-2 justify-end">
        <span className="text-xs text-gray-400">Display:</span>
        {(['g', 'kcal'] as const).map(u => (
          <button
            key={u}
            type="button"
            onClick={() => setDisplayUnit(u)}
            className={`text-xs font-semibold px-2.5 py-1 rounded-md border transition ${
              displayUnit === u
                ? 'bg-violet-600 text-white border-violet-600'
                : 'bg-white text-gray-500 border-gray-200 hover:border-violet-400'
            }`}
          >
            {u === 'g' ? 'g CHO' : 'kcal'}
          </button>
        ))}
      </div>

      {/* Primary planning section */}
      <FuelingPlanCard
        strategy={strategy}
        onStrategy={onStrategy}
        plannedGph={plannedGph}
        requiredGph={liveRequiredGph}
        effectivePowerW={effectivePowerW}
        mlssWatts={inputs.mlssWatts}
        onPowerChange={onPowerChange}
        eventType={inputs.eventType}
        displayUnit={displayUnit}
      />

      {/* Intake timeline */}
      <FuelingTimeline strategy={strategy} eventType={inputs.eventType} displayUnit={displayUnit} />

      {/* Target power summary */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-sm font-bold text-gray-800">
            Target Analysis — {Math.round(effectivePowerW)}W
          </h3>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${anchorZoneStyle}`}>
            {liveZoneLabel}
          </span>
          <span className="text-xs text-gray-400 ml-auto">
            {Math.round(liveSub.pctMLSS * 100)}% LT2
            {liveSub.pctLT1 > 0 && ` · ${Math.round(liveSub.pctLT1 * 100)}% LT1`}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-400">Metabolic cost</p>
            <p className="font-bold">{liveSub.kcalPerHour} kcal/h</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Fat (kcal/h)</p>
            <p className="font-bold text-amber-600">{liveSub.fatKcalHour} kcal/h</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">CHO (kcal/h)</p>
            <p className="font-bold text-blue-600">{liveSub.choKcalHour} kcal/h</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">CHO required</p>
            <p className="font-bold">{toDisp(liveRequiredGph)} {uRate}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Gross Efficiency</p>
            <p className="font-bold">{(ge * 100).toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {/* Zone substrate table — display-layer, anchored to LT1/LT2 */}
      {displayZones.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-800">Zone Substrate Summary</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400">
                  <th className="text-left px-4 py-2 font-semibold">Zone</th>
                  <th className="text-right px-2 py-2 font-semibold whitespace-nowrap">W range</th>
                  <th className="text-right px-2 py-2 font-semibold">W mid</th>
                  <th className="text-right px-2 py-2 font-semibold text-amber-600">Fat g/h</th>
                  <th className="text-right px-2 py-2 font-semibold text-blue-600">CHO g/h</th>
                  <th className="text-right px-4 py-2 font-semibold">kcal/h</th>
                </tr>
              </thead>
              <tbody>
                {displayZones.map(zone => {
                  const mid      = Math.round((zone.low + zone.high) / 2);
                  const sub      = lookupSubstrateAtWatts(result.denseSubstrateSeries, mid);
                  const styleKey = CYCLING_ZONE_STYLE[zone.name] ?? '';
                  const dot      = ZONE_DOT[styleKey]    ?? 'bg-gray-400';
                  const row      = ZONE_ROW_BG[styleKey] ?? 'bg-gray-50';
                  return (
                    <tr key={zone.name} className={`border-b border-gray-50 ${row}`}>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
                          <span className="font-bold text-gray-700 whitespace-nowrap">{zone.name}</span>
                          <span className="text-gray-500 hidden sm:inline">{zone.label}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-gray-600 whitespace-nowrap">{zone.low}–{zone.high}</td>
                      <td className="px-2 py-2 text-right font-mono text-gray-400">{mid}</td>
                      <td className="px-2 py-2 text-right text-amber-700 font-semibold">{sub ? Math.round(sub.fatG) : '—'}</td>
                      <td className="px-2 py-2 text-right text-blue-700 font-semibold">{sub ? Math.round(sub.choG) : '—'}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{sub ? sub.kcalPerHour : '—'}</td>
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

      {/* Hidden print view — off-screen, always rendered so html2canvas can capture it */}
      <div
        ref={printRef}
        style={{ position: 'fixed', top: 0, left: -9999, width: 794, pointerEvents: 'none', zIndex: -1 }}
        aria-hidden="true"
      >
        <FuelingPrintView
          result={result}
          strategy={strategy}
          plannedGph={plannedGph}
          requiredGph={liveRequiredGph}
          effectivePowerW={effectivePowerW}
        />
      </div>

    </div>
  );
}
