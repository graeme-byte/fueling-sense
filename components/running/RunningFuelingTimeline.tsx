'use client';

import { useState } from 'react';
import type { RunFuelConfig } from '@/lib/engine/runningTypes';

function runningEventDurationMin(eventType: string): number {
  switch (eventType) {
    case 'Running 5K':    return 25;
    case 'Running 10K':   return 55;
    case 'Half Marathon': return 105;
    case 'Marathon':      return 210;
    case 'Ultra (>4h)':   return 300;
    default:              return 120;
  }
}

function fmt(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function posPct(minute: number, duration: number): number {
  return Math.min(100, Math.max(0, (minute / duration) * 100));
}

interface DotItem {
  minute:  number;
  carbsG:  number;
  label:   string;
}

interface Props {
  fuelConfig: RunFuelConfig;
  eventType:  string;
  gphGels:    number;
  gphDrinks:  number;
  gphSolids:  number;
}

const LANE_STYLES = {
  gels:   { dot: 'bg-violet-500', label: 'text-violet-700', name: 'Gels'   },
  drinks: { dot: 'bg-blue-500',   label: 'text-blue-700',   name: 'Drinks' },
  solids: { dot: 'bg-amber-500',  label: 'text-amber-700',  name: 'Solids' },
} as const;

type LaneKey = keyof typeof LANE_STYLES;

function genDots(freqMin: number, carbsG: number, label: string, duration: number): DotItem[] {
  const items: DotItem[] = [];
  for (let t = freqMin; t <= duration; t += freqMin) {
    items.push({ minute: t, carbsG, label });
  }
  return items;
}

export default function RunningFuelingTimeline({ fuelConfig, eventType, gphGels, gphDrinks, gphSolids }: Props) {
  const fullDuration = runningEventDurationMin(eventType);
  const [showFull, setShowFull] = useState(false);

  const displayDuration = showFull ? fullDuration : Math.min(120, fullDuration);

  const drinkCarbsPerServing = (fuelConfig.drinkConc * fuelConfig.drinkVol) / 1000;

  const allDots: Record<LaneKey, DotItem[]> = {
    gels:   fuelConfig.gelsOn   ? genDots(fuelConfig.gelFreq,   fuelConfig.gelCarbs,   'Gel',   displayDuration) : [],
    drinks: fuelConfig.drinksOn ? genDots(fuelConfig.drinkFreq, drinkCarbsPerServing,  'Drink', displayDuration) : [],
    solids: fuelConfig.solidsOn ? genDots(fuelConfig.solidFreq, fuelConfig.solidCarbs, 'Food',  displayDuration) : [],
  };

  const activeLanes = (Object.keys(LANE_STYLES) as LaneKey[]).filter(k => allDots[k].length > 0);
  const isEmpty     = activeLanes.length === 0;

  const totalCarbsShown = activeLanes.reduce((s, k) =>
    s + allDots[k].reduce((ss, d) => ss + d.carbsG, 0), 0,
  );

  const tickCount = Math.floor(displayDuration / 10);
  const ticks     = Array.from({ length: tickCount + 1 }, (_, i) => i * 10);

  // Suppress timeline entirely for very short events (5K)
  if (fullDuration <= 25 && isEmpty) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <p className="text-sm font-bold text-gray-800">Intake Timeline</p>
        {!isEmpty ? (
          <span className="text-xs text-gray-400">
            {fmt(displayDuration)} · {Math.round(totalCarbsShown)}g CHO total
          </span>
        ) : (
          <span className="text-xs text-gray-400">build your plan above</span>
        )}
        {fullDuration > 120 && (
          <button
            onClick={() => setShowFull(v => !v)}
            className="ml-auto text-xs font-semibold text-gray-500 hover:text-gray-800 transition shrink-0"
          >
            {showFull ? 'Show first 2h ↑' : `Full ${fmt(fullDuration)} ↓`}
          </button>
        )}
      </div>

      <div className="border-t border-gray-100 px-4 pb-5 pt-3">
        {isEmpty ? (
          <p className="text-xs text-gray-400">
            Add gels, drinks, or food above to see your intake plan here.
          </p>
        ) : (
          <div className="space-y-1">

            {/* Swim lanes */}
            {activeLanes.map(laneKey => {
              const ts    = LANE_STYLES[laneKey];
              const items = allDots[laneKey];
              return (
                <div key={laneKey} className="flex items-center gap-2">
                  <span className={`w-10 text-xs font-semibold text-right shrink-0 ${ts.label}`}>
                    {ts.name}
                  </span>
                  <div className="flex-1 relative h-7">
                    <div className="absolute inset-y-1/2 left-0 right-0 h-px bg-gray-100 -translate-y-1/2" />
                    {items.map(item => (
                      <div
                        key={item.minute}
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group"
                        style={{ left: `${posPct(item.minute, displayDuration)}%` }}
                      >
                        <div className={`w-3 h-3 rounded-full ${ts.dot} ring-2 ring-white`} />
                        <div className="hidden group-hover:block absolute bottom-5 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap bg-gray-800 text-white text-xs rounded px-2 py-1 pointer-events-none">
                          {fmt(item.minute)}: {item.label} ({Math.round(item.carbsG)}g)
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Time axis */}
            <div className="flex items-start gap-2 mt-1">
              <span className="w-10 shrink-0" />
              <div className="flex-1 relative h-5">
                {ticks.map(t => {
                  const leftPct  = posPct(t, displayDuration);
                  const showLbl  = t === 0 || t % 30 === 0 || t === displayDuration;
                  return (
                    <div
                      key={t}
                      className="absolute -translate-x-1/2 flex flex-col items-center"
                      style={{ left: `${leftPct}%` }}
                    >
                      <div className="h-1.5 w-px bg-gray-300" />
                      {showLbl && (
                        <span className="text-xs text-gray-400 mt-0.5 leading-none">
                          {t === 0 ? '0' : fmt(t)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="flex gap-4 mt-2 pt-2 border-t border-gray-50 flex-wrap">
              {activeLanes.map(laneKey => {
                const ts     = LANE_STYLES[laneKey];
                const items  = allDots[laneKey];
                const totalG = items.reduce((s, d) => s + d.carbsG, 0);
                return (
                  <div key={laneKey} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className={`w-2.5 h-2.5 rounded-full inline-block ${ts.dot}`} />
                    <span className={`font-medium ${ts.label}`}>{ts.name}</span>
                    <span>— {items.length}× · {Math.round(totalG)}g CHO</span>
                  </div>
                );
              })}
            </div>

            {fullDuration > 120 && !showFull && (
              <p className="text-xs text-gray-400 text-center pt-1">
                Showing first 2h — expand to see full {fmt(fullDuration)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
