import { create } from 'zustand';
import type { Inscyd4ptInputs, InscydResult } from '@/lib/types';

interface InscydStore {
  inputs:  Partial<Inscyd4ptInputs>;
  result:  InscydResult | null;
  loading: boolean;
  error:   string | null;
  savedId: string | null;

  setInputs:  (inputs: Partial<Inscyd4ptInputs>) => void;
  setResult:  (result: InscydResult, savedId?: string) => void;
  setLoading: (loading: boolean) => void;
  setError:   (error: string | null) => void;
  reset:      () => void;
}

export const useInscydStore = create<InscydStore>((set) => ({
  inputs:  {},
  result:  null,
  loading: false,
  error:   null,
  savedId: null,

  setInputs:  (inputs)  => set(s => ({ inputs: { ...s.inputs, ...inputs }, error: null })),
  setResult:  (result, savedId) => set({ result, savedId: savedId ?? null, loading: false }),
  setLoading: (loading) => set({ loading }),
  setError:   (error)   => set({ error, loading: false }),
  reset:      ()        => set({ inputs: {}, result: null, error: null, savedId: null }),
}));
