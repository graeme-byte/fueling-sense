/**
 * runningStore.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Zustand store for the running calculator.
 *
 * ISOLATION: completely separate from fuelingStore and inscydStore.
 * No shared state with bike calculators.
 */

import { create } from 'zustand';
import type { RunningMetabolicProfile, RunningFuelingInputs, RunningFuelingResult } from '@/lib/engine/runningTypes';

interface RunningProfilerState {
  profilerResult: RunningMetabolicProfile | null;
  profilerLoading: boolean;
  profilerError: string | null;

  setProfilerResult: (result: RunningMetabolicProfile) => void;
  setProfilerLoading: (loading: boolean) => void;
  setProfilerError: (error: string | null) => void;
  resetProfiler: () => void;
}

interface RunningFuelingState {
  fuelingInputs: Partial<RunningFuelingInputs>;
  fuelingResult: RunningFuelingResult | null;
  fuelingLoading: boolean;
  fuelingError: string | null;
  pendingAutoCalculate: boolean;

  setFuelingInputs: (inputs: Partial<RunningFuelingInputs>) => void;
  setFuelingResult: (result: RunningFuelingResult) => void;
  setFuelingLoading: (loading: boolean) => void;
  setFuelingError: (error: string | null) => void;
  setPendingAutoCalculate: (v: boolean) => void;
  prefillFromRunningProfile: (
    profile: RunningMetabolicProfile,
    defaultTargetSpeedMs?: number,
    context?: { sex?: 'Male' | 'Female'; name?: string; age?: number; dietType?: string },
  ) => void;
  resetFueling: () => void;
}

type RunningStore = RunningProfilerState & RunningFuelingState;

export const useRunningStore = create<RunningStore>((set) => ({
  // Profiler state
  profilerResult:  null,
  profilerLoading: false,
  profilerError:   null,

  setProfilerResult:  (result)  => set({ profilerResult: result, profilerLoading: false, profilerError: null }),
  setProfilerLoading: (loading) => set({ profilerLoading: loading }),
  setProfilerError:   (error)   => set({ profilerError: error, profilerLoading: false }),
  resetProfiler: () => set({ profilerResult: null, profilerLoading: false, profilerError: null }),

  // Fueling state
  fuelingInputs:        {},
  fuelingResult:        null,
  fuelingLoading:       false,
  fuelingError:         null,
  pendingAutoCalculate: false,

  setFuelingInputs:        (inputs)  => set(s => ({ fuelingInputs: { ...s.fuelingInputs, ...inputs }, fuelingError: null })),
  setFuelingResult:        (result)  => set({ fuelingResult: result, fuelingLoading: false }),
  setFuelingLoading:       (loading) => set({ fuelingLoading: loading }),
  setFuelingError:         (error)   => set({ fuelingError: error, fuelingLoading: false }),
  setPendingAutoCalculate: (v)       => set({ pendingAutoCalculate: v }),

  prefillFromRunningProfile: (profile, defaultTargetSpeedMs, context) => set(s => ({
    pendingAutoCalculate: true,
    fuelingInputs: {
      ...s.fuelingInputs,
      mlssSpeedMs:    profile.primary.mlssSpeedMs,
      lt1SpeedMs:     profile.primary.lt1SpeedMs,
      vlamaxMmolLS:   profile.primary.vlamaxMmolLS,
      vo2maxMlKgMin:  profile.primary.vo2maxMlKgMin,
      massKg:         profile.bodyComposition.massKg,
      bodyFatPct:     profile.bodyComposition.bodyFatPct,
      vVO2maxSpeedMs: profile.derived.vVO2maxSpeedMs,
      targetSpeedMs:  defaultTargetSpeedMs ?? profile.primary.mlssSpeedMs,
      targetCHO:     60,
      // Athlete context — passed from the profiler form so the fueling form
      // pre-fills sex, name, age, and diet without the user re-entering them
      ...(context?.sex      !== undefined && { sex:      context.sex }),
      ...(context?.name     !== undefined && { name:     context.name }),
      ...(context?.age      !== undefined && { age:      context.age }),
      ...(context?.dietType !== undefined && { dietType: context.dietType as import('@/lib/engine/runningTypes').RunningDietType }),
    },
  })),

  resetFueling: () => set({ fuelingInputs: {}, fuelingResult: null, fuelingLoading: false, fuelingError: null, pendingAutoCalculate: false }),
}));
