'use client';

import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { InscydResult, SubscriptionTier } from '@/lib/types';
import { lactateCurve } from '@/lib/engine/inscydEngine';
import { exportProfilePDF } from '@/lib/pdf/exportProfile';
import PerformanceProfile from './PerformanceProfile';
import FuelingSnapshot from './FuelingSnapshot';
import Link from 'next/link';
import InfoTooltip from '@/components/shared/InfoTooltip';

interface Props {
  result:          InscydResult;
  savedId:         string | null;
  tier:            SubscriptionTier;
  onSendToFueling: () => void;
}

const PHENOTYPE_COLORS: Record<string, string> = {
  Endurance: 'text-green-600 bg-green-50 border-green-200',
  Balanced:  'text-amber-600 bg-amber-50 border-amber-200',
  Sprinter:  'text-red-600 bg-red-50 border-red-200',
};

// Dot fill color + row background per zone name
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

function LockedCard({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="bg-white rounded-xl p-3 border-l-4 border-violet-200 shadow-sm relative">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-xl font-black text-violet-200 mt-1">––</p>
      <p className="text-xs text-violet-400 font-semibold">Pro · {hint}</p>
    </div>
  );
}

export default function InscydResults({ result, savedId, tier, onSendToFueling }: Props) {
  const { vo2max, vlamax, cp, wPrime, mlss, lt1, phenotype, zones, lactate } = result;
  const isPro = tier === 'pro';
  const [showZoneDetails, setShowZoneDetails] = useState(false);
  const [showModal,       setShowModal]       = useState(false);
  const [exported,        setExported]        = useState(false);

  function handleExport() {
    exportProfilePDF(result, tier);
    setExported(true);
  }

  function handleOpenFueling() {
    setShowModal(false);
    setExported(false);
    onSendToFueling();
  }

  // Power-Duration curve data (5s to 3600s)
  const durations = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 480, 720, 1200, 1800, 3600];
  const pdData = durations.map(t => ({
    t,
    tLabel: t < 60 ? `${t}s` : `${Math.round(t/60)}m`,
    power: Math.round(cp + wPrime / t),
  }));

  // Lactate curve data
  const laData = lactate
    ? Array.from({ length: 60 }, (_, i) => {
        const w = Math.round(lt1 * 0.4 + (mlss * 1.3 - lt1 * 0.4) * (i / 59));
        return { w, la: Math.round(lactateCurve(w, lactate) * 100) / 100 };
      })
    : [];

  // Free metrics — always visible
  const freeMetrics = [
    { label: 'VLamax', value: vlamax.toFixed(3), unit: 'mmol/L/s',  color: 'border-red-500' },
    { label: 'VO2max', value: vo2max.toFixed(1), unit: 'ml/kg/min', color: 'border-blue-500' },
    { label: 'CP',     value: Math.round(cp),    unit: 'W',         color: 'border-purple-500' },
    { label: "W'",     value: (wPrime/1000).toFixed(1), unit: 'kJ', color: 'border-cyan-500' },
  ];

  // Pro metrics — locked for free users
  const proMetrics = [
    { label: 'LT2', value: Math.round(mlss), unit: 'W', color: 'border-orange-500' },
    { label: 'LT1', value: Math.round(lt1),  unit: 'W', color: 'border-green-500' },
  ];

  return (
    <div className="space-y-6">

      {/* Top bar */}
      <div className="flex items-center justify-end">
        {isPro && (
          <button
            onClick={() => exportProfilePDF(result, tier)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-violet-700 border border-violet-200 rounded-lg bg-white hover:bg-violet-50 transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-8m0 8l-3-3m3 3l3-3M4 20h16" />
            </svg>
            Export as PDF
          </button>
        )}
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {freeMetrics.map(m => (
          <div key={m.label} className={`bg-white rounded-xl p-3 border-l-4 shadow-sm ${m.color}`}>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center">
              {m.label}
              {(m.label === 'VLamax' || m.label === 'VO2max') && <InfoTooltip term={m.label} />}
            </p>
            <p className="text-xl font-black text-gray-900 mt-1">{m.value}</p>
            <p className="text-xs text-gray-400">{m.unit}</p>
          </div>
        ))}

        {isPro ? (
          proMetrics.map(m => (
            <div key={m.label} className={`bg-white rounded-xl p-3 border-l-4 shadow-sm ${m.color}`}>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center">
                {m.label}
                {(m.label === 'LT1' || m.label === 'LT2') && <InfoTooltip term={m.label} />}
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

        {/* Phenotype — always shown */}
        <div className={`bg-white rounded-xl p-3 border shadow-sm ${PHENOTYPE_COLORS[phenotype]}`}>
          <p className="text-xs font-bold uppercase tracking-wider">Phenotype</p>
          <p className="text-sm font-black mt-1">{phenotype}</p>
          <p className="text-xs">classification</p>
        </div>
      </div>

      {/* Upgrade prompt for free users */}
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

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4">

        {/* Power-Duration curve — always shown */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-800 mb-3">Power–Duration Curve</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={pdData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="tLabel" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
              <Tooltip formatter={(v) => [`${Number(v)} W`, 'Power']} />
              <ReferenceLine y={cp} stroke="#7c3aed" strokeDasharray="4 4" label={{ value: `CP ${Math.round(cp)}W`, fontSize: 9, fill: '#7c3aed' }} />
              <Line dataKey="power" stroke="#2563eb" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Lactate curve — reference lines locked for free */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-800 mb-3">Lactate Accumulation Curve</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={laData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="w" tick={{ fontSize: 10 }} label={{ value: 'W', position: 'insideBottomRight', offset: -5, fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[0.5, 'auto']} label={{ value: 'mmol/L', angle: -90, position: 'insideLeft', fontSize: 9 }} />
              <Tooltip formatter={(v) => [`${Number(v)} mmol/L`, 'Lactate']} />
              {isPro && <ReferenceLine x={lt1}  stroke="#27ae60" strokeDasharray="4 4" label={{ value: 'LT1', fontSize: 9, fill: '#27ae60' }} />}
              {isPro && <ReferenceLine x={mlss} stroke="#f57c00" strokeDasharray="4 4" label={{ value: 'LT2', fontSize: 9, fill: '#f57c00' }} />}
              <Line dataKey="la" stroke="#e53935" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          {!isPro && (
            <p className="text-xs text-center text-gray-400 mt-2">LT1 and LT2 markers visible on Pro</p>
          )}
        </div>
      </div>

      {/* Training zones — Pro only */}
      {isPro ? (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-800 mb-3">Training Zones</h3>

          {/* Primary: vertical color-coded rows */}
          <div className="flex flex-col gap-1">
            {zones.map(z => {
              const dot = ZONE_DOT[z.name] ?? 'bg-gray-400';
              const row = ZONE_ROW_BG[z.name] ?? 'bg-gray-50 hover:bg-gray-100';
              return (
                <div key={z.name} className={`flex items-center gap-3 rounded-lg px-4 py-2.5 transition-colors ${row}`}>
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
                  <span className="text-xs font-black text-gray-700 w-14 shrink-0">{z.name}</span>
                  <span className="text-xs text-gray-500 flex-1">{z.label}</span>
                  <span className="text-sm font-bold text-gray-800 tabular-nums">{Math.round(z.low)}–{Math.round(z.high)} W</span>
                </div>
              );
            })}
          </div>

          {/* Zone details toggle — below list */}
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

          {/* Secondary: physiological anchor panel */}
          {showZoneDetails && (
            <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">

              {/* Training Anchors */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Training Anchors</p>
                <div className="space-y-1">
                  {[
                    { label: 'LT1',       value: Math.round(lt1),                              desc: 'Aerobic threshold' },
                    { label: 'LT2',       value: Math.round(mlss),                             desc: 'Maximal lactate steady state' },
                    { label: 'VO2max',    value: result.ppo ? Math.round(result.ppo) : '—',    desc: 'Peak aerobic power anchor' },
                    { label: 'P20',       value: Math.round(result.inputs.p20s),               desc: 'Anaerobic capacity' },
                  ].map(a => (
                    <div key={a.label} className="flex items-baseline gap-2 py-1.5 border-b border-gray-50">
                      <span className="text-xs font-black text-gray-700 w-16 shrink-0 flex items-center">
                        {a.label}
                        {(a.label === 'LT1' || a.label === 'LT2' || a.label === 'VO2max') && <InfoTooltip term={a.label as 'LT1' | 'LT2' | 'VO2max'} />}
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
                    { zone: 'Zone 1',   rule: '0–80% LT1 — recovery / very easy aerobic work' },
                    { zone: 'Zone 2',   rule: '80–100% LT1 — basic endurance' },
                    { zone: 'Zone 3A',  rule: '100–110% LT1 — just above aerobic threshold' },
                    { zone: 'Zone 3B',  rule: '110% LT1 to 95% LT2 — tempo / focused endurance' },
                    { zone: 'Zone 4',   rule: '95–100% LT2 — threshold' },
                    { zone: 'Zone 5A',  rule: 'LT2 to 90% VO2max power — sub-VO2max bridge (shown only when gap exists)' },
                    { zone: 'Zone 5B',  rule: '90–100% VO2max power — true VO2max zone' },
                    { zone: 'Zone 6',   rule: 'VO2max power to 90% P20 — anaerobic capacity (shown only when gap exists)' },
                    { zone: 'Zone 7',   rule: '>90% P20 — neuromuscular / sprint' },
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

      {/* Confidence intervals — always shown */}
      <div className="grid grid-cols-2 gap-3 text-xs text-gray-500">
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <p className="font-bold">VLamax 95% CI</p>
          <p>{result.vlaNLow} – {result.vlaNHigh} mmol/L/s</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <p className="font-bold">CP 95% CI</p>
          <p>{result.ftpLow} – {result.ftpHigh} W</p>
        </div>
      </div>

      {/* Performance profile — "See how I stack up" */}
      <PerformanceProfile result={result} tier={tier} />

      {/* Fueling Snapshot — free users only; Pro users go straight to Fueling Sense */}
      {!isPro && <FuelingSnapshot mlss={mlss} />}

      {/* CTA */}
      {isPro ? (
        <div className="bg-gradient-to-r from-violet-600 to-blue-600 rounded-xl p-5 text-white">
          <h3 className="font-bold text-base">Next: race nutrition planning</h3>
          <p className="text-sm opacity-80 mt-1">
            Use your LT2 and VLamax to model substrate oxidation and get personalised fueling recommendations for any race or session.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-3 px-5 py-2 bg-white text-violet-700 font-bold rounded-lg text-sm hover:bg-violet-50 transition"
          >
            Open Fueling Sense →
          </button>
          {!savedId && (
            <p className="text-xs opacity-60 mt-2">Export your profile as a PDF to keep a record of your results.</p>
          )}
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

      {/* ── Transition modal ──────────────────────────────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">

            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Before you move on…</h2>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-3 text-sm text-gray-600 leading-relaxed">
              <p>
                Your Fueling Sense values will carry over to the next step, but this metabolic profile
                analysis will not be saved unless you export it as a PDF.
              </p>
              <p>Would you like to export your analysis before continuing?</p>
            </div>

            {/* Actions */}
            <div className="px-6 pb-6 flex flex-col gap-2">
              {exported ? (
                <>
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-semibold">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    PDF exported — ready to continue
                  </div>
                  <button
                    onClick={handleOpenFueling}
                    className="w-full px-4 py-2.5 bg-violet-600 text-white font-bold rounded-lg text-sm hover:bg-violet-700 transition"
                  >
                    Continue to Fueling Sense →
                  </button>
                </>
              ) : (
                <button
                  onClick={handleExport}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 text-white font-bold rounded-lg text-sm hover:bg-violet-700 transition"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-8m0 8l-3-3m3 3l3-3M4 20h16" />
                  </svg>
                  Export PDF
                </button>
              )}

              <button
                onClick={handleOpenFueling}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-lg text-sm hover:bg-gray-50 transition"
              >
                Continue without exporting
              </button>

              <button
                onClick={() => { setShowModal(false); setExported(false); }}
                className="w-full px-4 py-2.5 text-gray-400 font-medium rounded-lg text-sm hover:text-gray-600 transition"
              >
                Stay here
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
