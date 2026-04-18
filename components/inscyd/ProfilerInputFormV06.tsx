'use client';

import { useState } from 'react';
import type { MetabolicV06Inputs } from '@/lib/engine/metabolicModelV06';

/** Full payload from the form, including athlete context fields.
 *  name, sex, age, dietType do NOT affect any model calculation — context/display only. */
export interface ProfilerV06FormPayload extends MetabolicV06Inputs {
  sex:       'Male' | 'Female';
  age?:      number;    // years — display only
  name?:     string;    // athlete name / ID — display only
  dietType?: string;    // diet context — display only
}

/** Fields that can be prefilled from a saved profile.
 *  Includes power effort source inputs so the profiler can be repopulated
 *  exactly as originally entered, without reverse-deriving from outputs. */
export interface ProfilerFormPrefill {
  name?:       string;
  sex?:        'Male' | 'Female';
  age?:        number;
  dietType?:   string;
  weightKg?:   number;
  bodyFatPct?: number;
  // Source inputs — present only for profiles saved after migration 2
  p20?:        number;
  p300?:       number;
  p180?:       number;
  p360?:       number;
  p720?:       number;
}

interface Props {
  onSubmit: (payload: ProfilerV06FormPayload) => void;
  loading:  boolean;
  error:    string | null;
  prefill?: ProfilerFormPrefill;
}

export default function ProfilerInputFormV06({ onSubmit, loading, error, prefill }: Props) {
  // Auto-expand optional section if prefill contains any optional power values
  const hasOptionalPrefill = !!(prefill?.p180 || prefill?.p360 || prefill?.p720);
  const [showOptional, setShowOptional] = useState(hasOptionalPrefill);
  // Initialised from prefill on mount (key-based remount resets this on load)
  const [sex, setSex] = useState<'Male' | 'Female'>(prefill?.sex ?? 'Male');

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const rawP180 = fd.get('p180') as string;
    const rawP360 = fd.get('p360') as string;
    const rawP720 = fd.get('p720') as string;

    const rawAge  = fd.get('age')  as string;
    const rawName = (fd.get('name') as string)?.trim();
    const payload: ProfilerV06FormPayload = {
      weightKg:   parseFloat(fd.get('weightKg')   as string),
      bodyFatPct: parseFloat(fd.get('bodyFatPct') as string),
      p20:        parseFloat(fd.get('p20')        as string),
      p300:       parseFloat(fd.get('p300')       as string),
      // Optional validation inputs — parsed only when the field is non-empty
      p180: rawP180 ? parseFloat(rawP180) : undefined,
      p360: rawP360 ? parseFloat(rawP360) : undefined,
      p720: rawP720 ? parseFloat(rawP720) : undefined,
      sex,
      age:      rawAge  ? Math.round(parseFloat(rawAge)) : undefined,
      name:     rawName || undefined,
      dietType: fd.get('dietType') as string || undefined,
    };
    onSubmit(payload);
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Athlete context — name, sex, age, diet. No model impact. */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Athlete</p>
        {/* Name / ID */}
        <input
          name="name"
          type="text"
          placeholder="Name / ID (optional)"
          defaultValue={prefill?.name ?? ''}
          className={`${inputCls} mb-2`}
        />
        {/* Sex toggle */}
        <div className="flex gap-2 mb-2">
          {(['Male', 'Female'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setSex(s)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-semibold border transition ${
                sex === s
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-violet-400'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {/* Age + Diet */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Age (optional)</label>
            <input
              name="age"
              type="number"
              min={10} max={90} step={1}
              placeholder="e.g. 35"
              defaultValue={prefill?.age}
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Diet</label>
            <select name="dietType" defaultValue={prefill?.dietType ?? 'Standard'} className={inputCls}>
              <option value="Standard">Standard</option>
              <option value="Keto">Fat adapted</option>
            </select>
          </div>
        </div>
      </div>

      {/* Body composition */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Body Composition</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Mass (kg) *</label>
            <input
              name="weightKg"
              type="number"
              required min={30} max={250} step={0.5}
              placeholder="e.g. 75"
              defaultValue={prefill?.weightKg}
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Body Fat (%) *</label>
            <input
              name="bodyFatPct"
              type="number"
              required min={3} max={50} step={0.5}
              placeholder="e.g. 12"
              defaultValue={prefill?.bodyFatPct}
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* Required power efforts */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Power Efforts</p>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">P20 — 20-sec sprint (W) *</label>
            <input
              name="p20"
              type="number"
              required min={50} max={3000} step="any"
              placeholder="e.g. 900"
              defaultValue={prefill?.p20}
              className={inputCls}
            />
            <p className="text-xs text-gray-400 mt-0.5">Mean 20-second all-out power</p>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">P300 — 5-min all-out (W) *</label>
            <input
              name="p300"
              type="number"
              required min={50} max={1500} step="any"
              placeholder="e.g. 330"
              defaultValue={prefill?.p300}
              className={inputCls}
            />
            <p className="text-xs text-gray-400 mt-0.5">5-minute average power</p>
          </div>
        </div>
      </div>

      {/* Optional validation inputs — collapsible */}
      <div>
        <button
          type="button"
          onClick={() => setShowOptional(v => !v)}
          className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-gray-600 transition py-1"
        >
          <span>Validation Inputs (optional)</span>
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-200 ${showOptional ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showOptional && (
          <div className="space-y-2 pt-2 border-t border-gray-100 mt-1">
            <p className="text-xs text-gray-400 leading-relaxed pb-1">
              These efforts verify internal consistency only — they do not change VLamax, VO2max, LT1, or LT2.
            </p>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">P180 — 3-min all-out (W)</label>
              <input name="p180" type="number" min={50} max={2000} step="any" placeholder="e.g. 420" defaultValue={prefill?.p180} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">P360 — 6-min all-out (W)</label>
              <input name="p360" type="number" min={50} max={1500} step="any" placeholder="e.g. 375" defaultValue={prefill?.p360} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">P720 — 12-min all-out (W)</label>
              <input name="p720" type="number" min={50} max={1200} step="any" placeholder="e.g. 320" defaultValue={prefill?.p720} className={inputCls} />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-bold rounded-xl text-sm hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            Calculating…
          </>
        ) : (
          '▶ Calculate Profile'
        )}
      </button>

    </form>
  );
}
