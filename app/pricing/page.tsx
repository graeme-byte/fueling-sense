'use client';

import { useState } from 'react';
import Link from 'next/link';

const PRICE_IDS = {
  monthly: 'price_1TNLWr0Ix1tVTzCC5eZxhagk',
  annual:  'price_1TNLWf0Ix1tVTzCCzAqDktAj',
} as const;

export default function PricingPage() {
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [upgrading, setUpgrading]       = useState(false);
  const [billing, setBilling]           = useState<'annual' | 'monthly'>('annual');

  async function handleUpgrade() {
    setUpgradeError(null);
    setUpgrading(true);
    const priceId = PRICE_IDS[billing];
    try {
      const res = await fetch('/api/stripe/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ priceId }),
      });
      if (res.status === 401) {
        window.location.href = '/login?redirect=/pricing&reason=pro_required';
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setUpgradeError(body.error ?? 'Something went wrong. Please try again.');
        return;
      }
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      setUpgradeError('Could not reach the server. Please check your connection.');
    } finally {
      setUpgrading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center px-6 py-20">

      {/* Header */}
      <div className="text-center mb-4">
        <p className="text-xs font-black uppercase tracking-widest text-violet-500 mb-3">Pricing</p>
        <h1 className="text-4xl font-black text-gray-900 mb-3">
          One journey. Three stages.
        </h1>
        <p className="text-gray-500 max-w-xl mx-auto">
          Start free. Unlock your physiology with Pro. Then add race-specific fueling built on your actual metabolism.
        </p>
      </div>

      {/* Progression label */}
      <div className="flex items-center gap-2 text-xs font-bold text-gray-400 mb-10">
        <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full">Measure</span>
        <span>→</span>
        <span className="bg-violet-100 text-violet-700 px-3 py-1 rounded-full">Understand</span>
        <span>→</span>
        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full">Fuel</span>
      </div>

      <div className="grid md:grid-cols-3 gap-6 w-full max-w-4xl">

        {/* Step 1 — Free */}
        <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-green-100 text-green-700 font-black text-xs flex items-center justify-center shrink-0">1</span>
            <p className="text-xs font-black uppercase text-green-600 tracking-widest">Free</p>
          </div>

          <h2 className="text-2xl font-black text-gray-900 mb-1">Measure your engine</h2>
          <p className="text-4xl font-black text-gray-900 mt-3 mb-1">$0</p>
          <p className="text-gray-400 text-sm mb-6">No account needed</p>

          <ul className="space-y-2 text-sm text-gray-600 mb-6 flex-1">
            {[
              'Science-based metabolic profiler',
              'VO2max (ml/kg/min)',
              'VLamax (mmol/L/s)',
              'Critical Power + W\'',
              'Power–duration curve',
            ].map(f => (
              <li key={f} className="flex gap-2"><span className="text-green-500 shrink-0">✓</span>{f}</li>
            ))}
          </ul>

          <p className="text-xs text-gray-400 italic mb-6">"Understand what your engine can produce"</p>

          <Link
            href="/calculator/profiler"
            className="block text-center py-3 border border-gray-300 rounded-xl font-bold text-gray-700 hover:bg-gray-50 transition"
          >
            Start Free →
          </Link>
        </div>

        {/* Step 2 — Pro */}
        <div className="bg-gradient-to-br from-violet-600 to-blue-600 rounded-2xl p-8 text-white shadow-xl flex flex-col ring-2 ring-violet-300/30">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-amber-400 text-amber-900 font-black text-xs flex items-center justify-center shrink-0">2</span>
            <p className="text-xs font-black uppercase tracking-widest text-amber-300">Pro</p>
          </div>

          <h2 className="text-2xl font-black mb-4">Unlock your physiology</h2>

          {/* Billing toggle */}
          <div className="flex items-center bg-white/10 rounded-xl p-1 mb-5 text-xs font-bold">
            <button
              onClick={() => setBilling('monthly')}
              className={`flex-1 py-2 rounded-lg transition ${
                billing === 'monthly'
                  ? 'bg-white text-violet-700'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling('annual')}
              className={`flex-1 py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
                billing === 'annual'
                  ? 'bg-white text-violet-700'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Annual
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                billing === 'annual' ? 'bg-amber-400 text-amber-900' : 'bg-white/20 text-white/80'
              }`}>
                Save 50%
              </span>
            </button>
          </div>

          {/* Price */}
          {billing === 'monthly' ? (
            <>
              <p className="text-4xl font-black mb-1">$19<span className="text-xl font-normal opacity-70">/mo</span></p>
              <p className="opacity-70 text-sm mb-6">Cancel anytime</p>
            </>
          ) : (
            <>
              <p className="text-4xl font-black mb-1">$115<span className="text-xl font-normal opacity-70">/yr</span></p>
              <p className="opacity-70 text-sm mb-1">~$9.60/month · Save 50% with annual billing</p>
              <p className="text-xs font-bold text-amber-300 mb-6">Best value</p>
            </>
          )}

          <ul className="space-y-2 text-sm opacity-90 mb-6 flex-1">
            {[
              'Everything in Free',
              'LT1 — aerobic threshold (W)',
              'LT2 — anaerobic threshold (W)',
              'Full personalised training zones',
              'LT1/LT2 on lactate curve',
              'Performance profile classification',
              'Complete race fueling plan',
              'Export your full profile and training zones as a PDF',
            ].map(f => (
              <li key={f} className="flex gap-2"><span className="text-amber-300 shrink-0">✓</span>{f}</li>
            ))}
          </ul>

          <p className="text-xs opacity-60 italic mb-6">"Train with precision instead of guesswork"</p>

          <button
            onClick={handleUpgrade}
            disabled={upgrading}
            className="w-full py-3 bg-amber-400 text-amber-900 font-black rounded-xl hover:bg-amber-300 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {upgrading ? 'Redirecting…' : 'Upgrade to Pro →'}
          </button>
          {upgradeError && (
            <p className="mt-3 text-sm text-red-200 text-center">{upgradeError}</p>
          )}
        </div>

        {/* Step 3 — Fueling Sense */}
        <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 font-black text-xs flex items-center justify-center shrink-0">3</span>
            <p className="text-xs font-black uppercase text-violet-500 tracking-widest">Fueling</p>
          </div>

          <h2 className="text-2xl font-black text-gray-900 mb-1">Fuel your performance with precision</h2>
          <p className="text-gray-400 text-sm mt-3 mb-6">Included with Pro</p>

          <ul className="space-y-2 text-sm text-gray-500 mb-6 flex-1">
            {[
              'CHO demand at race intensity',
              'Substrate oxidation curves',
              'Glucose–fructose strategy',
              'Complete race fueling plan',
              'Auto-fill from metabolic profile',
            ].map(f => (
              <li key={f} className="flex gap-2"><span className="text-violet-300 shrink-0">✓</span>{f}</li>
            ))}
          </ul>

          <p className="text-xs text-gray-400 italic mb-6">"Fuel the work your body actually requires"</p>

          <div className="mt-auto text-center">
            <span className="inline-block px-4 py-1.5 rounded-full bg-violet-50 text-violet-500 text-xs font-bold border border-violet-100">
              Included with Pro
            </span>
            <p className="text-xs text-gray-400 mt-2">Unlock full fueling strategy with Pro</p>
          </div>
        </div>

      </div>

      {/* Bottom link */}
      <p className="mt-12 text-sm text-gray-400">
        Already started?{' '}
        <Link href="/calculator/profiler" className="text-violet-600 font-semibold hover:underline">
          Go to the profiler →
        </Link>
      </p>

    </main>
  );
}
