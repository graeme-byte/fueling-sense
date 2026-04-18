'use client';

import { useState } from 'react';
import {
  classifyVO2max,
  classifyLT1Fraction,
  classifyLT2Fraction,
  classifyLT2Wkg,
  classifyVlamax,
  generateSummary,
  type ClassificationLevel,
  type VlamaxProfile,
} from '@/lib/engine/performanceProfile';
import type { InscydResult, SubscriptionTier } from '@/lib/types';

interface Props {
  result: InscydResult;
  tier:   SubscriptionTier;
}

// ── Badge colours ─────────────────────────────────────────────────────

const LEVEL_BADGE: Record<string, string> = {
  // Shared 7-tier rank ladder (VO2max, LT2 W/kg, LT2%, LT1%)
  'World Class':  'text-amber-800  bg-amber-100',
  'Exceptional':  'text-violet-700 bg-violet-50',
  'Excellent':    'text-green-800  bg-green-100',
  'Very Good':    'text-green-700  bg-green-50',
  'Good':         'text-blue-600   bg-blue-50',
  'Moderate/Rec': 'text-sky-600    bg-sky-50',
  'Novice/Fair':  'text-gray-500   bg-gray-100',
  // VLamax profile scale (not ranked)
  'Endurance Specialist': 'text-blue-800   bg-blue-100',
  'Endurance-oriented':   'text-blue-600   bg-blue-50',
  'Balanced':             'text-green-700  bg-green-50',
  'Anaerobic-leaning':    'text-orange-700 bg-orange-50',
  'Sprint-oriented':      'text-red-700    bg-red-50',
};

function Badge({ level }: { level: string }) {
  const cls = LEVEL_BADGE[level] ?? 'text-gray-600 bg-gray-50';
  return (
    <span className={`shrink-0 text-xs font-bold px-2.5 py-0.5 rounded-full ${cls}`}>
      {level}
    </span>
  );
}

// ── Profile card ──────────────────────────────────────────────────────

function ProfileCard({
  title,
  subtitle,
  level,
  value,
  description,
}: {
  title:       string;
  subtitle:    string;
  level:       string;
  value?:      string;
  description: string;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{title}</p>
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        </div>
        <Badge level={level} />
      </div>
      {value && (
        <p className="text-xl font-black text-gray-900 tabular-nums">{value}</p>
      )}
      <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{description}</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

export default function PerformanceProfile({ result, tier }: Props) {
  const [open, setOpen]           = useState(false);
  const [age, setAge]             = useState('');
  const [sex, setSex]             = useState<'Male' | 'Female' | ''>('');
  const [submitted, setSubmitted] = useState(false);

  const isPro = tier === 'pro';
  const ppo   = result.ppo;

  function handleSubmit() {
    if (age && sex) setSubmitted(true);
  }

  function handleReset() {
    setSubmitted(false);
    setAge('');
    setSex('');
  }

  // Classification — computed only after form submission
  const vo2maxClass  = (submitted && age && sex)
    ? classifyVO2max(result.vo2max, parseInt(age, 10), sex as 'Male' | 'Female')
    : null;

  const lt1Class = (submitted && isPro)
    ? classifyLT1Fraction(result.lt1, result.mlss)
    : null;

  const lt2Class = (submitted && isPro && ppo)
    ? classifyLT2Fraction(result.mlss, ppo)
    : null;

  const lt2WkgClass = (submitted && isPro && sex)
    ? classifyLT2Wkg(result.mlss, result.inputs.bodyMass, sex as 'Male' | 'Female')
    : null;

  const vlamaxClass = submitted
    ? classifyVlamax(result.vlamax)
    : null;

  const summary = (vo2maxClass && lt1Class && lt2Class && vlamaxClass)
    ? generateSummary({
        vo2maxLevel:   vo2maxClass.level  as ClassificationLevel,
        lt1Level:      lt1Class.level     as ClassificationLevel,
        lt2Level:      lt2Class.level     as ClassificationLevel,
        vlamaxProfile: vlamaxClass.level  as VlamaxProfile,
      })
    : null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">

      {/* Section header — always visible */}
      <div className="px-4 pt-4 pb-4">
        <h3 className="text-sm font-bold text-gray-800">Your Performance Profile</h3>

        {!open && (
          <>
            <button
              onClick={() => setOpen(true)}
              className="mt-3 w-full py-3 bg-violet-600 text-white font-bold rounded-lg text-sm hover:bg-violet-700 transition-colors"
            >
              See how I stack up
            </button>
            <p className="text-xs text-gray-400 text-center mt-2">
              Compare your engine, base and thresholds to athletes like you
            </p>
          </>
        )}
      </div>

      {open && (
        <div className="border-t border-gray-100 p-4 space-y-4">

          {/* Step 1 — age + sex form */}
          {!submitted && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Enter your age and sex for a personalised classification against endurance sport norms.
              </p>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-bold text-gray-500 block mb-1">Age</label>
                  <input
                    type="number"
                    min={16}
                    max={90}
                    value={age}
                    onChange={e => setAge(e.target.value)}
                    placeholder="e.g. 38"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-bold text-gray-500 block mb-1">Sex</label>
                  <select
                    value={sex}
                    onChange={e => setSex(e.target.value as 'Male' | 'Female')}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                  >
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
              </div>
              <button
                onClick={handleSubmit}
                disabled={!age || !sex}
                className="w-full py-2 bg-violet-600 text-white text-sm font-bold rounded-lg hover:bg-violet-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Show my profile
              </button>
            </div>
          )}

          {/* Step 2 — classification results */}
          {submitted && (
            <div className="space-y-3">

              <h3 className="text-sm font-bold text-gray-800">Your Performance Profile</h3>

              {/* Threshold power banner — Pro only */}
              {isPro && lt2WkgClass && (
                <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400">Your threshold power</p>
                    <p className="text-xl font-black text-gray-900 tabular-nums mt-0.5">
                      {lt2WkgClass.wkg.toFixed(1)} W/kg
                    </p>
                  </div>
                  {lt2WkgClass.level && <Badge level={lt2WkgClass.level} />}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">

                {/* Engine — always shown */}
                {vo2maxClass && (
                  <ProfileCard
                    title="Engine"
                    subtitle={`VO2max · ${result.vo2max.toFixed(1)} ml/kg/min`}
                    level={vo2maxClass.level}
                    description={vo2maxClass.description}
                  />
                )}

                {/* Anaerobic Profile — always shown (VLamax is a free metric) */}
                {vlamaxClass && (
                  <ProfileCard
                    title="Anaerobic Profile"
                    subtitle={`VLamax · ${result.vlamax.toFixed(3)} mmol/L/s`}
                    level={vlamaxClass.level}
                    description={vlamaxClass.description}
                  />
                )}

                {/* Aerobic Base — Pro only (uses LT1) */}
                {isPro && lt1Class && (
                  <ProfileCard
                    title="Aerobic Base"
                    subtitle="LT1 as % of LT2"
                    level={lt1Class.level}
                    value={`${lt1Class.pct}%`}
                    description={lt1Class.description}
                  />
                )}

                {/* Threshold Durability — Pro only (uses LT2/MLSS) */}
                {isPro && lt2Class && (
                  <ProfileCard
                    title="LT2 Durability"
                    subtitle={`LT2 as % of VO2max power${lt2WkgClass ? ` · ${lt2WkgClass.wkg.toFixed(1)} W/kg` : ''}`}
                    level={lt2Class.level}
                    value={`${lt2Class.pct}%`}
                    description={lt2Class.description}
                  />
                )}
              </div>

              {/* Pro upsell when free — hint at locked cards */}
              {!isPro && (
                <div className="grid grid-cols-2 gap-3">
                  {(['Aerobic Base', 'LT2 Durability'] as const).map(t => (
                    <div
                      key={t}
                      className="bg-gray-50 rounded-xl p-4 border border-dashed border-gray-200 opacity-60"
                    >
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{t}</p>
                      <p className="text-xs text-violet-500 font-semibold mt-1">Pro · unlock LT1 & LT2</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Interpretation summary — full only when all 4 cards available */}
              {summary && (
                <div className="bg-violet-50 rounded-xl p-4 border border-violet-100">
                  <p className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-1.5">
                    Interpretation
                  </p>
                  <p className="text-sm text-gray-700 leading-relaxed">{summary}</p>
                </div>
              )}

              {/* Partial summary for free users */}
              {!isPro && vo2maxClass && vlamaxClass && (
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                    Partial interpretation
                  </p>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Your engine is <span className="font-semibold text-gray-800">{vo2maxClass.level.toLowerCase()}</span> and
                    your anaerobic profile is <span className="font-semibold text-gray-800">{vlamaxClass.level.toLowerCase()}</span>.
                    Unlock Pro to see how your aerobic base and threshold durability compare.
                  </p>
                </div>
              )}

              <button
                onClick={handleReset}
                className="text-xs text-gray-400 hover:text-gray-600 transition"
              >
                Change details
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
