'use client';

import { useState, useEffect } from 'react';

function SexButton({ value, current, onChange }: { value: string; current: string; onChange: (v: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition ${
        current === value
          ? 'bg-violet-600 text-white border-violet-600'
          : 'bg-white text-gray-600 border-gray-200 hover:border-violet-400'
      }`}
    >
      {value}
    </button>
  );
}
import { useFuelingStore } from '@/lib/store/fuelingStore';
import type { FuelingInputs, DietType, Sex, EventType } from '@/lib/types';
import {
  defaultConfigForEventType,
  type FuelSourceConfig,
} from '@/lib/engine/fuelingStrategy';
import type { SavedProfileData } from '@/app/actions/profile';

interface Props {
  onSubmit:              (inputs: FuelingInputs, config: FuelSourceConfig) => void;
  loading:               boolean;
  savedProfile:          SavedProfileData | null;
  onClear?:              () => void;
  effectivePowerW?:      number;
  onTargetPowerChange?:  (w: number) => void;
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

export default function FuelingInputForm({ onSubmit, loading, savedProfile, onClear, effectivePowerW, onTargetPowerChange }: Props) {
  const { inputs, error } = useFuelingStore();
  const [sexState, setSexState] = useState<string>(inputs.sex ?? 'Male');

  const isPreFilled = !!inputs.inscydResultId;

  const [fuelConfig, setFuelConfig] = useState<FuelSourceConfig>(() =>
    defaultConfigForEventType(inputs.eventType ?? 'Cycling 2–4h'),
  );

  // Controlled target power state — syncs from effectivePowerW (post-calculation live value)
  const mlssWattsVal = inputs.mlssWatts ?? 0;
  function defaultPowerForEventType(et: EventType, mlss: number): number {
    const pct = et.includes('<2h') ? 0.95 : et.includes('>4h') ? 0.75 : 0.85;
    return mlss > 0 ? Math.round(mlss * pct) : 0;
  }
  const [powerW, setPowerW] = useState<string>(() => {
    if (effectivePowerW && effectivePowerW > 0) return String(Math.round(effectivePowerW));
    const def = defaultPowerForEventType(inputs.eventType ?? 'Cycling 2–4h', mlssWattsVal);
    return def > 0 ? String(def) : '';
  });

  // Sync target power when a new calculation result arrives (effectivePowerW changes)
  useEffect(() => {
    if (effectivePowerW && effectivePowerW > 0) {
      setPowerW(String(Math.round(effectivePowerW)));
    }
  }, [effectivePowerW]);

  function handleEventTypeChange(newType: EventType) {
    setFuelConfig(prev => ({
      ...prev,
      solids: { enabled: newType.includes('>4h') },
    }));
    // Auto-update target power default when event type changes
    if (mlssWattsVal > 0) {
      setPowerW(String(defaultPowerForEventType(newType, mlssWattsVal)));
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

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

    const parsedPowerW = Math.round(parseFloat(powerW));
    const data: FuelingInputs = {
      name:     (fd.get('name') as string).trim() || 'Athlete',
      sex:      fd.get('sex') as Sex,
      weight:   parseFloat(fd.get('weight') as string),
      bodyFat:  parseFloat(fd.get('bodyFat') as string),
      dietType: fd.get('dietType') as DietType,
      eventType,
      mlssWatts,
      lt1Watts:     parseFloat(fd.get('lt1Watts') as string) || 0,
      vlamax:       parseFloat(fd.get('vlamax') as string) || undefined,
      // Use sidebar target power if set, else fall back to event-duration default
      targetWatts:    !isNaN(parsedPowerW) && parsedPowerW >= 50 ? parsedPowerW : Math.round(mlssWatts * defaultPacingPct),
      targetCHO:      0,
      inscydResultId: inputs.inscydResultId,
      vo2maxMlKgMin:  parseFloat(fd.get('vo2maxMlKgMin') as string) || inputs.vo2maxMlKgMin,
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
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Athlete</p>
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Name / ID (optional)</label>
            <input
              name="name"
              type="text"
              placeholder="e.g. Jane Smith"
              defaultValue={inputs.name}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Sex</label>
            <div className="flex gap-2">
              {SEXES.map(s => (
                <SexButton key={s} value={s} current={sexState} onChange={setSexState} />
              ))}
            </div>
            <input type="hidden" name="sex" value={sexState} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Diet *</label>
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

      <hr className="border-gray-100" />

      {/* Body composition */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Body Composition</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Body mass (kg) *</label>
            <input
              name="weight"
              type="number"
              required min={30} max={250} step={0.5}
              defaultValue={inputs.weight}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Body fat (%) *</label>
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

      <hr className="border-gray-100" />

      {/* Metabolic Anchors */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Metabolic Anchors</p>
        <p className="text-xs text-gray-400 mb-3">From cycling profiler — power in watts</p>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">LT2 (W) *</label>
              <input
                name="mlssWatts"
                type="number"
                required min={50} max={1200} step={1}
                defaultValue={inputs.mlssWatts}
                placeholder="270"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">LT1 (W)</label>
              <input
                name="lt1Watts"
                type="number"
                min={50} max={1200} step={1}
                defaultValue={inputs.lt1Watts}
                placeholder="200"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">VLamax (mmol/L/s)</label>
              <input
                name="vlamax"
                type="number"
                min={0.10} max={1.50} step={0.01}
                defaultValue={inputs.vlamax}
                placeholder="0.45"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">VO2max (mL/kg/min)</label>
              <input
                name="vo2maxMlKgMin"
                type="number"
                min={10} max={100} step={0.1}
                defaultValue={inputs.vo2maxMlKgMin != null ? Math.round(inputs.vo2maxMlKgMin * 10) / 10 : ''}
                placeholder="57.0"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Session targets */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Select Your Race Target</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Event Type &amp; Duration *</label>
            <select
              name="eventType"
              required
              defaultValue={inputs.eventType ?? 'Cycling 2–4h'}
              onChange={e => handleEventTypeChange(e.target.value as EventType)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              {EVENT_TYPES.map(e => <option key={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Target power (W)</label>
            <input
              type="number"
              min={50} max={1200} step={1}
              value={powerW}
              placeholder={mlssWattsVal > 0 ? String(Math.round(mlssWattsVal * 0.85)) : '—'}
              onChange={e => setPowerW(e.target.value)}
              onBlur={() => {
                const v = Math.round(parseFloat(powerW));
                if (!isNaN(v) && v >= 50 && v <= 1200) {
                  setPowerW(String(v));
                  onTargetPowerChange?.(v);
                }
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            {powerW && !isNaN(parseFloat(powerW)) && mlssWattsVal > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                {Math.round((parseFloat(powerW) / mlssWattsVal) * 100)}% LT2
              </p>
            )}
          </div>
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
