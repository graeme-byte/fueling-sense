'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import HeaderLogo from '@/components/shared/HeaderLogo';
import LogoutButton from '@/components/LogoutButton';
import RunningToolSwitcher from '@/components/RunningToolSwitcher';
import RunningFuelingInputForm from '@/components/running/RunningFuelingInputForm';
import RunningFuelingResults from '@/components/running/RunningFuelingResults';
import type { RunningFuelingInputs, RunningFuelingResult } from '@/lib/engine/runningTypes';
import { useRunningStore } from '@/lib/store/runningStore';
import { createClient } from '@/lib/supabase/client';
import type { SubscriptionTier } from '@/lib/types';

export default function RunningFuelingPage() {
  const { fuelingInputs } = useRunningStore();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [tier,       setTier]       = useState<SubscriptionTier>('free');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [result,     setResult]     = useState<RunningFuelingResult | null>(null);
  const [lastInputs, setLastInputs] = useState<RunningFuelingInputs | null>(null);

  const isPro = tier === 'pro';

  useEffect(() => {
    createClient().auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });

    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.tier === 'pro') setTier('pro'); })
      .catch(() => {});
  }, []);

  async function handleCalculate(inputs: RunningFuelingInputs) {
    setLoading(true);
    setError(null);
    setLastInputs(inputs);
    try {
      const res = await fetch('/api/running-fueling', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(inputs),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 && data.code === 'UPGRADE_REQUIRED') {
          setError('Pro subscription required to use Running Fueling. Upgrade at /pricing.');
          return;
        }
        setError(typeof data.error === 'string' ? data.error : 'Calculation failed');
        return;
      }
      setResult(data.result as RunningFuelingResult);
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  const prefill: Partial<RunningFuelingInputs> = {
    ...fuelingInputs,
    eventType: fuelingInputs.eventType ?? 'Half Marathon',
    targetCHO: fuelingInputs.targetCHO ?? 60,
  };

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-white px-4 sm:px-6 py-3 flex items-center gap-3 sm:gap-4 shadow-sm border-b border-gray-100">
        <HeaderLogo href="/calculator/running-fueling" height={28} width={140} />
        <span className="text-gray-200 select-none hidden sm:inline">|</span>
        <div className="hidden sm:block">
          <p className="text-sm font-bold text-gray-800 leading-tight">Running Fueling</p>
          <p className="text-xs text-gray-400">Substrate · CHO requirements · Fueling strategy</p>
        </div>
        {isPro ? (
          <span className="text-xs font-bold bg-amber-100 text-amber-700 px-3 py-1 rounded-full">✓ PRO</span>
        ) : (
          <span className="text-xs font-bold bg-gray-100 text-gray-500 px-3 py-1 rounded-full">PRO ONLY</span>
        )}
        <span className="hidden sm:block"><RunningToolSwitcher active="running-fueling" /></span>
        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/calculator/fueling"
            className="text-xs text-gray-400 hover:text-gray-700 transition hidden sm:inline whitespace-nowrap"
          >
            ← Cycling Fueling
          </Link>
          <Link href="/support" className="text-xs text-gray-400 hover:text-gray-700 transition hidden sm:inline">Support</Link>
          {isLoggedIn && <LogoutButton className="text-xs text-gray-400 hover:text-gray-700 transition" />}
        </div>
      </header>

      {/* Pro gate banner */}
      {!isPro && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-3">
          <p className="text-sm text-amber-800">
            Running Fueling requires a <strong>Pro subscription</strong>.
            You can still enter values but calculation will be blocked.
          </p>
          <Link
            href="/pricing"
            className="shrink-0 px-4 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 transition"
          >
            Upgrade →
          </Link>
        </div>
      )}

      <div className="flex flex-col lg:flex-row">

        {/* Left: Input panel — sticky on desktop */}
        <aside className="w-full lg:w-80 lg:min-w-72 bg-white border-b lg:border-b-0 lg:border-r border-gray-100 p-5 lg:sticky lg:top-0 lg:self-start lg:max-h-screen lg:overflow-y-auto">
          <RunningFuelingInputForm
            prefill={Object.keys(prefill).length > 0 ? prefill : undefined}
            onSubmit={handleCalculate}
            loading={loading}
            error={error}
          />
        </aside>

        {/* Right: Results panel */}
        <main className="flex-1 p-5">
          {result && lastInputs ? (
            <RunningFuelingResults
              result={result}
              mlssSpeedMs={lastInputs.mlssSpeedMs}
              lt1SpeedMs={lastInputs.lt1SpeedMs}
            />
          ) : (
            <div className="min-h-[40vh] flex flex-col items-center justify-center text-gray-400 gap-3">
              <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2} opacity={0.4}>
                <path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 4-6"/>
              </svg>
              <p className="text-sm">Enter your running profile values and click Calculate</p>
              {!isPro && (
                <Link href="/pricing" className="text-xs text-amber-600 hover:underline font-semibold">
                  Upgrade to Pro to unlock →
                </Link>
              )}
              {isPro && (
                <Link href="/calculator/running-profiler" className="text-xs text-emerald-600 hover:underline">
                  ← Get values from Running Profiler
                </Link>
              )}
              <Link
                href="/calculator/fueling"
                className="text-xs text-gray-400 hover:text-gray-600 hover:underline mt-1"
              >
                ← Back to Cycling Fueling
              </Link>
            </div>
          )}
        </main>

      </div>
    </div>
  );
}
