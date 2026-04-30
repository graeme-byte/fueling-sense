'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import HeaderLogo from '@/components/shared/HeaderLogo';
import LogoutButton from '@/components/LogoutButton';
import RunningToolSwitcher from '@/components/RunningToolSwitcher';
import RunningProfilerInputForm from '@/components/running/RunningProfilerInputForm';
import RunningProfilerResults from '@/components/running/RunningProfilerResults';
import type { RunningProfilerFormPayload } from '@/components/running/RunningProfilerInputForm';
import type { RunningMetabolicProfile } from '@/lib/engine/runningTypes';
import { useRunningStore } from '@/lib/store/runningStore';
import { createClient } from '@/lib/supabase/client';
import type { SubscriptionTier } from '@/lib/types';

export default function RunningProfilerPage() {
  const router = useRouter();
  const { prefillFromRunningProfile } = useRunningStore();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [tier,       setTier]       = useState<SubscriptionTier>('free');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [profile,    setProfile]    = useState<RunningMetabolicProfile | null>(null);
  const [athleteName, setAthleteName] = useState<string | undefined>();

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

  async function handleCalculate(payload: RunningProfilerFormPayload) {
    setLoading(true);
    setError(null);
    setAthleteName(payload.name);
    try {
      const res = await fetch('/api/running-profiler', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = typeof data.error === 'string'
          ? data.error
          : 'Validation failed — check your inputs';
        setError(msg);
        return;
      }
      setProfile(data.profile as RunningMetabolicProfile);
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  function handleSendToFueling() {
    if (!profile) return;
    prefillFromRunningProfile(profile);
    router.push('/calculator/running-fueling');
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-white px-4 sm:px-6 py-3 flex items-center gap-3 sm:gap-4 shadow-sm border-b border-gray-100">
        <HeaderLogo href="/calculator/running-profiler" height={28} width={140} />
        <span className="text-gray-200 select-none hidden sm:inline">|</span>
        <div className="hidden sm:block">
          <p className="text-sm font-bold text-gray-800 leading-tight">Running Profiler</p>
          <p className="text-xs text-gray-400">VO2max · VLamax · LT2 · LT1</p>
        </div>
        {isPro ? (
          <span className="text-xs font-bold bg-amber-100 text-amber-700 px-3 py-1 rounded-full">✓ PRO</span>
        ) : (
          <span className="text-xs font-bold bg-green-100 text-green-700 px-3 py-1 rounded-full">FREE</span>
        )}
        {isPro && <span className="hidden sm:block"><RunningToolSwitcher active="running-profiler" /></span>}
        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/calculator/profiler"
            className="text-xs text-gray-400 hover:text-gray-700 transition hidden sm:inline whitespace-nowrap"
          >
            ← Cycling Profiler
          </Link>
          <Link href="/support" className="text-xs text-gray-400 hover:text-gray-700 transition hidden sm:inline">Support</Link>
          {isLoggedIn && <LogoutButton className="text-xs text-gray-400 hover:text-gray-700 transition" />}
        </div>
      </header>

      <div className="flex flex-col lg:flex-row">

        {/* Left: Input panel — sticky on desktop */}
        <aside className="w-full lg:w-72 lg:min-w-64 bg-white border-b lg:border-b-0 lg:border-r border-gray-100 p-5 lg:sticky lg:top-0 lg:self-start lg:max-h-screen lg:overflow-y-auto">
          <RunningProfilerInputForm
            onSubmit={handleCalculate}
            loading={loading}
            error={error}
          />
        </aside>

        {/* Right: Results panel */}
        <main className="flex-1 p-5">
          {profile ? (
            <RunningProfilerResults
              profile={profile}
              isPro={isPro}
              onSendToFueling={handleSendToFueling}
              name={athleteName}
            />
          ) : (
            <div className="min-h-[40vh] flex flex-col items-center justify-center text-gray-400 gap-3">
              <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2} opacity={0.4}>
                <circle cx="12" cy="5" r="2"/>
                <path d="M12 7v4l-2 4 2 2 2-2-2-4"/>
                <path d="M8 17l-2 4M16 17l2 4"/>
              </svg>
              <p className="text-sm">Enter your test data and click Calculate Running Profile</p>
              <p className="text-xs opacity-60">Protocol: 20 s sprint (fixed) · 3-min all-out · 6-min all-out</p>
              <Link
                href="/calculator/profiler"
                className="text-xs text-emerald-600 hover:underline mt-2"
              >
                ← Back to Cycling Profiler
              </Link>
            </div>
          )}
        </main>

      </div>
    </div>
  );
}
