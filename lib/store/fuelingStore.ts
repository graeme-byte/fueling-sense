import { create } from 'zustand';
import type { FuelingInputs, FuelingResult } from '@/lib/types';

interface FuelingStore {
  inputs:  Partial<FuelingInputs>;
  result:  FuelingResult | null;
  loading: boolean;
  error:   string | null;
  savedId: string | null;

  setInputs:  (inputs: Partial<FuelingInputs>) => void;
  setResult:  (result: FuelingResult, savedId?: string) => void;
  setLoading: (loading: boolean) => void;
  setError:   (error: string | null) => void;
  prefillFromInscyd: (prefill: Partial<FuelingInputs>) => void;
  reset: () => void;
}

export const useFuelingStore = create<FuelingStore>((set) => ({
  inputs:  {},
  result:  null,
  loading: false,
  error:   null,
  savedId: null,

  setInputs: (inputs) => set(s => ({ inputs: { ...s.inputs, ...inputs }, error: null })),
  setResult: (result, savedId) => set({ result, savedId: savedId ?? null, loading: false }),
  setLoading: (loading) => set({ loading }),
  setError:   (error)   => set({ error, loading: false }),
  prefillFromInscyd: (prefill) => set(s => ({ inputs: { ...s.inputs, ...prefill } })),
  reset: () => set({ inputs: {}, result: null, error: null, savedId: null }),
}));
