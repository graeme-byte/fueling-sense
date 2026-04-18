'use client';

import { useState, useEffect, useRef } from 'react';
import type {
  FuelingStrategy,
  GelItem,
  DrinkItem,
  SolidItem,
  GelSolidFreqOption,
  DrinkFreqOption,
} from '@/lib/engine/fuelingStrategy';
import {
  RATIO_OPTIONS,
  GEL_SOLID_FREQ_OPTIONS,
  DRINK_FREQ_OPTIONS,
  drinkCarbsPerServing,
  strategyToSourceBreakdown,
  strategyToFluidMlPerHour,
  FLUID_LOW_ML_H,
  FLUID_HIGH_ML_H,
  type CarbRatio,
} from '@/lib/engine/fuelingStrategy';

interface Props {
  strategy:        FuelingStrategy;
  onChange:        (s: FuelingStrategy) => void;
  plannedGph:      number;
  recommendedGph:  number;
  targetWatts:     number;
  mlssWatts:       number;
  onPowerChange:   (w: number) => void;
  displayUnit:     'g' | 'kcal';
}

function newId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

// ── NumInput: string-controlled to allow empty/partial values during typing ──

function NumInput({
  label, value, min, max, step, onChange, factor = 1, inputRef,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (n: number) => void;
  /** Multiply grams by this factor for display (e.g. 4 for kcal). Edits convert back via ÷ factor. */
  factor?: number;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const toDisplay = (g: number) => factor === 1 ? g : Math.round(g * factor);
  const [raw, setRaw] = useState(String(toDisplay(value)));

  useEffect(() => { setRaw(String(toDisplay(value))); }, [value, factor]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleBlur() {
    const displayed = parseFloat(raw);
    const grams     = isNaN(displayed) ? min : displayed / factor;
    const clamped   = Math.max(min, Math.min(max, grams));
    setRaw(String(toDisplay(clamped)));
    onChange(clamped);
  }

  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <input
        ref={inputRef}
        type="number"
        min={min * factor} max={max * factor} step={factor === 1 ? step : factor}
        value={raw}
        onChange={e => setRaw(e.target.value)}
        onBlur={handleBlur}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
      />
    </div>
  );
}

function RatioSelect({ value, onChange }: { value: CarbRatio | undefined; onChange: (r: CarbRatio) => void }) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">Ratio</label>
      <select
        value={value ?? 'Unknown'}
        onChange={e => onChange(e.target.value as CarbRatio)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
      >
        {RATIO_OPTIONS.map(r => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
    </div>
  );
}

function GelSolidFreqSelect({ value, onChange }: { value: number; onChange: (n: GelSolidFreqOption) => void }) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">Every (min)</label>
      <select
        value={value}
        onChange={e => onChange(parseInt(e.target.value) as GelSolidFreqOption)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
      >
        {GEL_SOLID_FREQ_OPTIONS.map(f => <option key={f} value={f}>{f} min</option>)}
      </select>
    </div>
  );
}

function DrinkFreqSelect({ value, onChange }: { value: number; onChange: (n: DrinkFreqOption) => void }) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">Every (min)</label>
      <select
        value={value}
        onChange={e => onChange(parseInt(e.target.value) as DrinkFreqOption)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
      >
        {DRINK_FREQ_OPTIONS.map(f => <option key={f} value={f}>{f} min</option>)}
      </select>
    </div>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} aria-label="Remove"
      className="pb-1 text-gray-300 hover:text-red-400 transition text-xl leading-none self-end"
    >
      ×
    </button>
  );
}

// ── Solid food presets ────────────────────────────────────────────────────────

const SOLID_PRESETS = [
  { label: 'Banana',  carbs: 25 },
  { label: 'Bar',     carbs: 40 },
  { label: '1/2 Bar', carbs: 20 },
  { label: 'Blocks',  carbs: 10 },
  { label: 'Other',   carbs: 10 },
] as const;

const SOLID_PRESET_NAMES = SOLID_PRESETS
  .filter(p => p.label !== 'Other')
  .map(p => p.label) as string[];

// ── Main component ────────────────────────────────────────────────────────────

export default function StrategyControls({
  strategy, onChange, plannedGph, recommendedGph,
  targetWatts, mlssWatts, onPowerChange, displayUnit,
}: Props) {

  const pctLT2        = mlssWatts > 0 ? Math.round((targetWatts / mlssWatts) * 100) : 0;
  const powerInputRef = useRef<HTMLInputElement>(null);
  const fluidMlH      = strategyToFluidMlPerHour(strategy);
  const fluidLow   = fluidMlH > 0 && fluidMlH < FLUID_LOW_ML_H;
  const fluidHigh  = fluidMlH > FLUID_HIGH_ML_H;
  const hasBothGelsAndSolids = strategy.gels.length > 0 && strategy.solids.length > 0;

  // Collision-aware per-source breakdown — matches the planned total in FuelingPlanCard
  const breakdown = strategyToSourceBreakdown(strategy);
  const { gels: gelGph, drinks: drinkGph, solids: solidGph } = breakdown;

  // Display-unit helpers (presentation only — all internals remain in grams)
  const factor  = displayUnit === 'kcal' ? 4 : 1;
  const toDisp  = (g: number) => displayUnit === 'kcal' ? Math.round(g * 4) : Math.round(g);
  const uRate   = displayUnit === 'kcal' ? 'kcal/h' : 'g/h';
  const uServe  = displayUnit === 'kcal' ? 'kcal' : 'g';

  // Raw formula-based gel rate (before collision) — shown per-item for transparency
  const gelRawGph = (gel: { carbsPerGel: number; freqMin: number }) =>
    Math.round((gel.carbsPerGel / gel.freqMin) * 60);

  // ── Gel handlers ───────────────────────────────────────────────────────────
  function addGel() {
    onChange({ ...strategy, gels: [...strategy.gels, { id: newId(), carbsPerGel: 25, ratio: '2:1', freqMin: 30 }] });
  }
  function removeGel(id: string) {
    onChange({ ...strategy, gels: strategy.gels.filter(g => g.id !== id) });
  }
  function patchGel(id: string, patch: Partial<GelItem>) {
    onChange({ ...strategy, gels: strategy.gels.map(g => g.id === id ? { ...g, ...patch } : g) });
  }

  // ── Drink handlers ─────────────────────────────────────────────────────────
  function addDrink() {
    onChange({ ...strategy, drinks: [...strategy.drinks, { id: newId(), volumeMl: 100, concGL: 60, freqMin: 10, ratio: '2:1' as CarbRatio }] });
  }
  function removeDrink(id: string) {
    onChange({ ...strategy, drinks: strategy.drinks.filter(d => d.id !== id) });
  }
  function patchDrink(id: string, patch: Partial<DrinkItem>) {
    onChange({ ...strategy, drinks: strategy.drinks.map(d => d.id === id ? { ...d, ...patch } : d) });
  }

  // ── Solid handlers ─────────────────────────────────────────────────────────
  function addSolid() {
    onChange({ ...strategy, solids: [...strategy.solids, { id: newId(), name: 'Banana', carbsPer: 25, freqMin: 60, ratio: 'Unknown' as CarbRatio }] });
  }
  function removeSolid(id: string) {
    onChange({ ...strategy, solids: strategy.solids.filter(s => s.id !== id) });
  }
  function patchSolid(id: string, patch: Partial<SolidItem>) {
    onChange({ ...strategy, solids: strategy.solids.map(s => s.id === id ? { ...s, ...patch } : s) });
  }

  const hasUnknownGel = strategy.gels.some(g => g.ratio === 'Unknown');

  return (
    <div className="space-y-6">

      {/* ── Pacing ─────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Pacing</p>
        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
          <NumInput
            label="Planned Power (W)"
            value={targetWatts}
            min={50} max={1200} step={5}
            onChange={onPowerChange}
            inputRef={powerInputRef}
          />
          <div className="pb-2.5">
            <button
              type="button"
              onClick={() => powerInputRef.current?.blur()}
              className="px-3 py-2 text-xs font-semibold text-violet-700 border border-violet-300 rounded-lg hover:bg-violet-50 transition"
            >
              Update
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">Default target: 85% LT2 ({mlssWatts > 0 ? Math.round(mlssWatts * 0.85) : '—'} W)</p>
      </div>

      {/* ── Gels ───────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Gels</p>
            {gelGph > 0 && (
              <span className="text-xs font-semibold text-violet-600">{Math.round(gelGph)} g/h ({Math.round(gelGph * 4)} kcal/h)</span>
            )}
          </div>
          <button type="button" onClick={addGel}
            className="text-xs font-semibold text-violet-600 hover:text-violet-800 transition">
            + Add gel
          </button>
        </div>

        {strategy.gels.length === 0 && (
          <p className="text-xs text-gray-400">No gels — add one or recalculate with gels enabled.</p>
        )}

        <div className="space-y-3">
          {strategy.gels.map(gel => {
            const rawGph = gelRawGph(gel);
            return (
              <div key={gel.id} className="space-y-2">
                <div className="grid grid-cols-[1fr_1.5fr_1fr_auto] gap-2 items-end">
                  <NumInput
                    label={displayUnit === 'kcal' ? 'Energy/gel (kcal)' : 'Carbs/gel (g)'}
                    value={gel.carbsPerGel}
                    min={5} max={100} step={1}
                    factor={factor}
                    onChange={v => patchGel(gel.id, { carbsPerGel: v })}
                  />
                  <RatioSelect
                    value={gel.ratio}
                    onChange={v => patchGel(gel.id, { ratio: v })}
                  />
                  <GelSolidFreqSelect value={gel.freqMin} onChange={v => patchGel(gel.id, { freqMin: v })} />
                  <RemoveBtn onClick={() => removeGel(gel.id)} />
                </div>
                <p className="text-xs text-gray-400">
                  {Math.round(rawGph)} g/h ({Math.round(rawGph * 4)} kcal/h) per gel
                  {hasBothGelsAndSolids && strategy.gels.length === 1 && rawGph !== Math.round(gelGph)
                    ? ` · ${Math.round(gelGph)} g/h effective after collision`
                    : ''}
                </p>
                {gel.ratio === 'Glucose' && plannedGph >= 60 && (
                  <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    At {Math.round(plannedGph)} g/h, glucose-only gels limit absorption. Switching to 2:1 or 1:1 reduces GI risk.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Info boxes — assumptions and overlap behaviour */}
        {(hasUnknownGel || hasBothGelsAndSolids) && (
          <div className="space-y-2 mt-3">
            {hasUnknownGel && (
              <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                Unknown gel ratio: we assume 2:1 glucose:fructose for guidance.
              </p>
            )}
            {hasBothGelsAndSolids && (
              <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                Solid food replaces gels at overlapping time points. Planned g/h reflects actual intake.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Sports drinks ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Sports drinks</p>
            {drinkGph > 0 && (
              <span className="text-xs font-semibold text-blue-600">{Math.round(drinkGph)} g/h ({Math.round(drinkGph * 4)} kcal/h)</span>
            )}
            {fluidMlH > 0 && (
              <span className={`text-xs font-semibold ${
                fluidLow  ? 'text-amber-600' :
                fluidHigh ? 'text-orange-600' :
                            'text-blue-400'
              }`}>
                · {fluidMlH} ml/h
              </span>
            )}
          </div>
          <button type="button" onClick={addDrink}
            className="text-xs font-semibold text-violet-600 hover:text-violet-800 transition">
            + Add drink
          </button>
        </div>

        {strategy.drinks.length === 0 && (
          <p className="text-xs text-gray-400">No drinks — add one or recalculate with drinks enabled.</p>
        )}

        <div className="space-y-3">
          {strategy.drinks.map(drink => {
            const carbsPerServing = drinkCarbsPerServing(drink.volumeMl, drink.concGL);
            const gphContrib      = Math.round((carbsPerServing / drink.freqMin) * 60);
            const drinkFluidMlH   = Math.round((drink.volumeMl / drink.freqMin) * 60);
            return (
              <div key={drink.id} className="space-y-1.5">
                <div className="grid grid-cols-[1fr_1fr_1.5fr_1fr_auto] gap-2 items-end">
                  <NumInput
                    label="Volume (ml)"
                    value={drink.volumeMl}
                    min={50} max={1000} step={10}
                    onChange={v => patchDrink(drink.id, { volumeMl: v })}
                  />
                  <NumInput
                    label="Conc. (g/L)"
                    value={drink.concGL}
                    min={10} max={150} step={5}
                    onChange={v => patchDrink(drink.id, { concGL: v })}
                  />
                  <RatioSelect value={drink.ratio} onChange={v => patchDrink(drink.id, { ratio: v })} />
                  <DrinkFreqSelect value={drink.freqMin} onChange={v => patchDrink(drink.id, { freqMin: v })} />
                  <RemoveBtn onClick={() => removeDrink(drink.id)} />
                </div>
                <p className="text-xs text-gray-400">
                  {Math.round(carbsPerServing)} g CHO/serving · {Math.round(gphContrib)} g/h ({Math.round(gphContrib * 4)} kcal/h) · {drinkFluidMlH} ml/h fluid
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Solid food ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Solid food</p>
            {solidGph > 0 && (
              <span className="text-xs font-semibold text-amber-600">
                {Math.round(solidGph)} g/h ({Math.round(solidGph * 4)} kcal/h)
              </span>
            )}
          </div>
          <button type="button" onClick={addSolid}
            className="text-xs font-semibold text-violet-600 hover:text-violet-800 transition">
            + Add food
          </button>
        </div>

        {strategy.solids.length === 0 && (
          <p className="text-xs text-gray-400">No solid food — add for long events or recalculate with solids enabled.</p>
        )}

        <div className="space-y-3">
          {strategy.solids.map(solid => {
            const gphContrib    = Math.round((solid.carbsPer / solid.freqMin) * 60);
            const isOther       = !SOLID_PRESET_NAMES.includes(solid.name);
            const dropdownValue = isOther ? 'Other' : solid.name;

            function handlePresetChange(label: string) {
              const preset = SOLID_PRESETS.find(p => p.label === label);
              if (!preset) return;
              if (preset.label === 'Other') {
                patchSolid(solid.id, { name: '', carbsPer: preset.carbs });
              } else {
                patchSolid(solid.id, { name: preset.label, carbsPer: preset.carbs });
              }
            }

            return (
              <div key={solid.id} className="space-y-1.5">
                <div className="grid grid-cols-[1.2fr_1fr_1.5fr_1fr_auto] gap-2 items-end">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Type</label>
                    <select
                      value={dropdownValue}
                      onChange={e => handlePresetChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    >
                      {SOLID_PRESETS.map(p => (
                        <option key={p.label} value={p.label}>
                          {`${p.label} — ${p.carbs}g (${p.carbs * 4} kcal)`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <NumInput
                    label="Carbs/serving (g)"
                    value={solid.carbsPer}
                    min={1} max={150} step={1}
                    onChange={v => patchSolid(solid.id, { carbsPer: v })}
                  />
                  <RatioSelect value={solid.ratio} onChange={v => patchSolid(solid.id, { ratio: v })} />
                  <GelSolidFreqSelect value={solid.freqMin} onChange={v => patchSolid(solid.id, { freqMin: v })} />
                  <RemoveBtn onClick={() => removeSolid(solid.id)} />
                </div>
                {isOther && (
                  <input
                    type="text"
                    value={solid.name}
                    placeholder="Name (optional)"
                    maxLength={30}
                    onChange={e => patchSolid(solid.id, { name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                )}
                <p className="text-xs text-gray-400">
                  {gphContrib} g/h ({gphContrib * 4} kcal/h) from this item
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Cautions ─────────────────────────────────────────────── */}
      {(fluidLow || fluidHigh || plannedGph >= 90) && (
        <div className="space-y-2">
          {fluidLow && (
            <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Low fluid intake ({fluidMlH} ml/h) — target 600–1000 ml/h for most conditions.
            </p>
          )}
          {fluidHigh && (
            <p className="text-xs font-semibold text-orange-800 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
              High fluid intake ({fluidMlH} ml/h) — above 1000 ml/h may require gut adaptation or race-day practice.
            </p>
          )}
          {plannedGph >= 90 && (
            <p className="text-xs font-semibold text-orange-800 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
              Above 90 g/h: requires gut training and a practiced glucose–fructose strategy.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
