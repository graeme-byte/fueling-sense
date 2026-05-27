'use client';

import { useState, useCallback, useEffect } from 'react';
import type { RunningFuelingInputs, RunningEventType, RunningDietType, RunFuelConfig } from '@/lib/engine/runningTypes';
import { formatPace } from '@/lib/engine/runningMetabolicEngine';

const EVENT_TYPES: RunningEventType[] = [
  'Running 5K',
  'Running 10K',
  'Half Marathon',
  'Marathon',
  'Ultra (>4h)',
];

const EVENT_LT2_FRACTION: Record<RunningEventType, number> = {
  'Running 5K':    0.98,
  'Running 10K':   0.92,
  'Half Marathon': 0.86,
  'Marathon':      0.80,
  'Ultra (>4h)':   0.72,
};

interface Props {
  prefill?:           Partial<RunningFuelingInputs>;
  onSubmit:           (inputs: RunningFuelingInputs) => void;
  loading:            boolean;
  error:              string | null;
  fuelConfig:         RunFuelConfig;
  onFuelConfigChange: (c: RunFuelConfig) => void;
  totalGph:           number;
  gphGels:            number;
  gphDrinks:          number;
  gphSolids:          number;
}

function paceStringToMs(pace: string): number | null {
  const match = pace.match(/^(\d+):(\d{2})$/);
  if (!match) return null;
  const sec = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  return sec > 0 ? 1000 / sec : null;
}

function msToPaceString(ms: number): string {
  if (!ms || ms <= 0) return '';
  const sec = Math.round(1000 / ms);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function SourceToggle({ label, enabled, activeClass, onToggle }: {
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

export default function RunningFuelingInputForm({
  prefill, onSubmit, loading, error,
  fuelConfig, onFuelConfigChange, totalGph,
}: Props) {
  const [nameInput,       setNameInput]       = useState(prefill?.name ?? '');
  const [sex,             setSex]             = useState<'Male' | 'Female'>(prefill?.sex ?? 'Male');
  const [dietType,        setDietType]        = useState<RunningDietType>(prefill?.dietType ?? 'Standard');
  const [eventType,       setEventType]       = useState<RunningEventType>(prefill?.eventType ?? 'Half Marathon');
  const [plannedCHOInput, setPlannedCHOInput] = useState('');

  const lt2Speed     = prefill?.mlssSpeedMs ?? 0;
  const autoTargetMs = lt2Speed > 0 ? lt2Speed * EVENT_LT2_FRACTION[eventType] : 0;
  const [targetPaceInput, setTargetPaceInput] = useState(
    prefill?.targetSpeedMs ? msToPaceString(prefill.targetSpeedMs) : (autoTargetMs > 0 ? msToPaceString(autoTargetMs) : ''),
  );

  useEffect(() => {
    if (lt2Speed > 0) {
      setTargetPaceInput(msToPaceString(lt2Speed * EVENT_LT2_FRACTION[eventType]));
    }
  }, [eventType, lt2Speed]);

  // Auto-enable solids for long events when event type changes
  useEffect(() => {
    if (eventType === 'Marathon' || eventType === 'Ultra (>4h)') {
      onFuelConfigChange({ ...fuelConfig, solidsOn: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType]);

  const targetSpeedMs = paceStringToMs(targetPaceInput) ?? autoTargetMs;

  const handleSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    // If the user typed an explicit planned CHO, use it; otherwise 0 (means "not set")
    const parsedPlanned = plannedCHOInput.trim() !== '' ? parseFloat(plannedCHOInput) : 0;
    const inputs: RunningFuelingInputs = {
      ...(nameInput.trim() && { name: nameInput.trim() }),
      sex,
      dietType,
      eventType,
      massKg:        parseFloat(fd.get('massKg')        as string),
      bodyFatPct:    parseFloat(fd.get('bodyFatPct')    as string),
      mlssSpeedMs:   parseFloat(fd.get('mlssSpeedMs')   as string),
      lt1SpeedMs:    parseFloat(fd.get('lt1SpeedMs')    as string),
      vlamaxMmolLS:  parseFloat(fd.get('vlamaxMmolLS')  as string),
      vo2maxMlKgMin: parseFloat(fd.get('vo2maxMlKgMin') as string),
      targetSpeedMs: targetSpeedMs > 0 ? targetSpeedMs : parseFloat(fd.get('mlssSpeedMs') as string),
      targetCHO:     isNaN(parsedPlanned) || parsedPlanned <= 0 ? 0 : parsedPlanned,
    };
    onSubmit(inputs);
  }, [nameInput, sex, dietType, eventType, targetSpeedMs, plannedCHOInput, onSubmit]);

  const inputCls   = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';
  const labelCls   = 'block text-xs font-semibold text-gray-600 mb-1';
  const sectionCls = 'text-xs font-bold uppercase tracking-wider text-gray-400 mb-3';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Athlete */}
      <div>
        <p className={sectionCls}>Athlete</p>
        <div className="space-y-2">
          <div>
            <label className={labelCls}>Name / ID (optional)</label>
            <input
              type="text"
              placeholder="e.g. Jane Smith"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Sex</label>
            <select value={sex} onChange={e => setSex(e.target.value as 'Male' | 'Female')} className={inputCls}>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Diet *</label>
            <select value={dietType} onChange={e => setDietType(e.target.value as RunningDietType)} className={inputCls}>
              <option value="Standard">Standard</option>
              <option value="Keto">Fat adapted</option>
            </select>
          </div>
        </div>
      </div>

      <hr className="border-gray-100" />

      {/* Body Composition */}
      <div>
        <p className={sectionCls}>Body Composition</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Body mass (kg) *</label>
            <input name="massKg" type="number" step="0.1" min={30} max={250} required
              defaultValue={prefill?.massKg ?? ''} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Body fat (%) *</label>
            <input name="bodyFatPct" type="number" step="0.1" min={1} max={50} required
              defaultValue={prefill?.bodyFatPct ?? ''} className={inputCls} />
          </div>
        </div>
      </div>

      <hr className="border-gray-100" />

      {/* Metabolic Anchors */}
      <div>
        <p className={sectionCls}>Metabolic Anchors</p>
        <p className="text-xs text-gray-400 mb-3">From running profiler — speeds in m/s</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>LT2 (m/s) *</label>
            <input name="mlssSpeedMs" type="number" step="0.01" min={0.5} max={10} required
              defaultValue={prefill?.mlssSpeedMs?.toFixed(2) ?? ''} className={inputCls} />
            {prefill?.mlssSpeedMs && (
              <p className="text-xs text-emerald-600 mt-0.5">{formatPace(prefill.mlssSpeedMs)}</p>
            )}
          </div>
          <div>
            <label className={labelCls}>LT1 (m/s)</label>
            <input name="lt1SpeedMs" type="number" step="0.01" min={0.3} max={9} required
              defaultValue={prefill?.lt1SpeedMs?.toFixed(2) ?? ''} className={inputCls} />
            {prefill?.lt1SpeedMs && (
              <p className="text-xs text-emerald-600 mt-0.5">{formatPace(prefill.lt1SpeedMs)}</p>
            )}
          </div>
          <div>
            <label className={labelCls}>VLamax (mmol/L/s)</label>
            <input name="vlamaxMmolLS" type="number" step="0.01" min={0.05} max={0.80} required
              defaultValue={prefill?.vlamaxMmolLS?.toFixed(2) ?? ''} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>VO2max (mL/kg/min)</label>
            <input name="vo2maxMlKgMin" type="number" step="0.1" min={10} max={100} required
              defaultValue={prefill?.vo2maxMlKgMin?.toFixed(1) ?? ''} className={inputCls} />
          </div>
        </div>
      </div>

      <hr className="border-gray-100" />

      {/* Select Your Race Target */}
      <div>
        <p className={sectionCls}>Select Your Race Target</p>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Event Type &amp; Duration *</label>
            <select
              value={eventType}
              onChange={e => setEventType(e.target.value as RunningEventType)}
              className={inputCls}
            >
              {EVENT_TYPES.map(et => <option key={et} value={et}>{et}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Target pace (min:ss /km)</label>
            <input
              type="text"
              pattern="\d+:\d{2}"
              placeholder="e.g. 5:30"
              value={targetPaceInput}
              onChange={e => setTargetPaceInput(e.target.value)}
              className={inputCls}
            />
            {targetSpeedMs > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                {targetSpeedMs.toFixed(2)} m/s
                {prefill?.mlssSpeedMs && ` · ${Math.round((targetSpeedMs / prefill.mlssSpeedMs) * 100)}% LT2`}
              </p>
            )}
          </div>
        </div>
      </div>

      <hr className="border-gray-100" />

      {/* Select Your Fuel Sources */}
      <div>
        <p className={sectionCls}>Select Your Fuel Sources</p>
        <div className="flex gap-2 mb-3">
          <SourceToggle label="Gels"   enabled={fuelConfig.gelsOn}   activeClass="bg-emerald-100 text-emerald-700" onToggle={() => onFuelConfigChange({ ...fuelConfig, gelsOn:   !fuelConfig.gelsOn })} />
          <SourceToggle label="Drinks" enabled={fuelConfig.drinksOn} activeClass="bg-blue-100 text-blue-700"       onToggle={() => onFuelConfigChange({ ...fuelConfig, drinksOn: !fuelConfig.drinksOn })} />
          <SourceToggle label="Solids" enabled={fuelConfig.solidsOn} activeClass="bg-amber-100 text-amber-700"     onToggle={() => onFuelConfigChange({ ...fuelConfig, solidsOn: !fuelConfig.solidsOn })} />
        </div>
        {!fuelConfig.gelsOn && !fuelConfig.drinksOn && !fuelConfig.solidsOn && (
          <p className="text-xs text-gray-400 mb-2">Enable at least one source to generate a plan.</p>
        )}

        <div className="mt-3 space-y-1">
          <label className={labelCls}>
            Planned CHO (g/h)
            <span className="text-gray-400 font-normal"> — optional</span>
          </label>
          <input
            type="number"
            min={0}
            max={300}
            step={1}
            placeholder="e.g. 90"
            value={plannedCHOInput}
            onChange={e => setPlannedCHOInput(e.target.value)}
            className={inputCls}
          />
          <p className="text-xs text-gray-400">
            {plannedCHOInput.trim() !== ''
              ? 'This target will be compared to the engine recommendation.'
              : totalGph > 0
                ? `Fuel sources total: ${totalGph} g/h — leave blank to auto-plan`
                : 'Leave blank to use the recommended intake as guide'}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <button type="submit" disabled={loading}
        className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-xl text-sm hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
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
