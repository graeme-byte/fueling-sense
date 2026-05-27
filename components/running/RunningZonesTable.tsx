'use client';

import { useState, useEffect, useRef, useId } from 'react';
import type { RunningProfilerZone } from '@/lib/engine/runningTypes';
import { ZONE_INFO, ZONE_DOT, ZONE_ROW_BG } from '@/lib/zones/zoneDefinitions';

interface Props {
  zones: RunningProfilerZone[];
}

// Mirrors the ZoneInfoPopover in ProfilerResultsV06.tsx — same visual style.
function ZoneInfoPopover({ zoneName }: { zoneName: string }) {
  const info   = ZONE_INFO[zoneName];
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const id     = useId();

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent | TouchEvent) {
      if (
        btnRef.current?.contains(e.target as Node) ||
        popRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  if (!info) return null;

  return (
    <span className="relative inline-flex items-center shrink-0">
      <button
        ref={btnRef}
        type="button"
        aria-label={`About ${zoneName}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-gray-400 opacity-40 hover:opacity-80 focus:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 transition-opacity"
        tabIndex={0}
      >
        <span className="text-[9px] font-bold leading-none select-none text-gray-700">i</span>
      </button>

      {open && (
        <div
          id={id}
          ref={popRef}
          role="tooltip"
          className="absolute bottom-full right-0 mb-2 z-50 w-64 max-w-[min(16rem,90vw)] bg-gray-900 text-white text-xs leading-relaxed rounded-xl px-3 py-3 shadow-xl pointer-events-auto"
        >
          <span
            className="absolute top-full right-2 border-4 border-transparent border-t-gray-900"
            aria-hidden="true"
          />
          <p className="font-black text-white text-[10px] uppercase tracking-wider mb-2">{zoneName}</p>
          <div className="space-y-1.5">
            <div>
              <p className="text-white/50 text-[9px] uppercase tracking-wider leading-none mb-0.5">Purpose</p>
              <p className="text-white/90">{info.purpose}</p>
            </div>
            <div>
              <p className="text-white/50 text-[9px] uppercase tracking-wider leading-none mb-0.5">Physiology</p>
              <p className="text-white/90">{info.physiology}</p>
            </div>
            <div>
              <p className="text-white/50 text-[9px] uppercase tracking-wider leading-none mb-0.5">Best used for</p>
              <p className="text-white/90">{info.bestFor}</p>
            </div>
            {info.note && (
              <p className="text-amber-300/80 italic">{info.note}</p>
            )}
          </div>
        </div>
      )}
    </span>
  );
}

// Bike-aligned running zone table — intensity anchors only, no substrate columns.
// Accepts RunningProfilerZone[] produced by buildRunningProfilerZones().
export default function RunningZonesTable({ zones }: Props) {
  return (
    <div className="flex flex-col gap-1">
      {zones.map(z => {
        const dot = ZONE_DOT[z.name] ?? 'bg-gray-400';
        const row = ZONE_ROW_BG[z.name] ?? 'bg-gray-50 hover:bg-gray-100';
        return (
          <div
            key={z.name}
            className={`flex items-center gap-3 rounded-lg px-4 py-2.5 transition-colors ${row}`}
          >
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
            <span className="text-xs font-black text-gray-700 w-14 shrink-0">{z.name}</span>
            <span className="text-xs text-gray-500 flex-1">{z.label}</span>
            <ZoneInfoPopover zoneName={z.name} />
            <span className="text-sm font-bold text-gray-800 tabular-nums ml-2 font-mono whitespace-nowrap">
              {z.paceRange}
            </span>
          </div>
        );
      })}
    </div>
  );
}
