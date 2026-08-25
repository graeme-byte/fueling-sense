'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { RunningMetabolicProfile } from '@/lib/engine/runningTypes';
import { formatPace } from '@/lib/engine/runningMetabolicEngine';
import { buildRunningProfilerZones } from '@/lib/engine/runningZones';
import RunningZonesTable from './RunningZonesTable';
import InfoTooltip from '@/components/shared/InfoTooltip';
import Link from 'next/link';
import { exportRunningProfilePDF } from '@/lib/pdf/exportRunningProfile';
import SaveAccountPrompt from '@/components/SaveAccountPrompt';

interface Props {
  profile:          RunningMetabolicProfile;
  onSendToFueling:  () => void;
  name?:            string;
  onSaveToProfile?: () => void;
  saveState?:       'idle' | 'saving' | 'saved' | 'error';
  hasSavedProfile?: boolean;
  isLoggedIn?:      boolean;
  onCreateAccount?: () => void;
}

function MetricCard({
  label, value, unit, color = 'border-gray-200', tooltipTerm,
}: { label: string; value: string; unit?: string; color?: string; tooltipTerm?: string }) {
  return (
    <div className={`bg-white rounded-xl p-3 border-l-4 shadow-sm ${color}`}>
      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-0.5">
        {label}
        {tooltipTerm && <InfoTooltip term={tooltipTerm as Parameters<typeof InfoTooltip>[0]['term']} />}
      </p>
      <p className="text-xl font-black text-gray-900 mt-1">{value}</p>
      {unit && <p className="text-xs text-gray-400">{unit}</p>}
    </div>
  );
}

function FlagBadge({ level, message }: { level: 'info' | 'warn' | 'error'; message: string }) {
  const cls = {
    info:  'bg-blue-50 border-blue-200 text-blue-800',
    warn:  'bg-amber-50 border-amber-200 text-amber-800',
    error: 'bg-red-50 border-red-200 text-red-800',
  }[level];
  return (
    <div className={`p-3 border rounded-lg text-xs leading-relaxed ${cls}`}>
      <span className="font-bold uppercase mr-1">{level}:</span>
      {message}
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// Simulated run lactate — illustrative only, VLamax-shaped.
//
// Uses the same normalised-exponential as the bike profiler (ProfilerResultsV06.tsx):
//   la(speed) = baseline + (lt2Level − baseline) × (exp(k×x) − 1) / (exp(k) − 1)
//   where x = (speed − lowerSpeed) / (lt2 − lowerSpeed)   [0 at left edge, 1 at LT2]
//
// Anchors: lowerSpeed → laBaseline exactly; lt2 → laLt2Level exactly.
// Extrapolates smoothly past LT2 — no piecewise kinks.
// LT1 is rendered as a reference line at its actual position, not a curve breakpoint.
//
// VLamax shapes all three parameters (same coefficients as bike):
//   vlaRatio = clamp(vla / 0.45, 0.5, 1.5)
//   laBaseline  = 1.0 × (0.8 + 0.4 × vlaRatio)   — resting floor
//   laLt2Level  = 3.5 × (0.95 + 0.15 × vlaRatio)  — lactate at LT2
//   laSteepness = 2.0 × (0.8 + 0.6 × vlaRatio)    — exponential rate
const VLA_REF      = 0.45;
const CURVE_BASE_K = 2.0;

function simulatedRunLactate(speed: number, lowerSpeed: number, lt2: number, vla: number): number {
  const vlaRatio    = clamp(vla / VLA_REF, 0.5, 1.5);
  const laBaseline  = 1.0 * (0.8 + 0.4 * vlaRatio);
  const laLt2Level  = 3.5 * (0.95 + 0.15 * vlaRatio);
  const laSteepness = CURVE_BASE_K * (0.8 + 0.6 * vlaRatio);

  const x     = (speed - lowerSpeed) / (lt2 - lowerSpeed);   // 0 at lowerSpeed, 1 at lt2
  const denom = Math.exp(laSteepness) - 1;
  const la    = laBaseline + (laLt2Level - laBaseline) * (Math.exp(laSteepness * x) - 1) / denom;
  return Math.max(laBaseline, la);
}

// ── Lactate chart ─────────────────────────────────────────────────────────────

interface LatticeData { speed: number; la: number }
interface LactateChartProps {
  height:      number;
  laData:      LatticeData[];
  lt1:         number;
  lt2:         number;
  vVO2?:       number;
  lowerSpeed:  number;
  upperSpeed:  number;
}

function LactateChart({ height, laData, lt1, lt2, vVO2, lowerSpeed, upperSpeed }: LactateChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={laData} margin={{ top: 12, right: 12, left: 0, bottom: 28 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="speed"
          type="number"
          domain={[lowerSpeed, upperSpeed]}
          tickCount={6}
          tickFormatter={(v: number) => formatPace(v)}
          label={{ value: 'Pace (min/km)', position: 'insideBottom', offset: -16, fontSize: 9, fill: '#9ca3af' }}
          tick={{ fontSize: 9 }}
          height={40}
        />
        <YAxis
          domain={[0, 8]}
          tick={{ fontSize: 10 }}
          label={{ value: 'mmol/L', angle: -90, position: 'insideLeft', fontSize: 9 }}
        />
        <Tooltip
          labelFormatter={(v) => `Pace: ${formatPace(Number(v))}`}
          formatter={(v) => [`${Number(v).toFixed(1)} mmol/L`, 'Lactate']}
        />
        <ReferenceLine
          x={lt1} stroke="#10b981" strokeDasharray="4 3"
          label={{ value: `LT1 ${formatPace(lt1)}`, position: 'insideTopRight', fontSize: 8, fill: '#10b981' }}
        />
        <ReferenceLine
          x={lt2} stroke="#f97316" strokeDasharray="4 3"
          label={{ value: `LT2 ${formatPace(lt2)}`, position: 'insideTopRight', fontSize: 8, fill: '#f97316' }}
        />
        {vVO2 !== undefined && vVO2 > 0 && vVO2 >= lowerSpeed && vVO2 <= upperSpeed && (
          <ReferenceLine
            x={vVO2} stroke="#7c3aed" strokeDasharray="3 2" strokeOpacity={0.6}
            label={{ value: `vVO2 ${formatPace(vVO2)}`, position: 'insideTopRight', fontSize: 8, fill: '#7c3aed' }}
          />
        )}
        <Line dataKey="la" stroke="#e53935" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function LactateCurveCard(props: Omit<LactateChartProps, 'height'>) {
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
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="text-sm font-bold text-gray-800">Lactate Accumulation Curve</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Simulated from profile outputs for illustration. Not a measured lactate test.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition shrink-0"
            aria-label="Expand lactate curve"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
            </svg>
            Expand
          </button>
        </div>
        <LactateChart {...props} height={220} />
      </div>

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
            <LactateChart {...props} height={380} />
            <p className="text-xs text-center text-gray-400 mt-2">
              Simulated from profile outputs for illustration. Not a measured lactate test.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RunningProfilerResults({
  profile, onSendToFueling, name,
  onSaveToProfile, saveState = 'idle', hasSavedProfile = false, isLoggedIn = false,
  onCreateAccount,
}: Props) {
  const { primary, derived, classification, confidenceFlags } = profile;
  const [showZoneDetails, setShowZoneDetails] = useState(false);
  const [exporting,       setExporting]       = useState(false);

  // Build bike-aligned profiler zones from the physiological anchors.
  // profile.zones retains the substrate-rich fueling zones for backward compat.
  const profilerZones = useMemo(() => buildRunningProfilerZones(
    primary.lt1SpeedMs,
    primary.mlssSpeedMs,
    derived.vVO2maxSpeedMs,
    profile.speeds.s20,
  ), [primary.lt1SpeedMs, primary.mlssSpeedMs, derived.vVO2maxSpeedMs, profile.speeds.s20]);

  const handleExportPdf = useCallback(() => {
    setExporting(true);
    try {
      const athleteName = name && name !== 'Athlete' ? name : 'Athlete';
      exportRunningProfilePDF(profile, athleteName, profilerZones);
    } finally {
      setExporting(false);
    }
  }, [name, profile, profilerZones]);

  const errorFlags = confidenceFlags.filter(f => f.level === 'error');
  const warnFlags  = confidenceFlags.filter(f => f.level === 'warn');
  const infoFlags  = confidenceFlags.filter(f => f.level === 'info');

  // Lactate chart parameters
  const lt1  = primary.lt1SpeedMs;
  const lt2  = primary.mlssSpeedMs;   // mlss = LT2 by definition
  const vla  = primary.vlamaxMmolLS;
  const vVO2 = derived.vVO2maxSpeedMs;

  const lowerSpeed = Math.max(2.0, lt1 * 0.70, lt2 * 0.50);
  const upperSpeed = Math.max(lt2 * 1.15, vVO2 > 0 ? vVO2 * 1.02 : lt2 * 1.15);

  const laData: LatticeData[] = [];
  for (let v = lowerSpeed; v <= upperSpeed + 1e-6; v += 0.05) {
    const speed = Math.round(v * 100) / 100;
    laData.push({ speed, la: Math.round(simulatedRunLactate(speed, lowerSpeed, lt2, vla) * 100) / 100 });
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            {name ? `${name} — Running Profile` : 'Running Metabolic Profile'}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {classification.type} · VO2max {primary.vo2maxMlKgMin.toFixed(1)} mL/kg/min ·
            VLamax {primary.vlamaxMmolLS.toFixed(2)} mmol/L/s
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onSendToFueling}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition"
          >
            Open Running Fueling →
          </button>
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
      </div>

      {/* Confidence flags */}
      {(errorFlags.length > 0 || warnFlags.length > 0 || infoFlags.length > 0) && (
        <div className="space-y-2">
          {[...errorFlags, ...warnFlags, ...infoFlags].map((f, i) => (
            <FlagBadge key={i} level={f.level} message={f.message} />
          ))}
        </div>
      )}

      {/* Primary metric cards — VLamax, VO2max, LT2, LT1, Athlete Type */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <MetricCard label="VLamax" value={primary.vlamaxMmolLS.toFixed(3)} unit="mmol/L/s" color="border-red-500" tooltipTerm="VLamax" />
        <MetricCard label="VO2max" value={primary.vo2maxMlKgMin.toFixed(1)} unit="mL/kg/min" color="border-blue-500" tooltipTerm="VO2max" />
        <MetricCard label="LT2 Pace" value={primary.mlssPace} unit="min/km" color="border-orange-500" tooltipTerm="LT2 Pace" />
        <MetricCard label="LT1 Pace" value={primary.lt1Pace} unit="min/km" color="border-green-500" tooltipTerm="LT1 Pace" />
        {/* Athlete type — matches bike phenotype card style */}
        <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-0.5">
            Athlete Type
            <InfoTooltip term="Athlete Type" />
          </p>
          <p className="text-sm font-black text-emerald-900 mt-1">{classification.type}</p>
          <p className="text-xs text-emerald-700 leading-snug mt-0.5">metabolic tendency</p>
        </div>
      </div>

      {/* ── Save-account offer — logged-out users only ──────────────── */}
      {!isLoggedIn && onCreateAccount && (
        <SaveAccountPrompt
          headline="Save this profile"
          body="Create a free account to keep this result — reload it anytime without retesting, and use it to prefill your fueling plan."
          onCreateAccount={onCreateAccount}
        />
      )}

      {/* Simulated lactate curve — replaces substrate chart on profiler page */}
      <LactateCurveCard
        laData={laData}
        lt1={lt1}
        lt2={lt2}
        vVO2={vVO2 > 0 ? vVO2 : undefined}
        lowerSpeed={lowerSpeed}
        upperSpeed={upperSpeed}
      />

      {/* Training zones */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Training Zones</h3>
          <RunningZonesTable zones={profilerZones} />

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
                    { label: 'LT1',      value: primary.lt1Pace,            unit: '/km', desc: 'Aerobic threshold',        tooltipTerm: 'LT1 Pace' as const },
                    { label: 'LT2',      value: primary.mlssPace,           unit: '/km', desc: 'Maximal lactate steady state', tooltipTerm: 'LT2 Pace' as const },
                    { label: 'vVO2max',  value: derived.vVO2maxPace,        unit: '/km', desc: 'VO2max speed anchor' },
                    { label: 'Sprint',   value: formatPace(profile.speeds.s20), unit: '/km', desc: 'Sprint anchor (20-sec)' },
                  ].map(a => (
                    <div key={a.label} className="flex items-baseline gap-2 py-1.5 border-b border-gray-50">
                      <span className="text-xs font-black text-gray-700 w-16 shrink-0 flex items-center">
                        {a.label}
                        {a.tooltipTerm && <InfoTooltip term={a.tooltipTerm} />}
                      </span>
                      <span className="text-sm font-bold text-gray-900 tabular-nums w-20 shrink-0">{a.value}</span>
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
                    { zone: 'Zone 2',  rule: '80–100% LT1 — base endurance' },
                    { zone: 'Zone 3A', rule: '100–110% LT1 — aerobic threshold work' },
                    { zone: 'Zone 3B', rule: '110% LT1 to 90% LT2 — tempo / focused endurance (shown only when gap exists)' },
                    { zone: 'Zone 4',  rule: '90–100% LT2 — threshold (maximal lactate steady state)' },
                    { zone: 'Zone 5A', rule: 'LT2 to 90% vVO2max — sub-VO2max bridge (shown only when gap exists)' },
                    { zone: 'Zone 5B', rule: '90–100% vVO2max — VO2max zone' },
                    { zone: 'Zone 6',  rule: 'vVO2max to 90% sprint — anaerobic capacity (shown only when gap exists)' },
                    { zone: 'Zone 7',  rule: '90% sprint → sprint — neuromuscular / sprint' },
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

      {/* CTA */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl p-5 text-white">
          <h3 className="font-bold text-base">Next: race nutrition planning</h3>
          <p className="text-sm opacity-80 mt-1">
            Use your LT2 and VLamax to model substrate oxidation and get personalised fueling recommendations for any race or session.
          </p>
          <button
            onClick={onSendToFueling}
            className="mt-3 px-5 py-2 bg-white text-emerald-700 font-bold rounded-lg text-sm hover:bg-emerald-50 transition"
          >
            Open Running Fueling →
          </button>
        </div>

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
