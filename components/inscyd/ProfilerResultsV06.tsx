'use client';

import { useState, useEffect, useRef, useId, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { MetabolicV06Result } from '@/lib/engine/metabolicModelV06';
import type { INSCYDToFuelingSenseBridge, SubscriptionTier } from '@/lib/types';
// fitLactate / lactateCurve not used — v0.6 uses a VLamax-aware curve (see laPoint below).
import { calcV06TrainingZones } from '@/lib/engine/v06Zones';
import { classifyVO2max, classifyVlamax, classifyLT2Wkg } from '@/lib/benchmarks/athleteBenchmarks';
import FuelingSnapshot from './FuelingSnapshot';
import ProfilerPrintView from './ProfilerPrintView';
import InfoTooltip from '@/components/shared/InfoTooltip';
import Link from 'next/link';
import { exportToPdf } from '@/lib/pdf/exportPdf';

interface Props {
  profile:         MetabolicV06Result;
  fuelingPrefill:  INSCYDToFuelingSenseBridge;
  tier:            SubscriptionTier;
  onSendToFueling: () => void;
  // Athlete context — display/benchmarking only, no model impact
  name?:     string;
  sex?:      'Male' | 'Female';
  age?:      number;
  dietType?: string;
}

// Benchmarking functions imported from lib/benchmarks/athleteBenchmarks.ts
// See that file for reference tables, band ranges, and classification logic.
// DISPLAY LAYER ONLY — none of these functions affect any engine calculation.

// ── v0.6 phenotype classification — display only ─────────────────────────────
//
// phenotypeIndex = vlamax / vo2max
//   Captures the balance between glycolytic power (VLamax) and aerobic capacity (VO2max).
//   A higher ratio → more glycolytic tendency relative to aerobic base.
//
// Thresholds:
//   < 0.006   Aerobic    — aerobic capacity dominates
//   0.006–0.012  Mixed   — balanced metabolic profile
//   > 0.012   Glycolytic — glycolytic capacity dominates
//
// IMPORTANT: display only. Does NOT feed into MLSS, LT1, CP, or any fueling calculation.

function deriveV06PhenotypeDisplay(
  vlamax: number,
  vo2max: number,
): { label: 'Aerobic' | 'Mixed' | 'Glycolytic'; colors: string } {
  const index = vlamax / vo2max;
  if (index < 0.006)  return { label: 'Aerobic',    colors: 'text-green-600 bg-green-50 border-green-200' };
  if (index <= 0.012) return { label: 'Mixed',       colors: 'text-amber-600 bg-amber-50 border-amber-200' };
  return                     { label: 'Glycolytic',  colors: 'text-red-600 bg-red-50 border-red-200' };
}

function LockedCard({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="bg-white rounded-xl p-3 border-l-4 border-violet-200 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-xl font-black text-violet-200 mt-1">––</p>
      <p className="text-xs text-violet-400 font-semibold">Pro · {hint}</p>
    </div>
  );
}

// ── Zone info content ────────────────────────────────────────────────────────

interface ZoneInfoContent {
  purpose:    string;
  physiology: string;
  bestFor:    string;
  note?:      string;
}

const ZONE_INFO: Record<string, ZoneInfoContent> = {
  'Zone 1': {
    purpose:    'Active recovery and circulation',
    physiology: 'Well below LT1 — almost entirely aerobic fat oxidation, near-zero lactate. The nervous system recovers, not the muscles.',
    bestFor:    'Recovery days, warm-ups, cool-downs, easy filler between hard sessions.',
    note:       'If you can feel it working, it is not Zone 1.',
  },
  'Zone 2': {
    purpose:    'Build aerobic base and fat-oxidation capacity',
    physiology: 'Below LT1 — fat is the primary fuel. Lactate stays at baseline. This is where the highest proportion of energy comes from fat.',
    bestFor:    'Long rides, base-building blocks, volume accumulation.',
    note:       'The most underused zone. The majority of an endurance athlete\'s training belongs here.',
  },
  'Zone 3A': {
    purpose:    'Aerobic efficiency at the threshold boundary',
    physiology: 'At or just above LT1 — carbohydrate contribution begins rising. Lactate edges above baseline but remains controlled and clearable.',
    bestFor:    'Focused endurance work, aerobic development sessions, progression rides that stay below tempo.',
  },
  'Zone 3B': {
    purpose:    'Muscular endurance and aerobic durability',
    physiology: 'Clearly above LT1, below LT2 — mixed fuel use, moderate and manageable lactate accumulation. Sustainable for 20–60 min.',
    bestFor:    'Tempo intervals, race-simulation pacing, time-trial preparation.',
  },
  'Zone 4': {
    purpose:    'Work at maximal lactate steady state (LT2 / MLSS)',
    physiology: 'At LT2 — carbohydrate dominates. Lactate is at the highest level that can be sustained without progressive accumulation. This is the threshold.',
    bestFor:    'Threshold intervals (10–30 min), race-pace specificity for events lasting 40 min or more.',
  },
  'Zone 5A': {
    purpose:    'Entry into the severe domain — raise MLSS and tolerance to accumulation',
    physiology: 'Above LT2 — lactate rises progressively and oxygen uptake continues climbing toward VO2max. The body is working to clear accumulation, not just produce energy.',
    bestFor:    '5–12 min intervals just above threshold, forcing upward adaptation of MLSS over training blocks.',
    note:       'Often mislabelled as "threshold plus" — physiologically it is a distinct, harder domain.',
  },
  'Zone 5B': {
    purpose:    'Maximise oxygen uptake and aerobic ceiling',
    physiology: 'At 90–100% of P300 (VO2max power proxy) — carbohydrate fuels nearly all energy. VO2max is reached or closely approached within 3–5 min. Lactate accumulates rapidly.',
    bestFor:    '3–6 min VO2max intervals, cycling VO2max efforts with structured recovery to drive aerobic ceiling adaptations.',
  },
  'Zone 6': {
    purpose:    'Anaerobic capacity and lactate tolerance',
    physiology: 'Above P300 — heavily reliant on anaerobic glycolysis. High VLamax demand. Lactate spikes rapidly. Not sustainable beyond 1–3 min.',
    bestFor:    'Anaerobic capacity repeats, criterium-style surges, race-winning attacks, capacity work in periodised blocks.',
    note:       'High anaerobic training volume raises VLamax, which can suppress LT2 — use deliberately within a structured plan.',
  },
  'Zone 7': {
    purpose:    'Neuromuscular power and maximal sprint output',
    physiology: 'At or near P20 — maximal sprint power driven by phosphocreatine and peak glycolytic rate. Duration measured in seconds. Central nervous system recruitment is at its ceiling.',
    bestFor:    'Sprint training, explosive starts, short maximal efforts under 15 seconds.',
    note:       'Neural adaptations from this zone do not require high volume — quality and full recovery between efforts matter most.',
  },
};

// ── Zone info popover ─────────────────────────────────────────────────────────

function ZoneInfoPopover({ zoneName }: { zoneName: string }) {
  const info    = ZONE_INFO[zoneName];
  const [open, setOpen]   = useState(false);
  const btnRef            = useRef<HTMLButtonElement>(null);
  const popRef            = useRef<HTMLDivElement>(null);
  const id                = useId();

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent | TouchEvent) {
      if (
        btnRef.current?.contains(e.target as Node) ||
        popRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  if (!info) return null;

  return (
    <span className="relative inline-flex items-center shrink-0">
      <button
        ref={btnRef}
        type="button"
        aria-label={`About ${zoneName}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-gray-400 opacity-40 hover:opacity-80 focus:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 transition-opacity"
        tabIndex={0}
      >
        <span className="text-[9px] font-bold leading-none select-none text-gray-700">i</span>
      </button>

      {open && (
        <div
          id={id}
          ref={popRef}
          role="tooltip"
          className="absolute bottom-full right-0 mb-2 z-50 w-64 max-w-[min(16rem,90vw)] bg-gray-900 text-white text-xs leading-relaxed rounded-xl px-3 py-3 shadow-xl pointer-events-auto"
        >
          {/* Arrow */}
          <span
            className="absolute top-full right-2 border-4 border-transparent border-t-gray-900"
            aria-hidden="true"
          />
          <p className="font-black text-white text-[10px] uppercase tracking-wider mb-2">{zoneName}</p>
          <div className="space-y-1.5">
            <div>
              <p className="text-white/50 text-[9px] uppercase tracking-wider leading-none mb-0.5">Purpose</p>
              <p className="text-white/90">{info.purpose}</p>
            </div>
            <div>
              <p className="text-white/50 text-[9px] uppercase tracking-wider leading-none mb-0.5">Physiology</p>
              <p className="text-white/90">{info.physiology}</p>
            </div>
            <div>
              <p className="text-white/50 text-[9px] uppercase tracking-wider leading-none mb-0.5">Best used for</p>
              <p className="text-white/90">{info.bestFor}</p>
            </div>
            {info.note && (
              <p className="text-amber-300/80 italic">{info.note}</p>
            )}
          </div>
        </div>
      )}
    </span>
  );
}

// Zone colour maps — same names/values as InscydResults.tsx (not extracted to avoid coupling)
const ZONE_DOT: Record<string, string> = {
  'Zone 1':  'bg-blue-200',
  'Zone 2':  'bg-blue-500',
  'Zone 3A': 'bg-green-300',
  'Zone 3B': 'bg-green-500',
  'Zone 4':  'bg-yellow-400',
  'Zone 5A': 'bg-orange-500',
  'Zone 5B': 'bg-red-500',
  'Zone 6':  'bg-red-700',
  'Zone 7':  'bg-violet-600',
};

const ZONE_ROW_BG: Record<string, string> = {
  'Zone 1':  'bg-blue-50   hover:bg-blue-100',
  'Zone 2':  'bg-blue-100  hover:bg-blue-200',
  'Zone 3A': 'bg-green-50  hover:bg-green-100',
  'Zone 3B': 'bg-green-100 hover:bg-green-200',
  'Zone 4':  'bg-yellow-50  hover:bg-yellow-100',
  'Zone 5A': 'bg-orange-50  hover:bg-orange-100',
  'Zone 5B': 'bg-red-50     hover:bg-red-100',
  'Zone 6':  'bg-red-100    hover:bg-red-200',
  'Zone 7':  'bg-violet-50  hover:bg-violet-100',
};

export default function ProfilerResultsV06({
  profile, fuelingPrefill, tier, onSendToFueling, name, sex, age, dietType,
}: Props) {
  const { outputs } = profile;
  const { vlamax, vo2max, mlssWatts, lt1Watts, cpWatts } = outputs;
  const isPro = tier === 'pro';

  const [showZoneDetails, setShowZoneDetails] = useState(false);
  const [showStackUp,     setShowStackUp]     = useState(false);
  const [exporting,       setExporting]       = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const handleExportPdf = useCallback(async () => {
    if (!printRef.current) return;
    setExporting(true);
    try {
      const name = sex ? `metabolic-profile-${sex.toLowerCase()}` : 'metabolic-profile';
      await exportToPdf(printRef.current, `${name}.pdf`);
    } finally {
      setExporting(false);
    }
  }, [sex]);
  const zones = isPro
    ? calcV06TrainingZones(lt1Watts, mlssWatts, profile.inputs.p300, profile.inputs.p20)
    : [];

  // Phenotype derived from vlamax/vo2max ratio — display only.
  // fuelingPrefill.phenotype (legacy VLamax threshold) is intentionally not used here.
  const phenoDisplay = deriveV06PhenotypeDisplay(vlamax, vo2max);

  // ── VLamax-aware lactate curve ────────────────────────────────────────────
  // VLamax drives: baseline resting level, lactate at LT2, and curve steepness.
  //
  // vla_ratio = clamp(vlamax / 0.45, 0.5, 1.5)
  // baseline    = 1.0 × (0.8 + 0.4 × vla_ratio)   — resting lactate floor
  // lt2Level    = 3.5 × (0.85 + 0.5 × vla_ratio)  — lactate at LT2
  // steepness   = 2.0 × (0.8 + 0.6 × vla_ratio)   — exponential rate
  //
  // Curve: la(power) = baseline + (lt2Level − baseline) × (exp(s×x) − 1) / (exp(s) − 1)
  //   where x = (power − laMin) / (LT2 − laMin)   [0 at laMin, 1 at LT2]
  //   clamped at baseline — never falls below resting level.
  //
  // Anchoring: laMin → baseline, LT2 → lt2Level exactly. Continues rising past LT2.
  // LT1/LT2 positions are unchanged — only the curve shape responds to VLamax.

  const VLA_REF     = 0.45;
  const CURVE_BASE_K = 2.0;

  const vlaRatio    = Math.min(Math.max(vlamax / VLA_REF, 0.5), 1.5);
  const laBaseline  = 1.0 * (0.8 + 0.4 * vlaRatio);
  const laLt2Level  = 3.5 * (0.95 + 0.15 * vlaRatio);
  const laSteepness = CURVE_BASE_K * (0.8 + 0.6 * vlaRatio);

  // Threshold-centric x-axis range — LT1 and LT2 only, no P300/P20 dependence.
  const laMin   = Math.round(Math.max(0.5 * mlssWatts, 0.9 * lt1Watts));
  const laMax   = Math.round(mlssWatts * 1.10);
  const laRange = mlssWatts - laMin;  // span from curve start to LT2

  function laPoint(power: number): number {
    const x     = (power - laMin) / laRange;           // 0 at laMin, 1 at LT2
    const denom = Math.exp(laSteepness) - 1;           // normalises so LT2 → laLt2Level
    const la    = laBaseline + (laLt2Level - laBaseline) * (Math.exp(laSteepness * x) - 1) / denom;
    return Math.max(laBaseline, la);
  }

  const laData = laRange > 0
    ? Array.from({ length: 60 }, (_, i) => {
        const w = Math.round(laMin + (laMax - laMin) * (i / 59));
        return { w, la: Math.round(laPoint(w) * 100) / 100 };
      })
    : [];

  // Free-tier metric cards (always visible)
  const freeMetrics = [
    { label: 'VLamax', value: vlamax.toFixed(3), unit: 'mmol/L/s',   color: 'border-red-500' },
    { label: 'VO2max', value: vo2max.toFixed(1), unit: 'ml/kg/min',  color: 'border-blue-500' },
    // CP is derived from MLSS for display only — labelled explicitly to prevent misinterpretation.
    { label: 'CP',     value: Math.round(cpWatts), unit: 'W · display only', color: 'border-purple-500' },
  ];

  // Pro-gated metric cards
  const proMetrics = [
    { label: 'LT2', value: Math.round(mlssWatts), unit: 'W', color: 'border-orange-500' },
    { label: 'LT1', value: Math.round(lt1Watts),  unit: 'W', color: 'border-green-500' },
  ];

  return (
    <div className="space-y-6">

      {/* ── Athlete context header + Export PDF ────────────────────── */}
      <div className="flex items-center gap-2 text-xs text-gray-500 pb-1 border-b border-gray-100 min-w-0">
        {name && name !== 'Athlete' && (
          <span className="font-semibold text-gray-700 truncate min-w-0">{name}</span>
        )}
        {sex && (
          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0">{sex}</span>
        )}
        {age && (
          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0">{age} yrs</span>
        )}
        <button
          onClick={handleExportPdf}
          disabled={exporting}
          className="ml-auto shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
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

      {/* ── Metric cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">

        {/* Free metrics */}
        {freeMetrics.map(m => (
          <div key={m.label} className={`bg-white rounded-xl p-3 border-l-4 shadow-sm ${m.color}`}>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-0.5">
              {m.label}
              {(m.label === 'VLamax' || m.label === 'VO2max') && <InfoTooltip term={m.label} />}
            </p>
            <p className="text-xl font-black text-gray-900 mt-1">{m.value}</p>
            <p className="text-xs text-gray-400">{m.unit}</p>
          </div>
        ))}

        {/* Pro-gated thresholds */}
        {isPro ? (
          proMetrics.map(m => (
            <div key={m.label} className={`bg-white rounded-xl p-3 border-l-4 shadow-sm ${m.color}`}>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-0.5">
                {m.label}
                <InfoTooltip term={m.label as 'LT1' | 'LT2'} />
              </p>
              <p className="text-xl font-black text-gray-900 mt-1">{m.value}</p>
              <p className="text-xs text-gray-400">{m.unit}</p>
            </div>
          ))
        ) : (
          <>
            <LockedCard label="LT1" hint="aerobic threshold" />
            <LockedCard label="LT2" hint="anaerobic threshold" />
          </>
        )}

        {/* Phenotype — ratio-based (vlamax / vo2max), display only */}
        <div className={`bg-white rounded-xl p-3 border shadow-sm ${phenoDisplay.colors}`}>
          <p className="text-xs font-bold uppercase tracking-wider">Phenotype</p>
          <p className="text-sm font-black mt-1">{phenoDisplay.label}</p>
          <p className="text-xs">metabolic tendency</p>
        </div>

      </div>

      {/* ── Pro upgrade prompt ──────────────────────────────────────── */}
      {!isPro && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex items-start gap-4">
          <div className="flex-1">
            <p className="text-sm font-bold text-violet-900">Your thresholds are calculated — unlock them with Pro</p>
            <p className="text-xs text-violet-700 mt-1">
              LT1, LT2, and personalised training zones are ready. Subscribe to reveal them, rerun your profile after each training block, and track how your thresholds change over time.
            </p>
          </div>
          <Link
            href="/pricing"
            className="shrink-0 px-4 py-2 bg-violet-600 text-white text-xs font-black rounded-lg hover:bg-violet-700 transition"
          >
            Unlock →
          </Link>
        </div>
      )}

      {/* ── Lactate curve ──────────────────────────────────────────── */}
      {/* Shape responds to VLamax — baseline, LT2 level, and steepness are all VLamax-driven. */}
      {/* LT1 / LT2 positions are unchanged. Reference lines are Pro-gated. */}
      {(() => {
        // Shared chart — rendered at two sizes: card (200 px) and modal (380 px).
        function LactateChart({ height }: { height: number }) {
          return (
            <ResponsiveContainer width="100%" height={height}>
              <LineChart data={laData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="w" type="number" domain={['dataMin', 'dataMax']} tick={{ fontSize: 10 }} label={{ value: 'W', position: 'insideBottomRight', offset: -5, fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0.5, 'auto']} label={{ value: 'mmol/L', angle: -90, position: 'insideLeft', fontSize: 9 }} />
                <Tooltip formatter={(v) => [`${Number(v)} mmol/L`, 'Lactate']} />
                {isPro && <ReferenceLine x={Math.round(lt1Watts)}  stroke="#27ae60" strokeDasharray="4 4" label={{ value: 'LT1', position: 'insideTopRight', fontSize: 9, fill: '#27ae60' }} />}
                {isPro && <ReferenceLine x={Math.round(mlssWatts)} stroke="#f57c00" strokeDasharray="4 4" label={{ value: 'LT2', position: 'insideTopRight', fontSize: 9, fill: '#f57c00' }} />}
                <Line dataKey="la" stroke="#e53935" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          );
        }

        function LactateCurveCard() {
          const [expanded, setExpanded] = useState(false);
          const backdropRef = useRef<HTMLDivElement>(null);

          useEffect(() => {
            if (!expanded) return;
            function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setExpanded(false); }
            document.addEventListener('keydown', onKey);
            return () => document.removeEventListener('keydown', onKey);
          }, [expanded]);

          return (
            <>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-gray-800">Lactate Accumulation Curve</h3>
                  {laRange > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpanded(true)}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition"
                      aria-label="Expand lactate curve"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
                      </svg>
                      Expand
                    </button>
                  )}
                </div>
                {laRange > 0 ? (
                  <>
                    <LactateChart height={200} />
                    {!isPro && (
                      <p className="text-xs text-center text-gray-400 mt-2">LT1 and LT2 markers visible on Pro</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-400 text-center py-8">Lactate curve unavailable for this input combination.</p>
                )}
              </div>

              {/* Expanded modal */}
              {expanded && (
                <div
                  ref={backdropRef}
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                  onMouseDown={(e) => { if (e.target === backdropRef.current) setExpanded(false); }}
                >
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold text-gray-800">Lactate Accumulation Curve</h3>
                      <button
                        type="button"
                        onClick={() => setExpanded(false)}
                        className="text-xs text-gray-400 hover:text-gray-700 transition"
                        aria-label="Close expanded chart"
                      >
                        ✕ Close
                      </button>
                    </div>
                    <LactateChart height={380} />
                    {!isPro && (
                      <p className="text-xs text-center text-gray-400 mt-2">LT1 and LT2 markers visible on Pro</p>
                    )}
                  </div>
                </div>
              )}
            </>
          );
        }

        return <LactateCurveCard />;
      })()}

      {/* ── See How I Stack Up ────────────────────────────────────── */}
      {(() => {
        const weightKg = profile.inputs.weightKg;
        const lt2Wkg   = mlssWatts / weightKg;

        // All classification via lib/benchmarks/athleteBenchmarks — display only
        const vo2Cls = classifyVO2max(vo2max, sex);
        const vlaCls = classifyVlamax(vlamax, sex);
        const lt2Cls = classifyLT2Wkg(lt2Wkg);

        return (
          <div className="rounded-xl border border-gray-200 shadow-sm bg-white">
            <div className="flex items-center gap-3 px-4 py-3">
              <p className="text-sm font-bold text-gray-800">See How I Stack Up</p>
              <span className="text-xs text-gray-400 hidden sm:inline">Key physiological determinants of performance and fueling</span>
              {sex && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                  {sex}{age ? ` · ${age} yrs` : ''}
                </span>
              )}
              <button
                onClick={() => setShowStackUp(v => !v)}
                className="ml-auto text-xs font-semibold text-gray-500 hover:text-gray-800 transition shrink-0"
              >
                {showStackUp ? 'Hide ↑' : 'Details ↓'}
              </button>
            </div>

            {showStackUp && (
              <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
                <p className="text-xs text-gray-400">
                  Contextual comparison only — does not affect calculations.
                  {sex
                    ? <> Shown for <span className="font-medium text-gray-600">{sex}</span>.</>
                    : ' No sex selected — using general reference bands.'}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

                  {/* VLamax */}
                  <div className="rounded-lg border p-3 bg-gray-50">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 flex items-center">
                      VLamax<InfoTooltip term="VLamax" />
                    </p>
                    <p className="text-xl font-black text-gray-900">
                      {vlamax.toFixed(3)}<span className="text-sm font-semibold ml-1">mmol/L/s</span>
                    </p>
                    <span className={`inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded border ${vlaCls.color}`}>
                      {vlaCls.category}
                    </span>
                  </div>

                  {/* VO2max */}
                  <div className="rounded-lg border p-3 bg-gray-50">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 flex items-center">
                      VO2max<InfoTooltip term="VO2max" />
                    </p>
                    <p className="text-xl font-black text-gray-900">
                      {vo2max.toFixed(1)}<span className="text-sm font-semibold ml-1">ml/kg/min</span>
                    </p>
                    <span className={`inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded border ${vo2Cls.color}`}>
                      {vo2Cls.category}
                    </span>
                  </div>

                  {/* LT2 W/kg */}
                  <div className="rounded-lg border p-3 bg-gray-50">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 flex items-center">
                      LT2<InfoTooltip term="LT2" />
                    </p>
                    <p className="text-xl font-black text-gray-900">
                      {lt2Wkg.toFixed(2)}<span className="text-sm font-semibold ml-1">W/kg</span>
                    </p>
                    <span className={`inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded border ${lt2Cls.color}`}>
                      {lt2Cls.category}
                    </span>
                  </div>

                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Fueling snapshot (free users) — reuses existing component unchanged ── */}
      {!isPro && <FuelingSnapshot mlss={mlssWatts} />}

      {/* ── Training zones ─────────────────────────────────────────── */}
      {/* Pro-gated — anchored to LT1, LT2, P300, P20 (no CP, no W′). */}
      {isPro ? (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-800 mb-3">Training Zones</h3>

          {/* Zone rows */}
          <div className="flex flex-col gap-1">
            {zones.map(z => {
              const dot = ZONE_DOT[z.name] ?? 'bg-gray-400';
              const row = ZONE_ROW_BG[z.name] ?? 'bg-gray-50 hover:bg-gray-100';
              return (
                <div key={z.name} className={`flex items-center gap-3 rounded-lg px-4 py-2.5 transition-colors ${row}`}>
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
                  <span className="text-xs font-black text-gray-700 w-14 shrink-0">{z.name}</span>
                  <span className="text-xs text-gray-500 flex-1">{z.label}</span>
                  <ZoneInfoPopover zoneName={z.name} />
                  <span className="text-sm font-bold text-gray-800 tabular-nums ml-2">{Math.round(z.low)}–{Math.round(z.high)} W</span>
                </div>
              );
            })}
          </div>

          {/* Zone details toggle */}
          <button
            onClick={() => setShowZoneDetails(v => !v)}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {showZoneDetails ? 'Hide Zone Details' : 'View Zone Details'}
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${showZoneDetails ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Zone details panel */}
          {showZoneDetails && (
            <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">

              {/* Training anchors */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Training Anchors</p>
                <div className="space-y-1">
                  {[
                    { label: 'LT1',  value: Math.round(lt1Watts),            desc: 'Aerobic threshold' },
                    { label: 'LT2',  value: Math.round(mlssWatts),           desc: 'Maximal lactate steady state' },
                    { label: 'P300', value: Math.round(profile.inputs.p300), desc: 'VO2max power anchor (5-min)' },
                    { label: 'P20',  value: Math.round(profile.inputs.p20),  desc: 'Sprint anchor (20-sec)' },
                  ].map(a => (
                    <div key={a.label} className="flex items-baseline gap-2 py-1.5 border-b border-gray-50">
                      <span className="text-xs font-black text-gray-700 w-16 shrink-0 flex items-center">
                        {a.label}
                        {(a.label === 'LT1' || a.label === 'LT2') && <InfoTooltip term={a.label as 'LT1' | 'LT2'} />}
                      </span>
                      <span className="text-sm font-bold text-gray-900 tabular-nums w-16 shrink-0">{a.value} W</span>
                      <span className="text-xs text-gray-400">{a.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* How zones are derived */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">How zones are derived</p>
                <div className="space-y-1.5">
                  {[
                    { zone: 'Zone 1',  rule: '0–80% LT1 — recovery / very easy aerobic work' },
                    { zone: 'Zone 2',  rule: '80–100% LT1 — basic endurance' },
                    { zone: 'Zone 3A', rule: '100–110% LT1 — aerobic threshold work' },
                    { zone: 'Zone 3B', rule: '110% LT1 to 90% LT2 — tempo / focused endurance' },
                    { zone: 'Zone 4',  rule: '90–100% LT2 — threshold (maximal steady state)' },
                    { zone: 'Zone 5A', rule: 'LT2 to 90% P300 — sub-VO2max bridge (shown only when gap exists)' },
                    { zone: 'Zone 5B', rule: '90–100% P300 — VO2max zone' },
                    { zone: 'Zone 6',  rule: 'P300 to 90% P20 — anaerobic capacity (shown only when gap exists)' },
                    { zone: 'Zone 7',  rule: '90% P20 → P20 — neuromuscular / sprint' },
                  ].map(r => (
                    <div key={r.zone} className="flex gap-2">
                      <span className="text-xs font-bold text-gray-600 w-16 shrink-0">{r.zone}</span>
                      <span className="text-xs text-gray-400 leading-relaxed">{r.rule}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-dashed border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-400">Training Zones</h3>
            <Link href="/pricing" className="text-xs font-bold text-violet-600 hover:underline">
              Unlock with Pro →
            </Link>
          </div>
          <div className="flex flex-col gap-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg px-4 py-2.5 bg-gray-50 opacity-40">
                <span className="w-2.5 h-2.5 rounded-full bg-gray-300 shrink-0" />
                <span className="text-xs font-black text-gray-300 w-14 shrink-0">Zone {i + 1}</span>
                <span className="flex-1" />
                <span className="text-sm font-bold text-gray-300 tabular-nums">––– W</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CTA ────────────────────────────────────────────────────── */}
      {isPro ? (
        <div className="bg-gradient-to-r from-violet-600 to-blue-600 rounded-xl p-5 text-white">
          <h3 className="font-bold text-base">Next: race nutrition planning</h3>
          <p className="text-sm opacity-80 mt-1">
            Use your LT2 and VLamax to model substrate oxidation and get personalised fueling recommendations for any race or session.
          </p>
          <button
            onClick={onSendToFueling}
            className="mt-3 px-5 py-2 bg-white text-violet-700 font-bold rounded-lg text-sm hover:bg-violet-50 transition"
          >
            Open Fueling Sense →
          </button>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-violet-600 to-blue-600 rounded-xl p-5 text-white">
          <h3 className="font-bold text-base">This isn't a one-off test</h3>
          <p className="text-sm opacity-80 mt-1">
            Pro gives you ongoing access. Rerun after every training block, see how LT1 and LT2 shift, and watch your zones update as your fitness changes.
          </p>
          <Link
            href="/pricing"
            className="inline-block mt-3 px-5 py-2 bg-white text-violet-700 font-bold rounded-lg text-sm hover:bg-violet-50 transition"
          >
            See Pro plans →
          </Link>
        </div>
      )}

      {/* Hidden print view — off-screen, always rendered so html2canvas can capture it */}
      <div
        ref={printRef}
        style={{ position: 'fixed', top: 0, left: -9999, width: 794, pointerEvents: 'none', zIndex: -1 }}
        aria-hidden="true"
      >
        <ProfilerPrintView
          profile={profile}
          name={name}
          sex={sex}
          age={age}
          dietType={dietType}
          isPro={isPro}
          laData={laData}
          zones={zones}
          phenotypeLabel={phenoDisplay.label}
        />
      </div>

    </div>
  );
}
