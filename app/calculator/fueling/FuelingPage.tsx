'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import HeaderLogo from '@/components/shared/HeaderLogo';
import { useFuelingStore } from '@/lib/store/fuelingStore';
import { createClient } from '@/lib/supabase/client';
import FuelingInputForm from '@/components/fueling/FuelingInputForm';
import FuelingResults from '@/components/fueling/FuelingResults';
import LogoutButton from '@/components/LogoutButton';
import ToolSwitcher from '@/components/ToolSwitcher';
import GettingStartedPanel from '@/components/GettingStartedPanel';
import {
  generateStrategyFromConfig,
  defaultConfigForEventType,
  strategyToChoPerHour,
  type FuelSourceConfig,
  type FuelingStrategy,
} from '@/lib/engine/fuelingStrategy';
import { computeRecommendedTarget } from '@/lib/engine/fuelingEngine';
import type { FuelingInputs, Sex, DietType } from '@/lib/types';
import { getSavedProfileAction } from '@/app/actions/profile';
import type { SavedProfileData } from '@/app/actions/profile';

export default function FuelingCalculatorPage() {
  const { result, loading, setResult, setLoading, setError } = useFuelingStore();
  const searchParams = useSearchParams();
  const [isLoggedIn,       setIsLoggedIn]       = useState(false);
  const [tier,             setTier]             = useState<'free' | 'pro'>('free');
  const [strategy,         setStrategy]         = useState<FuelingStrategy>({ gels: [], drinks: [], solids: [] });
  const [livePowerW,       setLivePowerW]       = useState<number | null>(null);
  const [savedProfile,     setSavedProfile]     = useState<SavedProfileData | null>(null);
  const [profilePrefilled, setProfilePrefilled] = useState(false);
  const [fuelFormKey,      setFuelFormKey]      = useState(0);

  // Holds the fuel source config submitted with the last calculation — used to seed
  // the default strategy when the API result arrives. Stored as a ref so it's
  // synchronously available in the result useEffect without closure-staleness risk.
  const fuelConfigRef = useRef<FuelSourceConfig>(defaultConfigForEventType('Cycling 2–4h'));

  // Derived: planned CHO g/h (recalculated every render)
  const plannedGph = strategyToChoPerHour(strategy);

  // Effective target power: live override takes precedence over the original form value
  const effectivePowerW = livePowerW ?? (result?.inputs.targetWatts ?? 0);

  useEffect(() => {
    createClient().auth.getSession().then(async ({ data: { session } }) => {
      setIsLoggedIn(!!session);
      if (!session) return;
      fetch('/api/me').then(r => r.ok ? r.json() : null).then(d => {
        if (d?.tier === 'pro') setTier('pro');
      });
      // Load saved profile and prefill the form if it exists and no INSCYD prefill is active
      const sp = await getSavedProfileAction();
      if (!sp) return;
      setSavedProfile(sp);
      // Only prefill if the store has no existing prefill (e.g. navigating fresh, not from profiler)
      const { inputs: currentInputs } = useFuelingStore.getState();
      if (!currentInputs.inscydResultId && !currentInputs.mlssWatts) {
        useFuelingStore.getState().prefillFromInscyd({
          mlssWatts:     Math.round(sp.mlssWatts),
          lt1Watts:      Math.round(sp.lt1Watts),
          vlamax:        Math.round(sp.vlamax * 100) / 100,
          weight:        sp.weightKg,
          bodyFat:       sp.bodyFatPct,
          vo2maxMlKgMin: sp.vo2maxMlKgMin,
          // Shared athlete context fields
          name:     sp.name     || undefined,
          sex:      sp.sex      as Sex      | undefined,
          age:      sp.age      ?? undefined,
          dietType: sp.dietType as DietType | undefined,
        });
        setProfilePrefilled(true);
        setFuelFormKey(k => k + 1);
      }
    });
  }, []);

  // Seed strategy from user's fuel source config + reset live power when a new result arrives
  useEffect(() => {
    if (!result) return;
    setLivePowerW(null);   // reset to form value on new calculation
    const required    = result.advice.carbRequirement.requiredCHO_gph;
    const recommended = computeRecommendedTarget(required, result.inputs.eventType);
    setStrategy(generateStrategyFromConfig(fuelConfigRef.current, recommended));
  }, [result]);

  function handleLoadProfileManually() {
    if (!savedProfile) return;
    useFuelingStore.getState().prefillFromInscyd({
      mlssWatts:     Math.round(savedProfile.mlssWatts),
      lt1Watts:      Math.round(savedProfile.lt1Watts),
      vlamax:        Math.round(savedProfile.vlamax * 100) / 100,
      weight:        savedProfile.weightKg,
      bodyFat:       savedProfile.bodyFatPct,
      vo2maxMlKgMin: savedProfile.vo2maxMlKgMin,
      name:     savedProfile.name     || undefined,
      sex:      savedProfile.sex      as Sex      | undefined,
      age:      savedProfile.age      ?? undefined,
      dietType: savedProfile.dietType as DietType | undefined,
    });
    setProfilePrefilled(true);
    setFuelFormKey(k => k + 1);
  }

  function handleClearForm() {
    useFuelingStore.getState().reset();
    setProfilePrefilled(false);
    setFuelFormKey(k => k + 1);
  }

  const justUpgraded = searchParams.get('upgraded') === '1';

  async function handleCalculate(inputs: FuelingInputs, config: FuelSourceConfig) {
    fuelConfigRef.current = config;
    setLoading(true);
    try {
      const res = await fetch('/api/fueling', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...inputs, save: true }),
      });
      const data = await res.json();

      if (res.status === 403 && data.code === 'UPGRADE_REQUIRED') {
        if (justUpgraded) {
          setError('Your subscription is still activating — wait a few seconds and try again.');
        } else {
          window.location.href = '/pricing';
        }
        return;
      }
      if (!res.ok) {
        const err = data.error;
        setError(typeof err === 'string' ? err : 'Invalid input — please check your values');
        return;
      }
      setResult(data.result, data.savedId);
    } catch {
      setError('Network error — please try again');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Upgrade success banner */}
      {justUpgraded && (
        <div className="bg-amber-400 text-amber-900 text-sm font-semibold text-center py-2 px-4">
          Welcome to Pro — you&apos;re all set. Start below.
        </div>
      )}

      {/* Header */}
      <header className="bg-white px-6 py-3 flex items-center gap-4 shadow-sm border-b border-gray-100">
        <HeaderLogo href="/calculator/profiler" height={28} width={140} />
        <span className="text-gray-200 select-none">|</span>
        <div>
          <p className="text-sm font-bold text-gray-800 leading-tight">Fueling Calculator</p>
          <p className="text-xs text-gray-400">Substrate · Personalised Fueling Recommendations</p>
        </div>
        <span className="text-xs font-bold bg-amber-100 text-amber-700 px-3 py-1 rounded-full">PRO</span>
        <ToolSwitcher active="fueling" />
        <div className="ml-auto flex items-center gap-3">
          <Link href="/support" className="text-xs text-gray-400 hover:text-gray-700 transition">Support</Link>
          {isLoggedIn && <LogoutButton className="text-xs text-gray-400 hover:text-gray-700 transition" />}
        </div>
      </header>

      <div className="flex h-[calc(100vh-64px)]">

        {/* Left: Input panel */}
        <aside className="w-72 min-w-64 bg-white border-r border-gray-100 p-5 overflow-y-auto">

          {/* Saved profile panel — show load option when not yet prefilled */}
          {savedProfile && !profilePrefilled && (
            <div className="mb-4 p-3 bg-violet-50 border border-violet-200 rounded-lg text-xs">
              <p className="font-semibold text-violet-800 leading-tight">Saved profile available</p>
              {savedProfile.savedAt && (
                <p className="text-violet-500 mt-0.5 mb-2">
                  Saved {new Date(savedProfile.savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              )}
              <button
                type="button"
                onClick={handleLoadProfileManually}
                className={`w-full py-1.5 bg-violet-600 text-white font-semibold rounded-md hover:bg-violet-700 transition ${!savedProfile.savedAt ? 'mt-2' : ''}`}
              >
                Load saved profile
              </button>
            </div>
          )}

          <FuelingInputForm
            key={fuelFormKey}
            onSubmit={handleCalculate}
            loading={loading}
            savedProfile={profilePrefilled ? savedProfile : null}
            onClear={profilePrefilled ? handleClearForm : undefined}
          />
        </aside>

        {/* Right: Results panel */}
        <main className="flex-1 p-5 overflow-y-auto">
          <GettingStartedPanel context="fueling" isProUser={tier === 'pro'} />
          {result ? (
            <FuelingResults
              result={result}
              strategy={strategy}
              onStrategy={setStrategy}
              plannedGph={plannedGph}
              effectivePowerW={effectivePowerW}
              onPowerChange={setLivePowerW}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-3">
              <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2} opacity={0.4}>
                <path d="M3 3v18h18"/><path d="M7 17c2-4 5-6 8-4s4 3 6 0"/>
              </svg>
              <p className="text-sm">Configure your athlete profile and session target</p>
              <p className="text-xs opacity-60">Powered by your metabolic profile</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
