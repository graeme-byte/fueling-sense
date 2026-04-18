'use client';

import { useState } from 'react';
import { generateTimeline, eventDurationMin, type FuelingStrategy, type TimelinePoint } from '@/lib/engine/fuelingStrategy';

interface Props {
  strategy:    FuelingStrategy;
  eventType:   string;
  displayUnit: 'g' | 'kcal';
}

// Colour palette per item type
const TYPE_STYLES = {
  gel:   { dot: 'bg-violet-500', label: 'text-violet-700', lane: 'Gels',   empty: 'bg-violet-100' },
  drink: { dot: 'bg-blue-500',   label: 'text-blue-700',   lane: 'Drinks', empty: 'bg-blue-100'   },
  solid: { dot: 'bg-amber-500',  label: 'text-amber-700',  lane: 'Food',   empty: 'bg-amber-100'  },
};

const LANE_TYPES = ['gel', 'drink', 'solid'] as const;

function fmt(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Position a dot on the track (0–100%)
function pct(minute: number, duration: number): number {
  return Math.min(100, Math.max(0, (minute / duration) * 100));
}

export default function FuelingTimeline({ strategy, eventType, displayUnit }: Props) {
  const fullDuration = eventDurationMin(eventType);
  const [showFull, setShowFull] = useState(false);

  // Display-unit helpers (presentation only)
  const toDisp = (g: number) => displayUnit === 'kcal' ? Math.round(g * 4) : Math.round(g);
  const uServe = displayUnit === 'kcal' ? 'kcal' : 'g';

  const displayDuration = showFull ? fullDuration : Math.min(120, fullDuration);
  const points = generateTimeline(strategy, displayDuration);

  const isEmpty = strategy.gels.length === 0 && strategy.drinks.length === 0 && strategy.solids.length === 0;

  // Which lane types have at least one item in the strategy?
  const activeLanes = LANE_TYPES.filter(t =>
    t === 'gel'   ? strategy.gels.length   > 0 :
    t === 'drink' ? strategy.drinks.length > 0 :
                    strategy.solids.length > 0,
  );

  // Tick marks on the 10-min grid
  const tickCount = Math.floor(displayDuration / 10);
  const ticks     = Array.from({ length: tickCount + 1 }, (_, i) => i * 10);

  // Total carbs in the displayed window
  const totalCarbsShown = points.reduce((s, p) => s + p.carbsG, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <p className="text-sm font-bold text-gray-800">Intake Timeline</p>
        {!isEmpty && (
          <span className="text-xs text-gray-400">
            {fmt(displayDuration)} · {toDisp(totalCarbsShown)}{uServe} CHO total
          </span>
        )}
        {isEmpty && (
          <span className="text-xs text-gray-400">build your plan above</span>
        )}
        {fullDuration > 120 && (
          <button
            onClick={() => setShowFull(v => !v)}
            className="ml-auto text-xs font-semibold text-gray-500 hover:text-gray-800 transition shrink-0"
          >
            {showFull ? `Show first 2h ↑` : `Full ${fmt(fullDuration)} ↓`}
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

            {/* Swim lanes — one per active item type */}
            {activeLanes.map(type => {
              const ts = TYPE_STYLES[type];
              const lanePoints: TimelinePoint[] = points.filter(p => p.type === type);

              // Deduplicate by minute (in case of multiple items of same type)
              const byMinute: Record<number, TimelinePoint[]> = {};
              for (const p of lanePoints) {
                if (!byMinute[p.minute]) byMinute[p.minute] = [];
                byMinute[p.minute].push(p);
              }
              const minutes = Object.keys(byMinute).map(Number).sort((a, b) => a - b);

              return (
                <div key={type} className="flex items-center gap-2">
                  {/* Lane label */}
                  <span className={`w-10 text-xs font-semibold text-right shrink-0 ${ts.label}`}>
                    {ts.lane}
                  </span>

                  {/* Track */}
                  <div className="flex-1 relative h-7">
                    {/* Track line */}
                    <div className="absolute inset-y-1/2 left-0 right-0 h-px bg-gray-100 -translate-y-1/2" />

                    {minutes.map(minute => {
                      const items = byMinute[minute];
                      const leftPct = pct(minute, displayDuration);
                      return (
                        <div
                          key={minute}
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group"
                          style={{ left: `${leftPct}%` }}
                        >
                          <div className={`w-3 h-3 rounded-full ${ts.dot} ring-2 ring-white`} />
                          {/* Tooltip */}
                          <div className="hidden group-hover:block absolute bottom-5 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap bg-gray-800 text-white text-xs rounded px-2 py-1 pointer-events-none">
                            {fmt(minute)}: {items.map(p => `${p.name} (${toDisp(p.carbsG)}${uServe})`).join(', ')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Time axis */}
            <div className="flex items-start gap-2 mt-1">
              <span className="w-10 shrink-0" />
              <div className="flex-1 relative h-5">
                {ticks.map(t => {
                  const leftPct = pct(t, displayDuration);
                  const showLabel = t === 0 || t % 30 === 0 || t === displayDuration;
                  return (
                    <div
                      key={t}
                      className="absolute -translate-x-1/2 flex flex-col items-center"
                      style={{ left: `${leftPct}%` }}
                    >
                      <div className="h-1.5 w-px bg-gray-300" />
                      {showLabel && (
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
            <div className="flex gap-4 mt-2 pt-2 border-t border-gray-50">
              {activeLanes.map(type => {
                const ts = TYPE_STYLES[type];
                const typePoints = points.filter(p => p.type === type);
                const totalG     = typePoints.reduce((s, p) => s + p.carbsG, 0);
                const count      = typePoints.length;
                return (
                  <div key={type} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className={`w-2.5 h-2.5 rounded-full inline-block ${ts.dot}`} />
                    <span className={`font-medium ${ts.label}`}>{ts.lane}</span>
                    <span>— {count}× · {toDisp(totalG)}{uServe} CHO</span>
                  </div>
                );
              })}
            </div>

            {fullDuration > 120 && !showFull && (
              <p className="text-xs text-gray-400 text-center pt-1">
                Showing first 2h — expand to see full {fmt(fullDuration)}
              </p>
            )}

            {strategy.gels.length > 0 && strategy.solids.length > 0 && (
              <p className="text-xs text-gray-400 pt-1 border-t border-gray-50 mt-1">
                Solid food replaces gels at overlapping time points.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
