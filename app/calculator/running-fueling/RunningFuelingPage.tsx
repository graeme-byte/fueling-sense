'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import HeaderLogo from '@/components/shared/HeaderLogo';
import LogoutButton from '@/components/LogoutButton';
import AllToolsSwitcher from '@/components/AllToolsSwitcher';
import RunningFuelingInputForm from '@/components/running/RunningFuelingInputForm';
import RunningFuelingResults from '@/components/running/RunningFuelingResults';
import type { RunningFuelingInputs, RunningFuelingResult, RunningDietType, RunFuelConfig } from '@/lib/engine/runningTypes';
import { useRunningStore } from '@/lib/store/runningStore';
import { createClient } from '@/lib/supabase/client';
import type { SubscriptionTier } from '@/lib/types';
import { getSavedRunningProfileAction } from '@/app/actions/profile';
import type { SavedRunningProfileData } from '@/app/actions/profile';

// g/h computation helpers (display-only — never fed back into engine calculations)
function gelGph(carbsPerGel: number, everyMin: number)                   { return everyMin > 0 ? (carbsPerGel / everyMin) * 60 : 0; }
function drinkGph(volumeMl: number, concGL: number, everyMin: number)    { const g = (concGL * volumeMl) / 1000; return everyMin > 0 ? (g / everyMin) * 60 : 0; }
function solidGph(carbsPerServing: number, everyMin: number)             { return everyMin > 0 ? (carbsPerServing / everyMin) * 60 : 0; }

// Snap a raw frequency (min) to the nearest selectable option used in FreqField
const FUEL_FREQ_OPTIONS = [10, 15, 20, 30, 45, 60] as const;
function snapFreq(raw: number): number {
  return [...FUEL_FREQ_OPTIONS].reduce((best, opt) =>
    Math.abs(opt - raw) < Math.abs(best - raw) ? opt : best,
  );
}

// After a calculation returns, scale the active fuel-source frequencies so
// totalGph converges on the engine's recommended intake. All serving sizes
// stay the same; only the intervals change. Inactive sources are untouched.
function scaleFuelConfigToRecommended(config: RunFuelConfig, recommended: number, currentTotal: number): RunFuelConfig {
  if (currentTotal <= 0 || recommended <= 0) return config;
  const scale = recommended / currentTotal;
  // Each source: newFreq = oldFreq / scale  (higher scale → shorter interval → more carbs)
  return {
    ...config,
    gelFreq:   config.gelsOn   ? snapFreq(Math.round(config.gelFreq   / scale)) : config.gelFreq,
    drinkFreq: config.drinksOn ? snapFreq(Math.round(config.drinkFreq / scale)) : config.drinkFreq,
    solidFreq: config.solidsOn ? snapFreq(Math.round(config.solidFreq / scale)) : config.solidFreq,
  };
}

const DEFAULT_FUEL_CONFIG: RunFuelConfig = {
  gelsOn: true, drinksOn: true, solidsOn: false,
  gelCarbs: 25, gelFreq: 30, gelRatio: '2:1',
  drinkVol: 500, drinkConc: 60, drinkFreq: 20, drinkRatio: '2:1',
  solidCarbs: 30, solidFreq: 60, solidRatio: 'Unknown',
};

export default function RunningFuelingPage() {
  const { fuelingInputs, setPendingAutoCalculate } = useRunningStore();

  const [isLoggedIn,       setIsLoggedIn]       = useState(false);
  const [tier,             setTier]             = useState<SubscriptionTier>('free');
  const [loading,          setLoading]          = useState(false);
  const [error,            setError]            = useState<string | null>(null);
  const [result,           setResult]           = useState<RunningFuelingResult | null>(null);
  const [lastInputs,       setLastInputs]       = useState<RunningFuelingInputs | null>(null);
  const [savedProfile,     setSavedProfile]     = useState<SavedRunningProfileData | null>(null);
  const [profilePrefilled, setProfilePrefilled] = useState(false);
  const [fuelFormKey,      setFuelFormKey]      = useState(0);

  // ── Fuel source configuration (lifted from form — shared with central panel) ──
  const [fuelConfig, setFuelConfig] = useState<RunFuelConfig>(DEFAULT_FUEL_CONFIG);

  const isPro = tier === 'pro';

  // Derived g/h values (display-only, passed to both sidebar and central panel)
  const gphGels   = fuelConfig.gelsOn   ? gelGph(fuelConfig.gelCarbs, fuelConfig.gelFreq)                         : 0;
  const gphDrinks = fuelConfig.drinksOn ? drinkGph(fuelConfig.drinkVol, fuelConfig.drinkConc, fuelConfig.drinkFreq) : 0;
  const gphSolids = fuelConfig.solidsOn ? solidGph(fuelConfig.solidCarbs, fuelConfig.solidFreq)                     : 0;
  const totalGph  = Math.round(gphGels + gphDrinks + gphSolids);

  // Capture the pending auto-calculate flag at mount and clear it from the store immediately.
  const pendingRef = useRef(false);
  useEffect(() => {
    const store = useRunningStore.getState();
    if (store.pendingAutoCalculate) {
      pendingRef.current = true;
      setPendingAutoCalculate(false);
    }
  }, [setPendingAutoCalculate]);

  // Main mount effect: auth + tier + saved profile fallback
  useEffect(() => {
    createClient().auth.getSession().then(async ({ data: { session } }) => {
      setIsLoggedIn(!!session);

      fetch('/api/me')
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.tier === 'pro') setTier('pro'); })
        .catch(() => {});

      if (!session) return;

      try {
        const sp = await getSavedRunningProfileAction();
        if (!sp) return;
        setSavedProfile(sp);
        const store = useRunningStore.getState();
        if (!store.fuelingInputs.mlssSpeedMs) {
          store.setFuelingInputs({
            massKg:         sp.massKg,
            bodyFatPct:     sp.bodyFatPct,
            mlssSpeedMs:    sp.mlssSpeedMs,
            lt1SpeedMs:     sp.lt1SpeedMs,
            vlamaxMmolLS:   sp.vlamaxMmolLS,
            vo2maxMlKgMin:  sp.vo2maxMlKgMin,
            vVO2maxSpeedMs: sp.sixMinDistM > 0 ? sp.sixMinDistM / 360 : undefined,
            sex:            sp.sex      as 'Male' | 'Female' | undefined,
            dietType:       sp.dietType as RunningDietType | undefined,
            name:           sp.name     ?? undefined,
          });
          setProfilePrefilled(true);
          setFuelFormKey(k => k + 1);
        }
      } catch {
        // Saved profile load is best-effort
      }
    });
  }, []);

  // Auto-calculate: fires once when isPro becomes true and a pending flag was captured at mount.
  useEffect(() => {
    if (!isPro || !pendingRef.current) return;
    pendingRef.current = false;

    const fi = useRunningStore.getState().fuelingInputs;
    if (!fi.mlssSpeedMs || !fi.lt1SpeedMs || !fi.vlamaxMmolLS || !fi.vo2maxMlKgMin || !fi.massKg || !fi.bodyFatPct) return;

    const autoInputs: RunningFuelingInputs = {
      sex:            fi.sex      ?? 'Male',
      dietType:       fi.dietType ?? 'Standard',
      eventType:      fi.eventType ?? 'Half Marathon',
      massKg:         fi.massKg,
      bodyFatPct:     fi.bodyFatPct,
      mlssSpeedMs:    fi.mlssSpeedMs,
      lt1SpeedMs:     fi.lt1SpeedMs,
      vlamaxMmolLS:   fi.vlamaxMmolLS,
      vo2maxMlKgMin:  fi.vo2maxMlKgMin,
      vVO2maxSpeedMs: fi.vVO2maxSpeedMs,
      targetSpeedMs:  fi.targetSpeedMs ?? fi.mlssSpeedMs,
      targetCHO:      totalGph,
      ...(fi.name && { name: fi.name }),
    };
    handleCalculate(autoInputs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPro]);

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
      const newResult = data.result as RunningFuelingResult;
      setResult(newResult);
      // Only auto-scale fuel sources when the user has no explicit planned CHO.
      // With an explicit plan, the user is in control of their target — leave sources as-is.
      if (inputs.targetCHO <= 0) {
        const recommended = newResult.advice.carbRequirement.recommendedGH;
        setFuelConfig(prev => scaleFuelConfigToRecommended(prev, recommended, totalGph));
      }
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
          <p className="text-xs text-gray-400">Substrate utilization · CHO requirements · Fueling strategy</p>
        </div>
        {isPro ? (
          <span className="text-xs font-bold bg-amber-100 text-amber-700 px-3 py-1 rounded-full">PRO</span>
        ) : (
          <span className="text-xs font-bold bg-gray-100 text-gray-500 px-3 py-1 rounded-full">PRO ONLY</span>
        )}
        <span className="hidden sm:block"><AllToolsSwitcher active="running-fueling" /></span>
        <div className="ml-auto flex items-center gap-3">
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
          <Link href="/pricing" className="shrink-0 px-4 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 transition">
            Upgrade →
          </Link>
        </div>
      )}

      <div className="flex flex-col lg:flex-row">

        {/* Left: Input panel */}
        <aside className="w-full lg:w-72 lg:min-w-64 bg-white border-b lg:border-b-0 lg:border-r border-gray-100 p-5 lg:sticky lg:top-0 lg:self-start lg:max-h-screen lg:overflow-y-auto">

          {savedProfile && profilePrefilled && (
            <div className="mb-4 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <svg className="shrink-0 w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <div className="min-w-0">
                  <p className="font-semibold text-green-800 leading-tight">Loaded from saved profile</p>
                  <p className="text-green-600 truncate leading-tight">
                    {savedProfile.name
                      ? savedProfile.name
                      : new Date(savedProfile.savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  useRunningStore.getState().resetFueling();
                  setProfilePrefilled(false);
                  setFuelFormKey(k => k + 1);
                }}
                className="shrink-0 text-green-600 hover:text-green-800 underline transition"
              >
                Clear
              </button>
            </div>
          )}

          <RunningFuelingInputForm
            key={fuelFormKey}
            prefill={Object.keys(prefill).some(k => (prefill as Record<string, unknown>)[k] != null) ? prefill : undefined}
            onSubmit={handleCalculate}
            loading={loading}
            error={error}
            fuelConfig={fuelConfig}
            onFuelConfigChange={setFuelConfig}
            totalGph={totalGph}
            gphGels={gphGels}
            gphDrinks={gphDrinks}
            gphSolids={gphSolids}
          />
        </aside>

        {/* Right: Results panel */}
        <main className="flex-1 p-5">
          {result && lastInputs ? (
            <RunningFuelingResults
              result={result}
              mlssSpeedMs={lastInputs.mlssSpeedMs}
              lt1SpeedMs={lastInputs.lt1SpeedMs}
              fatmaxSpeedMs={result.fatmaxSpeedMs}
              vlamaxMmolLS={lastInputs.vlamaxMmolLS}
              vVO2maxSpeedMs={lastInputs.vVO2maxSpeedMs}
              massKg={lastInputs.massKg}
              name={lastInputs.name ?? undefined}
              eventType={lastInputs.eventType}
              userPlannedCHO={lastInputs.targetCHO > 0 ? lastInputs.targetCHO : null}
              fuelConfig={fuelConfig}
              onFuelConfigChange={setFuelConfig}
              gphGels={gphGels}
              gphDrinks={gphDrinks}
              gphSolids={gphSolids}
            />
          ) : (
            <div className="min-h-[40vh] flex flex-col items-center justify-center text-gray-400 gap-3">
              {loading ? (
                <span className="animate-spin h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
              ) : (
                <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2} opacity={0.4}>
                  <path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 4-6"/>
                </svg>
              )}
              {!loading && (
                <>
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
                  <Link href="/calculator/fueling" className="text-xs text-gray-400 hover:text-gray-600 hover:underline mt-1">
                    ← Back to Cycling Fueling
                  </Link>
                </>
              )}
            </div>
          )}
        </main>

      </div>
    </div>
  );
}
