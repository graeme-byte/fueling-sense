'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import HeaderLogo from '@/components/shared/HeaderLogo';
import LogoutButton from '@/components/LogoutButton';
import AllToolsSwitcher from '@/components/AllToolsSwitcher';
import RunningProfilerInputForm from '@/components/running/RunningProfilerInputForm';
import RunningProfilerResults from '@/components/running/RunningProfilerResults';
import type { RunningProfilerFormPayload } from '@/components/running/RunningProfilerInputForm';
import type { RunningMetabolicProfile } from '@/lib/engine/runningTypes';
import { useRunningStore } from '@/lib/store/runningStore';
import { createClient } from '@/lib/supabase/client';
import type { SubscriptionTier } from '@/lib/types';
import {
  saveRunningProfileAction,
  getSavedRunningProfileAction,
} from '@/app/actions/profile';
import type { SavedRunningProfileData } from '@/app/actions/profile';
import { RUNNING_MODEL_VERSION } from '@/lib/engine/runningMetabolicEngine';

export default function RunningProfilerPage() {
  const router = useRouter();
  const { prefillFromRunningProfile } = useRunningStore();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [tier,       setTier]       = useState<SubscriptionTier>('free');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [profile,    setProfile]    = useState<RunningMetabolicProfile | null>(null);

  // Athlete context — captured from form, forwarded to fueling prefill
  const [athleteName, setAthleteName] = useState<string | undefined>();
  const [athleteSex,  setAthleteSex]  = useState<'Male' | 'Female'>('Male');
  const [athleteDiet, setAthleteDiet] = useState<string>('Standard');

  // Saved profile state
  const [savedProfileData, setSavedProfileData] = useState<SavedRunningProfileData | null>(null);
  const [profileLoaded,    setProfileLoaded]    = useState(false);
  const [formKey,          setFormKey]          = useState(0);
  const [saveState,        setSaveState]        = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const isPro         = tier === 'pro';
  const hasSavedProfile = !!savedProfileData;

  useEffect(() => {
    createClient().auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });

    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.tier === 'pro') setTier('pro'); })
      .catch(() => {});

    getSavedRunningProfileAction()
      .then(d => { if (d) setSavedProfileData(d); })
      .catch(() => {});
  }, []);

  async function handleCalculate(payload: RunningProfilerFormPayload) {
    setLoading(true);
    setError(null);
    setAthleteName(payload.name);
    setAthleteSex(payload.sex ?? 'Male');
    setSaveState('idle');
    try {
      const res = await fetch('/api/running-profiler', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Validation failed — check your inputs');
        return;
      }
      setProfile(data.profile as RunningMetabolicProfile);
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  function handleLoadProfile() {
    if (!savedProfileData) return;
    setFormKey(k => k + 1);
    setProfileLoaded(true);
    if (savedProfileData.sex)      setAthleteSex(savedProfileData.sex as 'Male' | 'Female');
    if (savedProfileData.name)     setAthleteName(savedProfileData.name);
    if (savedProfileData.dietType) setAthleteDiet(savedProfileData.dietType);
  }

  async function handleSaveToProfile() {
    if (!profile) return;
    setSaveState('saving');
    const res = await saveRunningProfileAction({
      modelVersion:  RUNNING_MODEL_VERSION,
      sprintDistM:   profile.inputs.sprintDistanceM,
      sprintTimeS:   profile.inputs.sprintTimeS,
      threeMinDistM: profile.inputs.threeMinDistanceM,
      sixMinDistM:   profile.inputs.sixMinDistanceM,
      massKg:        profile.bodyComposition.massKg,
      bodyFatPct:    profile.bodyComposition.bodyFatPct,
      lt1SpeedMs:    profile.primary.lt1SpeedMs,
      mlssSpeedMs:   profile.primary.mlssSpeedMs,
      vlamaxMmolLS:  profile.primary.vlamaxMmolLS,
      vo2maxMlKgMin: profile.primary.vo2maxMlKgMin,
      sex:           athleteSex,
      name:          athleteName,
      dietType:      athleteDiet,
      resultJson:    profile as object,
    });
    if (res.ok) {
      setSaveState('saved');
      // Refresh local saved profile data
      getSavedRunningProfileAction().then(d => { if (d) setSavedProfileData(d); });
    } else {
      setSaveState('error');
    }
  }

  function handleSendToFueling() {
    if (!profile) return;
    // Pass all athlete context so the fueling form doesn't need re-entry
    prefillFromRunningProfile(profile, undefined, {
      sex:      athleteSex,
      name:     athleteName,
      dietType: athleteDiet,
    });
    router.push('/calculator/running-fueling');
  }

  const formPrefill = profileLoaded && savedProfileData ? {
    sprintDistanceM:   savedProfileData.sprintDistM,
    threeMinDistanceM: savedProfileData.threeMinDistM,
    sixMinDistanceM:   savedProfileData.sixMinDistM,
    massKg:            savedProfileData.massKg,
    bodyFatPct:        savedProfileData.bodyFatPct,
    sex:               savedProfileData.sex as 'Male' | 'Female' | undefined,
    name:              savedProfileData.name,
  } : undefined;

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
        <span className="hidden sm:block"><AllToolsSwitcher active="running-profiler" /></span>
        <div className="ml-auto flex items-center gap-3">
          <Link href="/support" className="text-xs text-gray-400 hover:text-gray-700 transition hidden sm:inline">Support</Link>
          {isLoggedIn && <LogoutButton className="text-xs text-gray-400 hover:text-gray-700 transition" />}
        </div>
      </header>

      <div className="flex flex-col lg:flex-row">

        {/* Left: Input panel — sticky on desktop */}
        <aside className="w-full lg:w-72 lg:min-w-64 bg-white border-b lg:border-b-0 lg:border-r border-gray-100 p-5 lg:sticky lg:top-0 lg:self-start lg:max-h-screen lg:overflow-y-auto">

          {/* Panel 1: Saved profile available — load prompt */}
          {isLoggedIn && savedProfileData && !profileLoaded && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs">
              <p className="font-semibold text-emerald-800 leading-tight">Saved profile available</p>
              {savedProfileData.savedAt && (
                <p className="text-emerald-500 mt-0.5 mb-2">
                  Saved {new Date(savedProfileData.savedAt).toLocaleDateString(undefined, {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </p>
              )}
              <button
                type="button"
                onClick={handleLoadProfile}
                className="w-full py-1.5 bg-emerald-600 text-white font-semibold rounded-md hover:bg-emerald-700 transition"
              >
                Load saved profile
              </button>
            </div>
          )}

          {/* Panel 2: Profile loaded confirmation + clear */}
          {isLoggedIn && savedProfileData && profileLoaded && (
            <div className="mb-4 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <svg className="shrink-0 w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <div className="min-w-0">
                  <p className="font-semibold text-green-800 leading-tight">Profile loaded</p>
                  <p className="text-green-600 truncate leading-tight">
                    {savedProfileData.name ?? new Date(savedProfileData.savedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setProfileLoaded(false); setFormKey(k => k + 1); }}
                className="shrink-0 text-green-600 hover:text-green-800 underline transition"
              >
                Clear
              </button>
            </div>
          )}

          {/* Panel 3: Save / Replace — shown once a calculation result exists */}
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
                      : 'Prefills Running Fueling on future logins'}
                  </p>
                )}
              </div>
              {(saveState === 'idle' || saveState === 'error') && (
                <button
                  type="button"
                  onClick={handleSaveToProfile}
                  className="shrink-0 text-emerald-600 hover:text-emerald-800 font-semibold underline transition"
                >
                  {saveState === 'error' ? 'Retry' : hasSavedProfile ? 'Replace' : 'Save'}
                </button>
              )}
            </div>
          )}

          <RunningProfilerInputForm
            key={formKey}
            onSubmit={handleCalculate}
            loading={loading}
            error={error}
            prefill={formPrefill}
          />

          {/* Bottom save button — mirrors Panel 3, for scroll-down convenience */}
          {isLoggedIn && profile && (
            <div className="mt-4">
              <button
                type="button"
                onClick={saveState === 'idle' || saveState === 'error' ? handleSaveToProfile : undefined}
                disabled={saveState === 'saving' || saveState === 'saved'}
                className={`w-full py-2 rounded-lg text-xs font-semibold border transition disabled:opacity-60 ${
                  saveState === 'saved'
                    ? 'bg-green-50 text-green-800 border-green-200'
                    : saveState === 'error'
                    ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700'
                }`}
              >
                {saveState === 'saving' ? 'Saving…'
                  : saveState === 'saved'  ? '✓ Saved to profile'
                  : saveState === 'error'  ? 'Save failed — retry'
                  : hasSavedProfile        ? '↑ Update saved profile'
                  : '↑ Save to profile'}
              </button>
            </div>
          )}
        </aside>

        {/* Right: Results panel */}
        <main className="flex-1 p-5">
          {profile ? (
            <RunningProfilerResults
              profile={profile}
              isPro={isPro}
              onSendToFueling={handleSendToFueling}
              name={athleteName}
              onSaveToProfile={isLoggedIn ? handleSaveToProfile : undefined}
              saveState={saveState}
              hasSavedProfile={hasSavedProfile}
              isLoggedIn={isLoggedIn}
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
            </div>
          )}
        </main>

      </div>
    </div>
  );
}
