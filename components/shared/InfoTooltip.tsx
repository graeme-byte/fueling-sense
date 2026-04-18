'use client';

import { useState, useEffect, useLayoutEffect, useRef, useId, useCallback } from 'react';
import { createPortal } from 'react-dom';

// ─────────────────────────────────────────────────────────────────
//  Canonical physiological term definitions
// ─────────────────────────────────────────────────────────────────
export const TERM_DEFINITIONS: Record<string, string> = {
  VLamax:
    'The maximum rate at which your body can release energy by converting glucose to lactate. Higher values usually support greater anaerobic power, but are often associated with higher carbohydrate use at hard intensities.',
  VO2max:
    'Your maximum ability to use oxygen to produce energy. Higher values support higher sustainable power and speed.',
  LT1:
    'The intensity where your body begins to rely more on carbohydrate alongside fat. Often used as a guide for easy and aerobic training.',
  LT2:
    'The second lactate threshold (LT2) is the highest intensity where lactate production and clearance are balanced.',
  FATmax:
    'The intensity where fat burning is highest. A key reference point for endurance efficiency.',
  CARB90:
    'The intensity where carbohydrate demand reaches ~90g per hour. Above this, fueling becomes harder to sustain.',
};

interface Props {
  term: keyof typeof TERM_DEFINITIONS;
}

interface PopupPos {
  top:       number;
  left:      number;
  arrowLeft: number;        // arrow offset from tooltip left edge (px)
  placement: 'above' | 'below';
}

const TOOLTIP_W   = 256;   // w-64
const MARGIN      = 8;     // min gap from viewport edge
const ARROW_H     = 8;     // height of CSS arrow (border-4)
const GAP         = 4;     // gap between arrow tip and button edge
const FALLBACK_H  = 80;    // first-pass estimate before DOM measurement

function calcPos(btn: HTMLButtonElement, knownH?: number): PopupPos {
  const r       = btn.getBoundingClientRect();
  const centreX = r.left + r.width / 2;

  // Horizontal: centre on button, clamp to viewport
  const left = Math.max(
    MARGIN,
    Math.min(window.innerWidth - TOOLTIP_W - MARGIN, centreX - TOOLTIP_W / 2),
  );

  // Arrow: always points at the button centre regardless of clamping
  const arrowLeft = Math.max(12, Math.min(TOOLTIP_W - 12, centreX - left));

  // Vertical: prefer above; use actual height when available to avoid offset
  const h = knownH ?? FALLBACK_H;
  const placement: 'above' | 'below' =
    r.top >= h + ARROW_H + GAP + MARGIN ? 'above' : 'below';
  const top = placement === 'above'
    ? r.top   - ARROW_H - GAP - h   // bottom of tooltip flush with button top
    : r.bottom + ARROW_H + GAP;     // top of tooltip flush with button bottom

  return { top, left, arrowLeft, placement };
}

export default function InfoTooltip({ term }: Props) {
  const [open,    setOpen]    = useState(false);
  const [pos,     setPos]     = useState<PopupPos | null>(null);
  const [mounted, setMounted] = useState(false);

  const btnRef     = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const id         = useId();
  const definition = TERM_DEFINITIONS[term];

  // Gate portal rendering to client-only — prevents SSR/hydration mismatch
  useEffect(() => { setMounted(true); }, []);

  const reposition = useCallback(() => {
    if (!btnRef.current) return;
    const h = tooltipRef.current?.offsetHeight;
    setPos(calcPos(btnRef.current, h));
  }, []);

  // After the tooltip is in the DOM, measure its actual height and correct the
  // position — eliminates the gap caused by the initial fallback height estimate.
  useLayoutEffect(() => {
    if (!open || !tooltipRef.current || !btnRef.current) return;
    const h = tooltipRef.current.offsetHeight;
    setPos(calcPos(btnRef.current, h));
  }, [open]);

  const handleToggle = useCallback(() => {
    if (open) {
      setOpen(false);
      return;
    }
    if (btnRef.current) setPos(calcPos(btnRef.current));
    setOpen(true);
  }, [open]);

  // Close on outside click / tap
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent | TouchEvent) {
      if (
        btnRef.current?.contains(e.target as Node) ||
        tooltipRef.current?.contains(e.target as Node)
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

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Reposition on scroll / resize while open
  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll',  reposition, { passive: true });
    window.addEventListener('resize',  reposition, { passive: true });
    return () => {
      window.removeEventListener('scroll', reposition);
      window.removeEventListener('resize', reposition);
    };
  }, [open, reposition]);

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={btnRef}
        type="button"
        aria-label={`What is ${term}?`}
        aria-expanded={open}
        aria-controls={id}
        onClick={handleToggle}
        className="ml-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-current opacity-40 hover:opacity-80 focus:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 transition-opacity shrink-0 align-middle"
        tabIndex={0}
      >
        <span className="text-[9px] font-bold leading-none select-none">i</span>
      </button>

      {/* Portal — renders into document.body, escaping all overflow:hidden parents.
          Only active after client mount to avoid SSR/hydration mismatch. */}
      {mounted && open && pos && createPortal(
        <div
          id={id}
          ref={tooltipRef}
          role="tooltip"
          style={{
            position: 'fixed',
            top:      pos.top,
            left:     pos.left,
            width:    TOOLTIP_W,
          }}
          className="z-[9999] bg-gray-900 text-white text-xs leading-relaxed rounded-xl px-3 py-2.5 shadow-xl pointer-events-auto"
        >
          {/* Arrow — points toward the button */}
          <span
            aria-hidden="true"
            style={{ left: pos.arrowLeft }}
            className={[
              'absolute border-4 border-transparent -translate-x-1/2',
              pos.placement === 'above'
                ? 'top-full  border-t-gray-900'
                : 'bottom-full border-b-gray-900',
            ].join(' ')}
          />
          <span className="block font-semibold mb-0.5 text-white/80 text-[10px] uppercase tracking-wider">
            {term}
          </span>
          <span className="block">{definition}</span>
        </div>,
        document.body,
      )}
    </span>
  );
}
