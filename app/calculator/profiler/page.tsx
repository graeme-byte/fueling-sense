'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import HeaderLogo from '@/components/shared/HeaderLogo';
import { useFuelingStore } from '@/lib/store/fuelingStore';
import { createClient } from '@/lib/supabase/client';
import ProfilerInputFormV06 from '@/components/inscyd/ProfilerInputFormV06';
import ProfilerResultsV06 from '@/components/inscyd/ProfilerResultsV06';
import type { ProfilerV06FormPayload } from '@/components/inscyd/ProfilerInputFormV06';
import type { MetabolicV06Result } from '@/lib/engine/metabolicModelV06';
import type { INSCYDToFuelingSenseBridge, SubscriptionTier } from '@/lib/types';
import LogoutButton from '@/components/LogoutButton';
import ToolSwitcher from '@/components/ToolSwitcher';
import GettingStartedPanel from '@/components/GettingStartedPanel';
import { saveProfileAction, getSavedProfileAction } from '@/app/actions/profile';
import type { SavedProfileData } from '@/app/actions/profile';

export default function ProfilerPage() {
  const router = useRouter();
  const { prefillFromInscyd } = useFuelingStore();
  const [isLoggedIn,   setIsLoggedIn]   = useState(false);
  const [tier,         setTier]         = useState<SubscriptionTier>('free');
  const [justUpgraded, setJustUpgraded] = useState(false);
  const [upgradeState, setUpgradeState] = useState<'waiting' | 'confirmed' | 'timeout'>('waiting');

  // v0.6 result state — local only (inscydStore is typed for InscydResult, not MetabolicV06Result)
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [profile,        setProfile]        = useState<MetabolicV06Result | null>(null);
  const [fuelingPrefill, setFuelingPrefill] = useState<INSCYDToFuelingSenseBridge | null>(null);
  // Athlete context — display/benchmarking only, never enters model calculations
  const [athleteSex,     setAthleteSex]     = useState<'Male' | 'Female' | undefined>(undefined);
  const [athleteAge,     setAthleteAge]     = useState<number | undefined>(undefined);
  const [athleteName,    setAthleteName]    = useState<string | undefined>(undefined);
  const [athleteDiet,    setAthleteDiet]    = useState<string | undefined>(undefined);
  // Saved profile data — loaded on mount, not auto-applied to form
  const [savedProfileData, setSavedProfileData] = useState<SavedProfileData | null>(null);
  const [profileLoaded,    setProfileLoaded]    = useState(false);
  const [profilerFormKey,  setProfilerFormKey]  = useState(0);
  // Derived — single source of truth for Pro entitlement.
  // Always comes from the /api/me response (DB subscription row), never from URL params.
  const isPro           = tier === 'pro';
  const hasSavedProfile = !!savedProfileData;
  // Save-to-profile state
  const [saveState,  setSaveState]  = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError,  setSaveError]  = useState<string>('');

  useEffect(() => {
    const upgraded = new URLSearchParams(window.location.search).get('upgraded') === '1';
    setJustUpgraded(upgraded);

    createClient().auth.getSession().then(async ({ data: { session } }) => {
      setIsLoggedIn(!!session);
      if (session) {
        const sp = await getSavedProfileAction();
        setSavedProfileData(sp);
      }
    });

    async function fetchTier(): Promise<SubscriptionTier> {
      try {
        const r = await fetch('/api/me');
        if (!r.ok) return 'free';
        const d = await r.json();
        return d?.tier === 'pro' ? 'pro' : 'free';
      } catch {
        return 'free';
      }
    }

    if (!upgraded) {
      fetchTier().then(t => setTier(t));
      return;
    }

    // Post-upgrade: poll until pro or timeout (30 s, every 2 s).
    // Stripe webhooks in production can take 15–30 s to arrive and process.
    const POLL_INTERVAL_MS = 2000;
    const POLL_TIMEOUT_MS  = 30_000;
    const startedAt = Date.now();
    let intervalId: ReturnType<typeof setInterval>;

    async function poll() {
      const t = await fetchTier();
      setTier(t);
      if (t === 'pro') {
        clearInterval(intervalId);
        setUpgradeState('confirmed');
      } else if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        clearInterval(intervalId);
        setUpgradeState('timeout');
      }
    }

    poll();
    intervalId = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, []);

  async function handleCalculate(payload: ProfilerV06FormPayload) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/inscyd/v06', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        // data.error may be a string or a Zod flatten object
        const msg = typeof data.error === 'string'
          ? data.error
          : 'Validation failed — check your inputs';
        setError(msg);
        return;
      }
      setProfile(data.profile as MetabolicV06Result);
      setFuelingPrefill(data.fuelingPrefill as INSCYDToFuelingSenseBridge);
      setAthleteSex(payload.sex);
      setAthleteAge(payload.age);
      setAthleteName(payload.name);
      setAthleteDiet(payload.dietType);
      setSaveState('idle');   // new result — save state resets
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveToProfile() {
    if (!profile || !fuelingPrefill) return;
    setSaveState('saving');
    const res = await saveProfileAction({
      modelVersion:  profile.version,
      // Source inputs — persisted for clean profiler prefill on next load
      p20Watts:      profile.inputs.p20,
      p300Watts:     profile.inputs.p300,
      p180Watts:     profile.inputs.p180,
      p360Watts:     profile.inputs.p360,
      p720Watts:     profile.inputs.p720,
      // Derived outputs
      lt1Watts:      Math.round(profile.outputs.lt1Watts),
      mlssWatts:     Math.round(profile.outputs.mlssWatts),
      vlamax:        Math.round(profile.outputs.vlamax * 100) / 100,
      vo2maxMlKgMin: profile.outputs.vo2max,
      cpWatts:       Math.round(profile.outputs.cpWatts),
      weightKg:      profile.inputs.weightKg,
      bodyFatPct:    profile.inputs.bodyFatPct,
      sex:           athleteSex,
      phenotype:     fuelingPrefill.phenotype,
      name:          athleteName,
      age:           athleteAge,
      dietType:      athleteDiet,
      resultJson:    profile as object,
    });
    if (res.ok) {
      setSaveState('saved');
      setSaveError('');
      // Refresh savedProfileData so the panel reflects the newly saved values
      getSavedProfileAction().then(sp => setSavedProfileData(sp));
    } else {
      setSaveState('error');
      setSaveError(res.error);
    }
  }

  function handleLoadProfile() {
    setProfileLoaded(true);
    setProfilerFormKey(k => k + 1);
  }

  function handleClearProfileFields() {
    setProfileLoaded(false);
    setProfilerFormKey(k => k + 1);
  }

  function handleSendToFueling() {
    if (!fuelingPrefill) return;
    // Bridge values are already mapped to FuelingInputs field names by buildV06Bridge.
    // ftpWattsProfilerOnly is not forwarded — it is absent from FuelingInputs.
    prefillFromInscyd({
      mlssWatts:      Math.round(fuelingPrefill.mlssWatts),
      lt1Watts:       Math.round(fuelingPrefill.lt1Watts),
      vlamax:         Math.round(fuelingPrefill.vlamax * 100) / 100,
      weight:         fuelingPrefill.weight,
      bodyFat:        fuelingPrefill.bodyFat,
      athleteLevel:   fuelingPrefill.suggestedLevel,
      targetWatts:    Math.round(fuelingPrefill.mlssWatts),
      targetCHO:      60,
      vo2maxMlKgMin:  fuelingPrefill.vo2maxMlKgMin,
      // inscydResultId omitted — persistence not yet wired for v0.6
    });
    router.push('/calculator/fueling');
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Upgrade banner — unchanged from previous version */}
      {justUpgraded && upgradeState === 'confirmed' && (
        <div className="bg-amber-400 text-amber-900 text-sm font-semibold text-center py-2 px-4">
          Pro unlocked — your thresholds and zones are now available
        </div>
      )}
      {justUpgraded && upgradeState === 'waiting' && tier === 'free' && (
        <div className="bg-amber-100 text-amber-800 text-sm text-center py-2 px-4">
          Confirming your subscription…
        </div>
      )}
      {justUpgraded && upgradeState === 'timeout' && (
        <div className="bg-amber-100 text-amber-800 text-sm text-center py-2 px-4 flex items-center justify-center gap-3">
          <span>We&apos;re still confirming your subscription.</span>
          <button
            onClick={() => window.location.reload()}
            className="underline font-semibold hover:text-amber-900 transition"
          >
            Refresh now
          </button>
        </div>
      )}

      {/* Header */}
      <header className="bg-white px-4 sm:px-6 py-3 flex items-center gap-3 sm:gap-4 shadow-sm border-b border-gray-100">
        <HeaderLogo href="/calculator/profiler" height={28} width={140} />
        <span className="text-gray-200 select-none hidden sm:inline">|</span>
        <div className="hidden sm:block">
          <p className="text-sm font-bold text-gray-800 leading-tight">Metabolic Profiler</p>
          <p className="text-xs text-gray-400">VO2max · VLamax · LT1 · LT2 · Critical Power</p>
        </div>
        {isPro ? (
          <span className="text-xs font-bold bg-amber-100 text-amber-700 px-3 py-1 rounded-full">✓ PRO</span>
        ) : (
          <span className="text-xs font-bold bg-green-100 text-green-700 px-3 py-1 rounded-full">FREE</span>
        )}
        {isPro && <span className="hidden sm:block"><ToolSwitcher active="profiler" /></span>}
        <div className="ml-auto flex items-center gap-3">
          <Link href="/support" className="text-xs text-gray-400 hover:text-gray-700 transition hidden sm:inline">Support</Link>
          {isLoggedIn && <LogoutButton className="text-xs text-gray-400 hover:text-gray-700 transition" />}
        </div>
      </header>

      <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-64px)]">

        {/* Left: Input panel */}
        <aside className="w-full lg:w-72 lg:min-w-64 bg-white border-b lg:border-b-0 lg:border-r border-gray-100 p-5 lg:overflow-y-auto">

          {/* Saved profile panel */}
          {isLoggedIn && savedProfileData && !profileLoaded && (
            <div className="mb-4 p-3 bg-violet-50 border border-violet-200 rounded-lg text-xs">
              <p className="font-semibold text-violet-800 leading-tight">Saved profile available</p>
              {savedProfileData.savedAt && (
                <p className="text-violet-500 mt-0.5 mb-2">
                  Saved {new Date(savedProfileData.savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              )}
              <button
                type="button"
                onClick={handleLoadProfile}
                className={`w-full py-1.5 bg-violet-600 text-white font-semibold rounded-md hover:bg-violet-700 transition ${!savedProfileData.savedAt ? 'mt-2' : ''}`}
              >
                Load saved profile
              </button>
            </div>
          )}

          {isLoggedIn && savedProfileData && profileLoaded && (
            <div className="mb-4 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <svg className="shrink-0 w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <div className="min-w-0">
                  <p className="font-semibold text-green-800 leading-tight">Profile loaded</p>
                  <p className="text-green-600 truncate leading-tight">
                    {savedProfileData.name
                      ? savedProfileData.name
                      : savedProfileData.savedAt
                        ? new Date(savedProfileData.savedAt).toLocaleDateString()
                        : 'Saved profile'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClearProfileFields}
                className="shrink-0 text-green-600 hover:text-green-800 underline transition"
              >
                Clear
              </button>
            </div>
          )}

          {/* Save result to profile — shown once a calculation exists */}
          {isLoggedIn && profile && (
            <div className={`mb-4 px-3 py-2 border rounded-lg text-xs flex items-center justify-between gap-2 ${
              saveState === 'saved' ? 'bg-green-50 border-green-200'
              : saveState === 'error' ? 'bg-red-50 border-red-200'
              : 'bg-gray-50 border-gray-200'
            }`}>
              <div className="min-w-0">
                <p className={`font-semibold leading-tight ${
                  saveState === 'saved' ? 'text-green-800'
                  : saveState === 'error' ? 'text-red-800'
                  : 'text-gray-700'
                }`}>
                  {saveState === 'saved'   ? '✓ Saved to profile'
                    : saveState === 'saving' ? 'Saving…'
                    : saveState === 'error'  ? 'Save failed'
                    : hasSavedProfile        ? 'Replace saved profile'
                    : 'Save to profile'}
                </p>
                {saveState === 'idle' && (
                  <p className="text-gray-400 leading-tight mt-0.5">
                    {hasSavedProfile
                      ? 'Replaces your current saved profile'
                      : 'Prefills Fueling Sense on future logins'}
                  </p>
                )}
                {saveState === 'error' && saveError && (
                  <p className="text-red-600 leading-tight mt-0.5">{saveError}</p>
                )}
              </div>
              {(saveState === 'idle' || saveState === 'error') && (
                <button
                  type="button"
                  onClick={handleSaveToProfile}
                  className="shrink-0 text-violet-600 hover:text-violet-800 font-semibold underline transition"
                >
                  {saveState === 'error' ? 'Retry' : hasSavedProfile ? 'Replace' : 'Save'}
                </button>
              )}
            </div>
          )}

          <ProfilerInputFormV06
            key={profilerFormKey}
            onSubmit={handleCalculate}
            loading={loading}
            error={error}
            prefill={profileLoaded && savedProfileData ? {
              name:       savedProfileData.name,
              sex:        savedProfileData.sex as 'Male' | 'Female' | undefined,
              age:        savedProfileData.age ?? undefined,
              dietType:   savedProfileData.dietType,
              weightKg:   savedProfileData.weightKg,
              bodyFatPct: savedProfileData.bodyFatPct,
              // Source inputs — present only for profiles saved after migration 2
              p20:        savedProfileData.p20Watts,
              p300:       savedProfileData.p300Watts,
              p180:       savedProfileData.p180Watts,
              p360:       savedProfileData.p360Watts,
              p720:       savedProfileData.p720Watts,
            } : undefined}
          />
        </aside>

        {/* Right: Results panel */}
        <main className="flex-1 p-5 lg:overflow-y-auto">
          <div className="hidden lg:block">
            <GettingStartedPanel context="profiler" isProUser={isPro} />
          </div>
          {profile && fuelingPrefill ? (
            <ProfilerResultsV06
              profile={profile}
              fuelingPrefill={fuelingPrefill}
              tier={tier}
              onSendToFueling={handleSendToFueling}
              name={athleteName}
              sex={athleteSex}
              age={athleteAge}
              dietType={athleteDiet}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-3">
              <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2} opacity={0.4}>
                <path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 4-6"/>
              </svg>
              <p className="text-sm">Enter your test data and click Calculate Profile</p>
              <p className="text-xs opacity-60">Protocol: 20s sprint · 5-min all-out</p>
            </div>
          )}
        </main>

      </div>
    </div>
  );
}
