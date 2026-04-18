'use client';

import { useState } from 'react';
import { useFuelingStore } from '@/lib/store/fuelingStore';
import type { FuelingInputs, DietType, Sex, EventType } from '@/lib/types';
import {
  defaultConfigForEventType,
  type FuelSourceConfig,
} from '@/lib/engine/fuelingStrategy';
import type { SavedProfileData } from '@/app/actions/profile';

interface Props {
  onSubmit:     (inputs: FuelingInputs, config: FuelSourceConfig) => void;
  loading:      boolean;
  savedProfile: SavedProfileData | null;
  onClear?:     () => void;
}

const SEXES: Sex[]           = ['Male', 'Female'];
const EVENT_TYPES: EventType[] = [
  'Cycling <2h', 'Cycling 2–4h', 'Cycling >4h',
  'Triathlon <2h', 'Triathlon 2–4h', 'Triathlon >4h',
];

// ── Source toggle pill ────────────────────────────────────────────────────────

function SourceToggle({
  label, enabled, activeClass, onToggle,
}: {
  label: string; enabled: boolean; activeClass: string; onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition ${
        enabled
          ? `${activeClass} border-transparent`
          : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
      }`}
    >
      {label}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FuelingInputForm({ onSubmit, loading, savedProfile, onClear }: Props) {
  const { inputs, error } = useFuelingStore();

  const isPreFilled = !!inputs.inscydResultId;

  const [fuelConfig, setFuelConfig] = useState<FuelSourceConfig>(() =>
    defaultConfigForEventType(inputs.eventType ?? 'Cycling 2–4h'),
  );

  function handleEventTypeChange(newType: EventType) {
    setFuelConfig(prev => ({
      ...prev,
      solids: { enabled: newType.includes('>4h') },
    }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const ageRaw    = parseFloat(fd.get('age') as string);
    const mlssWatts = parseFloat(fd.get('mlssWatts') as string);
    const eventType = fd.get('eventType') as EventType;

    // Event-duration-based default starting power.
    // <2h → 95% LT2 (short, high-intensity)
    // 2–4h → 85% LT2 (medium effort)
    // >4h → 75% LT2 (long-day pacing)
    const defaultPacingPct =
      eventType.includes('<2h') ? 0.95 :
      eventType.includes('>4h') ? 0.75 :
      0.85;

    const data: FuelingInputs = {
      name:     (fd.get('name') as string).trim() || 'Athlete',
      sex:      fd.get('sex') as Sex,
      age:      isNaN(ageRaw) ? undefined : Math.round(ageRaw),
      weight:   parseFloat(fd.get('weight') as string),
      bodyFat:  parseFloat(fd.get('bodyFat') as string),
      dietType: fd.get('dietType') as DietType,
      eventType,
      mlssWatts,
      lt1Watts:     parseFloat(fd.get('lt1Watts') as string) || 0,
      vlamax:       parseFloat(fd.get('vlamax') as string) || undefined,
      // Default power derived from event duration; user can adjust in the planner.
      targetWatts:    Math.round(mlssWatts * defaultPacingPct),
      targetCHO:      0,
      inscydResultId: inputs.inscydResultId,
      vo2maxMlKgMin:  inputs.vo2maxMlKgMin,
    };
    onSubmit(data, fuelConfig);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {isPreFilled && (
        <div className="px-3 py-2 bg-violet-50 border border-violet-200 rounded-lg text-xs text-violet-700 font-semibold flex items-center gap-2">
          <span>⚡</span>
          <span>Pre-filled from your metabolic profile — LT2 &amp; VLamax set automatically</span>
        </div>
      )}

      {savedProfile && !isPreFilled && (
        <div className="px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <svg className="shrink-0 w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <div className="min-w-0">
              <p className="font-semibold text-green-800 leading-tight">Loaded from saved profile</p>
              <p className="text-green-600 truncate leading-tight">
                {savedProfile.name
                  ? savedProfile.name
                  : savedProfile.savedAt
                    ? new Date(savedProfile.savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
                    : 'Saved profile'}
                {savedProfile.name && savedProfile.savedAt && (
                  <> · Saved {new Date(savedProfile.savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</>
                )}
              </p>
            </div>
          </div>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="shrink-0 text-green-600 hover:text-green-800 underline transition"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Athlete */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Athlete</p>
        <input
          name="name"
          type="text"
          placeholder="Name / ID"
          defaultValue={inputs.name}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        <div className="grid grid-cols-3 gap-2 mt-2">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Sex</label>
            <select
              name="sex"
              defaultValue={inputs.sex ?? 'Male'}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              {SEXES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Age (optional)</label>
            <input
              name="age"
              type="number"
              min={10} max={90} step={1}
              defaultValue={inputs.age}
              placeholder="e.g. 35"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Diet *</label>
            <select
              name="dietType"
              required
              defaultValue={inputs.dietType ?? 'Standard'}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
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
            <label className="text-xs text-gray-500 mb-1 block">Weight (kg) *</label>
            <input
              name="weight"
              type="number"
              required min={30} max={250} step={0.5}
              defaultValue={inputs.weight}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Body Fat (%) *</label>
            <input
              name="bodyFat"
              type="number"
              required min={1} max={50} step={0.5}
              defaultValue={inputs.bodyFat}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>
      </div>

      {/* Performance */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Performance</p>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">LT2 (W) *</label>
              <input
                name="mlssWatts"
                type="number"
                required min={50} max={1200} step={1}
                defaultValue={inputs.mlssWatts}
                placeholder="e.g. 280"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">VLamax (mmol/L/s)</label>
              <input
                name="vlamax"
                type="number"
                min={0.10} max={1.50} step={0.01}
                defaultValue={inputs.vlamax}
                placeholder="e.g. 0.45"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>
          <input type="hidden" name="lt1Watts" value={inputs.lt1Watts ?? 0} />
          <p className="text-xs text-gray-400">
            Use your metabolic profile to auto-fill LT2 &amp; VLamax, or enter manually.
          </p>
        </div>
      </div>

      {/* Session targets */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Select Your Race Target</p>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Event Type &amp; Duration *</label>
          <select
            name="eventType"
            required
            defaultValue={inputs.eventType ?? 'Cycling 2–4h'}
            onChange={e => handleEventTypeChange(e.target.value as EventType)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            {EVENT_TYPES.map(e => <option key={e}>{e}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-1">Starting power defaults from race duration and can be adjusted in the planner.</p>
        </div>
      </div>

      {/* Fuel Sources */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Select Your Fuel Sources</p>
        <div className="flex gap-2">
          <SourceToggle
            label="Gels"
            enabled={fuelConfig.gels.enabled}
            activeClass="bg-violet-100 text-violet-700"
            onToggle={() => setFuelConfig(prev => ({ ...prev, gels: { enabled: !prev.gels.enabled } }))}
          />
          <SourceToggle
            label="Drinks"
            enabled={fuelConfig.drinks.enabled}
            activeClass="bg-blue-100 text-blue-700"
            onToggle={() => setFuelConfig(prev => ({ ...prev, drinks: { enabled: !prev.drinks.enabled } }))}
          />
          <SourceToggle
            label="Solids"
            enabled={fuelConfig.solids.enabled}
            activeClass="bg-amber-100 text-amber-700"
            onToggle={() => setFuelConfig(prev => ({ ...prev, solids: { enabled: !prev.solids.enabled } }))}
          />
        </div>
        {!fuelConfig.gels.enabled && !fuelConfig.drinks.enabled && !fuelConfig.solids.enabled && (
          <p className="text-xs text-gray-400 mt-2">Enable at least one source to generate a plan.</p>
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
          '▶ Calculate Fueling Plan'
        )}
      </button>
    </form>
  );
}
