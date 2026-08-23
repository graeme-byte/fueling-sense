'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import HeaderLogo from '@/components/shared/HeaderLogo';
import { useFuelingStore } from '@/lib/store/fuelingStore';
import { createClient } from '@/lib/supabase/client';
import ProfilerInputFormV06 from '@/components/inscyd/ProfilerInputFormV06';
import ProfilerResultsV06 from '@/components/inscyd/ProfilerResultsV06';
import type { ProfilerV06FormPayload } from '@/components/inscyd/ProfilerInputFormV06';
import type { MetabolicV06Result } from '@/lib/engine/metabolicModelV06';
import type { INSCYDToFuelingSenseBridge } from '@/lib/types';
import LogoutButton from '@/components/LogoutButton';
import AllToolsSwitcher from '@/components/AllToolsSwitcher';
import GettingStartedPanel from '@/components/GettingStartedPanel';
import { saveProfileAction, getSavedProfileAction } from '@/app/actions/profile';
import type { SavedProfileData } from '@/app/actions/profile';
import { savePendingResult, readPendingResult, clearPendingResult } from '@/lib/pendingResult';

export default function ProfilerPage() {
  const router = useRouter();
  const { prefillFromInscyd } = useFuelingStore();
  const [isLoggedIn,   setIsLoggedIn]   = useState(false);
  // Last submitted form payload — stashed if the user creates an account from
  // this result, so the signup round trip can regenerate it without asking
  // them to re-enter anything.
  const lastPayloadRef = useRef<ProfilerV06FormPayload | null>(null);
  // Set once a restore-triggered calculation is in flight, so the follow-up
  // effect knows to auto-save it (rather than every ordinary calculation).
  const pendingRestoreRef = useRef(false);
  const [restoredBanner, setRestoredBanner] = useState(false);

  // v0.6 result state — local only (inscydStore is typed for InscydResult, not MetabolicV06Result)
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [profile,        setProfile]        = useState<MetabolicV06Result | null>(null);
  const [fuelingPrefill, setFuelingPrefill] = useState<INSCYDToFuelingSenseBridge | null>(null);
  // Athlete context — display/benchmarking only, never enters model calculations
  const [athleteSex,     setAthleteSex]     = useState<'Male' | 'Female' | undefined>(undefined);
  const [athleteName,    setAthleteName]    = useState<string | undefined>(undefined);
  const [athleteDiet,    setAthleteDiet]    = useState<string | undefined>(undefined);
  // Saved profile data — loaded on mount, not auto-applied to form
  const [savedProfileData, setSavedProfileData] = useState<SavedProfileData | null>(null);
  const [profileLoaded,    setProfileLoaded]    = useState(false);
  const [profilerFormKey,  setProfilerFormKey]  = useState(0);
  const hasSavedProfile = !!savedProfileData;
  // Save-to-profile state
  const [saveState,  setSaveState]  = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError,  setSaveError]  = useState<string>('');

  useEffect(() => {
    createClient().auth.getSession().then(async ({ data: { session } }) => {
      setIsLoggedIn(!!session);
      if (session) {
        const sp = await getSavedProfileAction();
        setSavedProfileData(sp);

        // Restore a result stashed before signup (see handleCreateAccount below).
        const pending = readPendingResult<ProfilerV06FormPayload>('cycling-profile');
        if (pending) {
          clearPendingResult();
          pendingRestoreRef.current = true;
          handleCalculate(pending);
        }
      }
    });
  }, []);

  // Once the restored calculation lands, save it automatically — the user
  // already asked for this by clicking "Create free account" — then surface
  // an unambiguous confirmation.
  useEffect(() => {
    if (!pendingRestoreRef.current || !profile || !fuelingPrefill) return;
    pendingRestoreRef.current = false;
    handleSaveToProfile().then(() => setRestoredBanner(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, fuelingPrefill]);

  function handleCreateAccount() {
    if (!lastPayloadRef.current) return;
    savePendingResult('cycling-profile', lastPayloadRef.current);
    router.push('/login?mode=signup&redirect=/calculator/profiler');
  }

  async function handleCalculate(payload: ProfilerV06FormPayload) {
    lastPayloadRef.current = payload;
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
      setAthleteName(payload.name);
      // dietType is no longer collected on the profiler — it lives on the fueling page
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
      vo2maxMlKgMin:  fuelingPrefill.vo2maxMlKgMin != null ? Math.round(fuelingPrefill.vo2maxMlKgMin * 10) / 10 : undefined,
      name:           athleteName,
      sex:            athleteSex,
    });
    router.push('/calculator/fueling');
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Restored-after-signup confirmation */}
      {restoredBanner && (
        <div className="bg-green-100 text-green-800 text-sm font-semibold text-center py-2 px-4">
          ✓ Welcome — your cycling profile has been restored and saved to your account.
        </div>
      )}

      {/* Header */}
      <header className="bg-white px-4 sm:px-6 py-3 flex items-center gap-3 sm:gap-4 shadow-sm border-b border-gray-100">
        <HeaderLogo href="/calculator/profiler" height={28} width={140} />
        <span className="text-gray-200 select-none hidden sm:inline">|</span>
        <div className="hidden sm:block">
          <p className="text-sm font-bold text-gray-800 leading-tight">Metabolic Profiler</p>
          <p className="text-xs text-gray-400">VO2max · VLamax · LT1 · LT2</p>
        </div>
        <span className="hidden sm:block"><AllToolsSwitcher active="cycling-profiler" /></span>
        <div className="ml-auto flex items-center gap-3">
          <Link href="/support" className="text-xs text-gray-400 hover:text-gray-700 transition hidden sm:inline">Support</Link>
          {isLoggedIn && <LogoutButton className="text-xs text-gray-400 hover:text-gray-700 transition" />}
        </div>
      </header>

      <div className="flex flex-col lg:flex-row">

        {/* Left: Input panel — sticky on desktop so form stays visible while results scroll */}
        <aside className="w-full lg:w-72 lg:min-w-64 bg-white border-b lg:border-b-0 lg:border-r border-gray-100 p-5 lg:sticky lg:top-0 lg:self-start lg:max-h-screen lg:overflow-y-auto">

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

          {/* Bottom save button — mirrors top panel, for scroll-down convenience */}
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
                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-700'
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
          <div className="hidden lg:block">
            <GettingStartedPanel context="profiler" />
          </div>
          {profile && fuelingPrefill ? (
            <ProfilerResultsV06
              profile={profile}
              fuelingPrefill={fuelingPrefill}
              onSendToFueling={handleSendToFueling}
              name={athleteName}
              sex={athleteSex}
              dietType={athleteDiet}
              onSaveToProfile={handleSaveToProfile}
              saveState={saveState}
              hasSavedProfile={hasSavedProfile}
              isLoggedIn={isLoggedIn}
              onCreateAccount={handleCreateAccount}
            />
          ) : (
            <div className="min-h-[40vh] flex flex-col items-center justify-center text-gray-400 gap-3">
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
