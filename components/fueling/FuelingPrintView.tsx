'use client';

/**
 * FuelingPrintView — static A4-width layout captured by html2canvas for PDF export.
 *
 * Layout: exactly 2 pages, each 794 × 1123 px (A4 at 96 dpi).
 * - Page 1: Physiology & Demand
 * - Page 2: Execution & Coaching
 *
 * Page enforcement strategy:
 * - Each page div is exactly PAGE_H tall with overflow: hidden.
 *   This guarantees the html2canvas capture is exactly 2 × PAGE_H px,
 *   so the exportPdf.ts slicer always produces exactly 2 PDF pages.
 * - Content that would overflow is scaled down (0.90–1.00 range) via
 *   CSS transform before the overflow clamp takes effect.
 * - Timeline rows are capped so page 2 never needs scale < 0.90.
 *
 * Rules:
 * - No interactive elements (no buttons, tooltips, collapsibles).
 * - Inline styles only — Tailwind classes are not applied reliably by html2canvas.
 * - Fixed width 794 px. Parent positions this off-screen.
 * - Substrate chart uses solid fills (no SVG linearGradient).
 */

import { useMemo, useState, useEffect, useRef } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import type { FuelingResult, DenseSubstratePoint } from '@/lib/types';
import type { FuelingStrategy, CarbRatio } from '@/lib/engine/fuelingStrategy';
import {
  generateTimeline, eventDurationMin,
  strategyToSourceBreakdown, drinkCarbsPerServing,
  strategyToFluidMlPerHour, FLUID_LOW_ML_H,
} from '@/lib/engine/fuelingStrategy';
import {
  computeRecommendedTarget, buildGapAnalysisAdvice,
  buildFuelingStrategyAdvice, buildCarbRequirementAdvice,
} from '@/lib/engine/fuelingEngine';

// ── Page geometry ─────────────────────────────────────────────────────────────

const PAGE_H   = 1123;        // A4 at 96 dpi (px)
const PAD_V    = 32;          // vertical padding each side
const PAD_H    = 40;          // horizontal padding each side
const AVAIL_W  = 794 - PAD_H * 2;    // 714 px — usable content width
const AVAIL_H  = PAGE_H - PAD_V * 2; // 1059 px — usable content height
const MIN_SCALE         = 0.90;  // scale floor — content below this is clipped
const TIMELINE_PDF_MIN  = 120;   // PDF shows first 2 hours of intake timeline only

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  result:          FuelingResult;
  strategy:        FuelingStrategy;
  plannedGph:      number;
  requiredGph:     number;   // live required at effectivePowerW
  effectivePowerW: number;
}

// ── Pure helpers (mirrored from display components — no engine logic) ─────────

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function ratioParts(ratio: CarbRatio | undefined): { glu: number; fru: number } {
  switch (ratio) {
    case 'Glucose': return { glu: 1,       fru: 0         };
    case '2:1':     return { glu: 2 / 3,   fru: 1 / 3     };
    case '1:1':     return { glu: 0.5,     fru: 0.5       };
    case '1:0.8':   return { glu: 1 / 1.8, fru: 0.8 / 1.8 };
    default:        return { glu: 0.5,     fru: 0.5       };
  }
}

function computeGluFru(strategy: FuelingStrategy) {
  const { gels: gelGph, drinks: drinkGph, solids: solidGph } = strategyToSourceBreakdown(strategy);
  let glu = 0, fru = 0, hasUnknown = false;

  const rawGelGph = strategy.gels.reduce((s, g) => s + (g.carbsPerGel / g.freqMin) * 60, 0);
  if (rawGelGph > 0 && gelGph > 0) {
    let wGlu = 0, wFru = 0;
    for (const g of strategy.gels) {
      const w = ((g.carbsPerGel / g.freqMin) * 60) / rawGelGph;
      const p = ratioParts(g.ratio); wGlu += w * p.glu; wFru += w * p.fru;
      if (!g.ratio || g.ratio === 'Unknown') hasUnknown = true;
    }
    glu += gelGph * wGlu; fru += gelGph * wFru;
  }

  const rawDrinkGph = strategy.drinks.reduce(
    (s, d) => s + (drinkCarbsPerServing(d.volumeMl, d.concGL) / d.freqMin) * 60, 0,
  );
  if (rawDrinkGph > 0 && drinkGph > 0) {
    let wGlu = 0, wFru = 0;
    for (const d of strategy.drinks) {
      const w = ((drinkCarbsPerServing(d.volumeMl, d.concGL) / d.freqMin) * 60) / rawDrinkGph;
      const p = ratioParts(d.ratio); wGlu += w * p.glu; wFru += w * p.fru;
      if (!d.ratio || d.ratio === 'Unknown') hasUnknown = true;
    }
    glu += drinkGph * wGlu; fru += drinkGph * wFru;
  }

  const rawSolidGph = strategy.solids.reduce((s, sol) => s + (sol.carbsPer / sol.freqMin) * 60, 0);
  if (rawSolidGph > 0 && solidGph > 0) {
    let wGlu = 0, wFru = 0;
    for (const sol of strategy.solids) {
      const w = ((sol.carbsPer / sol.freqMin) * 60) / rawSolidGph;
      const p = ratioParts(sol.ratio); wGlu += w * p.glu; wFru += w * p.fru;
      if (!sol.ratio || sol.ratio === 'Unknown') hasUnknown = true;
    }
    glu += solidGph * wGlu; fru += solidGph * wFru;
  }

  return { glucoseGph: Math.round(glu), fructoseGph: Math.round(fru), hasUnknown };
}

// Zone display logic (mirrored from FuelingResults.tsx — no new equations)
interface DisplayZone { name: string; label: string; low: number; high: number; }

function buildDisplayZones(lt1Watts: number, mlssWatts: number): DisplayZone[] {
  const z1Top  = Math.round(0.56 * lt1Watts);
  const z3Mid  = Math.round((lt1Watts + mlssWatts) / 2);
  const z4Top  = Math.round(1.06 * mlssWatts);
  const z5aTop = Math.round(1.20 * mlssWatts);
  return [
    { name: 'Z1',  label: 'Recovery',         low: 0,         high: z1Top       },
    { name: 'Z2',  label: 'Base Endurance',    low: z1Top,     high: lt1Watts    },
    { name: 'Z3a', label: 'Aerobic Threshold', low: lt1Watts,  high: z3Mid       },
    { name: 'Z3b', label: 'Tempo',             low: z3Mid,     high: mlssWatts   },
    { name: 'Z4',  label: 'Threshold',         low: mlssWatts, high: z4Top       },
    { name: 'Z5a', label: 'Sub-VO\u2082max',   low: z4Top,     high: z5aTop      },
  ];
}

function lookupSubstrate(series: DenseSubstratePoint[], watts: number) {
  if (series.length === 0) return null;
  const sorted = [...series].sort((a, b) => a.watts - b.watts);
  const lo = [...sorted].reverse().find(p => p.watts <= watts);
  const hi = sorted.find(p => p.watts > watts);
  if (!lo && hi) return { fatG: hi.fatG, choG: hi.choG, kcalPerHour: hi.kcalPerHour };
  if (!hi && lo) return { fatG: lo.fatG, choG: lo.choG, kcalPerHour: lo.kcalPerHour };
  if (!lo || !hi) return null;
  const t = (watts - lo.watts) / (hi.watts - lo.watts);
  return {
    fatG:        lo.fatG        + t * (hi.fatG        - lo.fatG),
    choG:        lo.choG        + t * (hi.choG        - lo.choG),
    kcalPerHour: Math.round(lo.kcalPerHour + t * (hi.kcalPerHour - lo.kcalPerHour)),
  };
}

// ── Scale helpers ─────────────────────────────────────────────────────────────

/**
 * Returns CSS properties that shrink content to fit within AVAIL_H.
 * Width is inversely compensated so visual width stays at AVAIL_W after scaling.
 */
function scaledContentStyle(scale: number): React.CSSProperties {
  if (scale >= 1) return {};
  return {
    transform:       `scale(${scale})`,
    transformOrigin: 'top left',
    width:           `${AVAIL_W / scale}px`,
  };
}

// ── Substrate chart ───────────────────────────────────────────────────────────

function SubstrateChartPrint({ series, mlssWatts, lt1Watts, targetW, fatmaxW }: {
  series:    DenseSubstratePoint[];
  mlssWatts: number;
  lt1Watts:  number;
  targetW:   number;
  fatmaxW:   number;
}) {
  const floor    = Math.round(0.50 * mlssWatts);
  const ceiling  = Math.round(1.20 * mlssWatts);
  const chartData = series
    .filter(p => p.watts >= floor && p.watts <= ceiling)
    .map(p => ({ watts: p.watts, fat: p.fatKcalH, cho: p.choKcalH }));

  return (
    <div style={{ height: 210 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="watts" type="number" domain={['dataMin', 'dataMax']}
            tick={{ fontSize: 9 }}
            label={{ value: 'W', position: 'insideBottomRight', offset: -5, fontSize: 8 }}
          />
          <YAxis
            tick={{ fontSize: 9 }}
            label={{ value: 'kcal/h', angle: -90, position: 'insideLeft', fontSize: 8 }}
          />
          <Area type="monotone" dataKey="fat" stackId="1" stroke="#f59e0b" fill="#fef3c7" strokeWidth={1.5} dot={false} />
          <Area type="monotone" dataKey="cho" stackId="1" stroke="#3b82f6" fill="#dbeafe" strokeWidth={1.5} dot={false} />
          {lt1Watts > 0 && (
            <ReferenceLine x={Math.round(lt1Watts)} stroke="#27ae60" strokeDasharray="4 2"
              label={{ value: 'LT1', fontSize: 8, fill: '#27ae60' }} />
          )}
          <ReferenceLine x={Math.round(mlssWatts)} stroke="#f57c00" strokeDasharray="4 2"
            label={{ value: 'LT2', fontSize: 8, fill: '#f57c00' }} />
          <ReferenceLine x={fatmaxW} stroke="#f59e0b" strokeDasharray="2 2"
            label={{ value: 'FATmax', fontSize: 7, fill: '#b45309' }} />
          <ReferenceLine x={targetW} stroke="#7c3aed" strokeDasharray="4 2"
            label={{ value: 'Target', fontSize: 8, fill: '#7c3aed' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Style tokens ──────────────────────────────────────────────────────────────

/** Fixed-height page container — guarantees exactly PAGE_H px in the captured image. */
const PAGE_CONTAINER: React.CSSProperties = {
  width:           794,
  height:          PAGE_H,
  overflow:        'hidden',   // hard clip — prevents any bleed into the next page
  backgroundColor: '#ffffff',
  padding:         `${PAD_V}px ${PAD_H}px`,
  boxSizing:       'border-box',
  fontFamily:      '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  color:           '#111827',
};

const SL: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: '#9ca3af', marginBottom: 8,
};

const GAP_COLORS: Record<'GREEN' | 'AMBER' | 'RED', { bg: string; text: string; border: string }> = {
  GREEN: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  AMBER: { bg: '#fffbeb', text: '#92400e', border: '#fde68a' },
  RED:   { bg: '#fef2f2', text: '#991b1b', border: '#fecaca' },
};

function PageHeader({ title, subtitle, today }: { title: string; subtitle?: string; today: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      marginBottom: 18, paddingBottom: 12, borderBottom: '2px solid #7c3aed',
    }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 900, color: '#7c3aed', letterSpacing: '-0.5px' }}>
          Fueling Sense
        </div>
        {subtitle && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{title}</div>
        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{today}</div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FuelingPrintView({
  result, strategy, plannedGph, requiredGph, effectivePowerW,
}: Props) {
  const { inputs, fatmaxPctMLSS, carb90, ge, target } = result;

  // Scale state — one per page. Computed after mount by measuring content height.
  const p1ContentRef = useRef<HTMLDivElement>(null);
  const p2ContentRef = useRef<HTMLDivElement>(null);
  const p3ContentRef = useRef<HTMLDivElement>(null);
  const [scale1, setScale1] = useState(1);
  const [scale2, setScale2] = useState(1);
  const [scale3, setScale3] = useState(1);

  useEffect(() => {
    const fit = (el: HTMLDivElement | null): number => {
      if (!el) return 1;
      const h = el.scrollHeight;
      return h > AVAIL_H ? Math.max(MIN_SCALE, AVAIL_H / h) : 1;
    };
    const s1 = fit(p1ContentRef.current);
    const s2 = fit(p2ContentRef.current);
    const s3 = fit(p3ContentRef.current);
    setScale1(prev => (s1 !== prev ? s1 : prev));
    setScale2(prev => (s2 !== prev ? s2 : prev));
    setScale3(prev => (s3 !== prev ? s3 : prev));
  }, [strategy, plannedGph, requiredGph, effectivePowerW]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const recommendedGph = computeRecommendedTarget(requiredGph, inputs.eventType);
  const gapAdv         = buildGapAnalysisAdvice(requiredGph, plannedGph, inputs.eventType);
  const stratAdv       = buildFuelingStrategyAdvice(inputs.eventType, effectivePowerW, inputs.mlssWatts, requiredGph, plannedGph);
  const carbAdv        = buildCarbRequirementAdvice(requiredGph);
  const gapColors      = GAP_COLORS[gapAdv.level];

  const pctLT2      = Math.round((effectivePowerW / inputs.mlssWatts) * 100);
  const fatmaxW     = Math.round(fatmaxPctMLSS * inputs.mlssWatts);
  const targetW     = Math.round(effectivePowerW);
  const durationMin = eventDurationMin(inputs.eventType);

  const allTimeline = useMemo(
    () => generateTimeline(strategy, durationMin),
    [strategy, durationMin],
  );
  // PDF timeline: first 2 hours only — keeps page 2 within height budget
  const timeline          = allTimeline.filter(pt => pt.minute <= TIMELINE_PDF_MIN);
  const timelineTruncated = allTimeline.some(pt => pt.minute > TIMELINE_PDF_MIN);
  const totalCarbsG       = timeline.reduce((s, p) => s + p.carbsG, 0);
  const allTotalCarbsG    = allTimeline.reduce((s, p) => s + p.carbsG, 0);

  const { glucoseGph, fructoseGph, hasUnknown } = useMemo(
    () => computeGluFru(strategy),
    [strategy],
  );

  const fluidMlH = useMemo(() => strategyToFluidMlPerHour(strategy), [strategy]);

  const displayZones = useMemo(
    () => inputs.lt1Watts > 0 ? buildDisplayZones(inputs.lt1Watts, inputs.mlssWatts) : [],
    [inputs.lt1Watts, inputs.mlssWatts],
  );

  const activeZoneIdx = useMemo(() => displayZones.findIndex((z, i) => {
    if (i === displayZones.length - 1) return effectivePowerW >= z.low;
    return effectivePowerW >= z.low && effectivePowerW < z.high;
  }), [displayZones, effectivePowerW]);

  const { gels: gelGph, drinks: drinkGph, solids: solidGph } = useMemo(
    () => strategyToSourceBreakdown(strategy),
    [strategy],
  );

  const today = new Date().toLocaleDateString(undefined, {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const gapAbs  = Math.abs(gapAdv.gap_gph);
  const gapText = gapAdv.direction === 'ALIGNED'
    ? 'On target'
    : gapAdv.direction === 'OVER'
      ? `+${Math.round(gapAbs)} g/h above`
      : `${Math.round(gapAbs)} g/h below`;

  const zoneLabel =
    effectivePowerW < inputs.lt1Watts  ? 'Below LT1' :
    effectivePowerW < inputs.mlssWatts ? 'LT1–LT2'   :
    'Above LT2';

  const athleteLine = [
    inputs.name && inputs.name !== 'Athlete' ? inputs.name : null,
    inputs.sex,
    inputs.age ? `${inputs.age} yrs` : null,
    `${inputs.weight} kg · ${inputs.bodyFat}% BF`,
    inputs.dietType === 'Keto' ? 'Fat adapted' : 'Standard diet',
  ].filter(Boolean).join('  ·  ');

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1 — Physiology & Demand
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div style={{ width: 794, height: PAGE_H * 3, overflow: 'hidden', backgroundColor: '#ffffff' }}>

      <div style={PAGE_CONTAINER}>
        {/* Scalable content wrapper — shrinks to fit within AVAIL_H if needed */}
        <div ref={p1ContentRef} style={scaledContentStyle(scale1)}>

          <PageHeader
            title="Fueling Plan — Physiology &amp; Demand"
            subtitle="Fueling Calculator"
            today={today}
          />

          {/* Athlete + Event */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1, padding: '9px 12px', backgroundColor: '#f9fafb', borderRadius: 6 }}>
              <div style={SL}>Athlete</div>
              <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.5 }}>{athleteLine}</div>
            </div>
            <div style={{ flex: 1, padding: '9px 12px', backgroundColor: '#f9fafb', borderRadius: 6 }}>
              <div style={SL}>Event &amp; Target</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{inputs.eventType}</span>
                <span style={{ fontSize: 10, color: '#6b7280' }}>{fmtMin(durationMin)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: '#111827' }}>{targetW} W</span>
                <span style={{ padding: '1px 7px', backgroundColor: '#ede9fe', color: '#5b21b6', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>
                  {pctLT2}% LT2
                </span>
                <span style={{ fontSize: 10, color: '#6b7280' }}>{zoneLabel}</span>
              </div>
            </div>
          </div>

          {/* Physiological profile */}
          <div style={{ marginBottom: 14 }}>
            <div style={SL}>Physiological Profile</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { label: 'LT1',    value: inputs.lt1Watts > 0 ? `${Math.round(inputs.lt1Watts)}` : '—', unit: 'W',        border: '#22c55e' },
                { label: 'LT2',    value: `${Math.round(inputs.mlssWatts)}`,                            unit: 'W',        border: '#f97316' },
                { label: 'VLamax', value: inputs.vlamax != null ? inputs.vlamax.toFixed(2) : '—',       unit: 'mmol/L/s', border: '#ef4444' },
                { label: 'FATmax', value: `${fatmaxW}`,                                                 unit: 'W',        border: '#f59e0b' },
                { label: 'CARB90', value: carb90.found ? `${carb90.watts}` : `>${carb90.watts}`,        unit: 'W',        border: '#3b82f6' },
              ].map(m => (
                <div key={m.label} style={{
                  flex: 1, borderLeft: `3px solid ${m.border}`,
                  padding: '7px 9px', backgroundColor: '#f9fafb', borderRadius: '0 5px 5px 0',
                }}>
                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9ca3af' }}>{m.label}</div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#111827', lineHeight: 1.1, marginTop: 2 }}>{m.value}</div>
                  <div style={{ fontSize: 8, color: '#9ca3af', marginTop: 1 }}>{m.unit}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Fueling summary */}
          <div style={{ marginBottom: 14 }}>
            <div style={SL}>Fueling Summary</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { label: 'Required',    value: Math.round(requiredGph),    color: '#111827', border: '#6b7280' },
                { label: 'Recommended', value: Math.round(recommendedGph), color: '#7c3aed', border: '#7c3aed' },
                { label: 'Planned',     value: Math.round(plannedGph),     color: '#111827', border: '#374151' },
              ].map(m => (
                <div key={m.label} style={{
                  flex: 1, borderLeft: `4px solid ${m.border}`,
                  padding: '9px 11px', backgroundColor: '#f9fafb', borderRadius: '0 6px 6px 0',
                }}>
                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6b7280' }}>{m.label}</div>
                  <div style={{ fontSize: 19, fontWeight: 900, color: m.color, lineHeight: 1.1, marginTop: 3 }}>{m.value}</div>
                  <div style={{ fontSize: 8, color: '#9ca3af', marginTop: 1 }}>g/h</div>
                </div>
              ))}
              <div style={{ flex: 1, padding: '9px 11px', borderRadius: 6, backgroundColor: gapColors.bg, border: `1px solid ${gapColors.border}` }}>
                <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: gapColors.text }}>Gap</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: gapColors.text, marginTop: 3 }}>{gapText}</div>
                <div style={{ fontSize: 9, color: gapColors.text, marginTop: 2, opacity: 0.85, lineHeight: 1.3 }}>{gapAdv.performanceText}</div>
              </div>
              <div style={{ flex: 1, padding: '9px 11px', borderRadius: 6, backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6b7280' }}>Strategy</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#111827', marginTop: 3 }}>{stratAdv.strategyLabel}</div>
                <div style={{ fontSize: 9, color: '#6b7280', marginTop: 2 }}>
                  {stratAdv.alignment === 'WITHIN' ? 'Well paced' : stratAdv.alignment === 'ABOVE' ? 'Aggressive pacing' : 'Conservative pacing'}
                </div>
              </div>
            </div>
          </div>

          {/* Substrate oxidation chart */}
          <div style={{ marginBottom: 14 }}>
            <div style={SL}>Substrate Oxidation</div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 8px' }}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 5 }}>
                <span style={{ fontSize: 10, color: '#b45309', fontWeight: 600 }}>■ Fat (kcal/h)</span>
                <span style={{ fontSize: 10, color: '#2563eb', fontWeight: 600 }}>■ CHO (kcal/h)</span>
                <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 'auto' }}>
                  GE {(ge * 100).toFixed(1)}% · EE {target.kcalPerHour} kcal/h @ target
                </span>
              </div>
              <SubstrateChartPrint
                series={result.denseSubstrateSeries}
                mlssWatts={inputs.mlssWatts}
                lt1Watts={inputs.lt1Watts}
                targetW={targetW}
                fatmaxW={fatmaxW}
              />
            </div>
          </div>

          {/* Page 1 footer */}
          <div style={{ paddingTop: 10, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 9, color: '#d1d5db' }}>Fueling Sense · Physiology &amp; Demand</span>
            <span style={{ fontSize: 9, color: '#d1d5db' }}>Page 1 of 3</span>
          </div>

        </div>{/* end p1ContentRef */}
      </div>{/* end page 1 container */}

      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE 2 — Execution & Coaching
          ═════════════════════════════════════════════════════════════════════ */}

      <div style={PAGE_CONTAINER}>
        <div ref={p2ContentRef} style={scaledContentStyle(scale2)}>

          <PageHeader
            title="Fueling Plan — Execution &amp; Coaching"
            subtitle={athleteLine || 'Fueling Calculator'}
            today={today}
          />

          {/* Fueling plan table */}
          {(strategy.gels.length > 0 || strategy.drinks.length > 0 || strategy.solids.length > 0) && (
            <div style={{ marginBottom: 11 }}>
              <div style={SL}>Fueling Plan</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                    {['Source', 'Details', 'Ratio', 'Frequency', 'Per serving', 'g/h (kcal/h)'].map((h, i) => (
                      <th key={h} style={{
                        textAlign: i >= 4 ? 'right' : 'left',
                        padding: '3px 7px', color: '#9ca3af', fontWeight: 600, fontSize: 9, whiteSpace: 'nowrap',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {strategy.gels.map((g, i) => (
                    <tr key={g.id} style={{ backgroundColor: i % 2 === 0 ? '#f9fafb' : '#ffffff', borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '4px 7px', fontWeight: 700, color: '#7c3aed' }}>Gel</td>
                      <td style={{ padding: '4px 7px', color: '#374151' }}>{g.carbsPerGel} g per gel</td>
                      <td style={{ padding: '4px 7px', color: '#6b7280' }}>{g.ratio ?? '—'}</td>
                      <td style={{ padding: '4px 7px', color: '#6b7280' }}>every {g.freqMin} min</td>
                      <td style={{ padding: '4px 7px', textAlign: 'right', color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{g.carbsPerGel} g ({g.carbsPerGel * 4} kcal)</td>
                      <td style={{ padding: '4px 7px', textAlign: 'right', fontWeight: 700, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                        {Math.round((g.carbsPerGel / g.freqMin) * 60)} ({Math.round((g.carbsPerGel / g.freqMin) * 60 * 4)} kcal/h)
                      </td>
                    </tr>
                  ))}
                  {strategy.drinks.map((d, i) => {
                    const servingG = Math.round(drinkCarbsPerServing(d.volumeMl, d.concGL));
                    const mlH      = Math.round((d.volumeMl / d.freqMin) * 60);
                    return (
                      <tr key={d.id} style={{ backgroundColor: (strategy.gels.length + i) % 2 === 0 ? '#f9fafb' : '#ffffff', borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '4px 7px', fontWeight: 700, color: '#2563eb' }}>Drink</td>
                        <td style={{ padding: '4px 7px', color: '#374151' }}>{d.volumeMl} ml · {d.concGL} g/L · {mlH} ml/h fluid</td>
                        <td style={{ padding: '4px 7px', color: '#6b7280' }}>{d.ratio ?? '—'}</td>
                        <td style={{ padding: '4px 7px', color: '#6b7280' }}>every {d.freqMin} min</td>
                        <td style={{ padding: '4px 7px', textAlign: 'right', color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{servingG} g ({servingG * 4} kcal)</td>
                        <td style={{ padding: '4px 7px', textAlign: 'right', fontWeight: 700, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                          {Math.round((servingG / d.freqMin) * 60)} ({Math.round((servingG / d.freqMin) * 60 * 4)} kcal/h)
                        </td>
                      </tr>
                    );
                  })}
                  {strategy.solids.map((sol, i) => (
                    <tr key={sol.id} style={{ backgroundColor: (strategy.gels.length + strategy.drinks.length + i) % 2 === 0 ? '#f9fafb' : '#ffffff', borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '4px 7px', fontWeight: 700, color: '#b45309' }}>Solid</td>
                      <td style={{ padding: '4px 7px', color: '#374151' }}>{sol.name} · {sol.carbsPer} g carbs</td>
                      <td style={{ padding: '4px 7px', color: '#6b7280' }}>{sol.ratio ?? '—'}</td>
                      <td style={{ padding: '4px 7px', color: '#6b7280' }}>every {sol.freqMin} min</td>
                      <td style={{ padding: '4px 7px', textAlign: 'right', color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{sol.carbsPer} g ({sol.carbsPer * 4} kcal)</td>
                      <td style={{ padding: '4px 7px', textAlign: 'right', fontWeight: 700, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                        {Math.round((sol.carbsPer / sol.freqMin) * 60)} ({Math.round((sol.carbsPer / sol.freqMin) * 60 * 4)} kcal/h)
                      </td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                    <td colSpan={5} style={{ padding: '4px 7px', fontWeight: 700, color: '#374151' }}>
                      Total planned
                      <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 9.5 }}>
                        {[
                          gelGph   > 0 ? `Gels ${gelGph} g/h (${Math.round(gelGph * 4)} kcal/h)`     : null,
                          drinkGph > 0 ? `Drinks ${drinkGph} g/h (${Math.round(drinkGph * 4)} kcal/h)` : null,
                          solidGph > 0 ? `Solids ${solidGph} g/h (${Math.round(solidGph * 4)} kcal/h)` : null,
                        ].filter(Boolean).join('  ·  ')}
                      </span>
                    </td>
                    <td style={{ padding: '4px 7px', textAlign: 'right', fontWeight: 900, color: '#111827', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                      {Math.round(plannedGph)} ({Math.round(plannedGph * 4)} kcal/h)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Glucose / Fructose breakdown — prominent */}
          {plannedGph > 0 && (
            <div style={{ marginBottom: 11 }}>
              <div style={SL}>Glucose / Fructose Breakdown</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1, padding: '11px 14px', borderLeft: '4px solid #f59e0b', backgroundColor: '#fffbeb', borderRadius: '0 7px 7px 0' }}>
                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#92400e' }}>
                    Glucose (incl. maltodextrin)
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#92400e', lineHeight: 1.1, marginTop: 3 }}>
                    {glucoseGph} <span style={{ fontSize: 12, fontWeight: 600 }}>g/h</span>
                  </div>
                </div>
                <div style={{ flex: 1, padding: '11px 14px', borderLeft: '4px solid #3b82f6', backgroundColor: '#eff6ff', borderRadius: '0 7px 7px 0' }}>
                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#1d4ed8' }}>
                    Fructose
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#1d4ed8', lineHeight: 1.1, marginTop: 3 }}>
                    {fructoseGph} <span style={{ fontSize: 12, fontWeight: 600 }}>g/h</span>
                  </div>
                </div>
                <div style={{ flex: 1, padding: '11px 14px', borderLeft: '4px solid #374151', backgroundColor: '#f9fafb', borderRadius: '0 7px 7px 0' }}>
                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#374151' }}>
                    Ratio
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#111827', lineHeight: 1.1, marginTop: 3 }}>
                    {glucoseGph > 0 && fructoseGph > 0
                      ? `${(glucoseGph / fructoseGph).toFixed(1)} : 1`
                      : fructoseGph === 0 ? 'Glucose only' : '—'}
                  </div>
                  {hasUnknown && <div style={{ fontSize: 8.5, color: '#9ca3af', marginTop: 2 }}>estimated (1:1 for unknown)</div>}
                </div>
              </div>
            </div>
          )}

          {/* Warnings */}
          {(glucoseGph > 60 || gapAdv.cautionFlag || (fluidMlH < FLUID_LOW_ML_H && fluidMlH > 0)) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
              {glucoseGph > 60 && (
                <div style={{ padding: '5px 11px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 5, fontSize: 10.5, color: '#92400e', fontWeight: 600 }}>
                  ⚠ Glucose exceeds 60 g/h — mixed carbohydrate sources (2:1 or higher) improve absorption and reduce GI risk.
                </div>
              )}
              {gapAdv.cautionFlag && (
                <div style={{ padding: '5px 11px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 5, fontSize: 10.5, color: '#92400e', fontWeight: 600 }}>
                  ⚠ {gapAdv.cautionText}
                </div>
              )}
              {fluidMlH < FLUID_LOW_ML_H && fluidMlH > 0 && (
                <div style={{ padding: '5px 11px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 5, fontSize: 10.5, color: '#1d4ed8', fontWeight: 600 }}>
                  ⓘ Fluid intake {fluidMlH} ml/h is below 600 ml/h minimum — consider increasing drink volume or frequency.
                </div>
              )}
            </div>
          )}

          {/* Intake timeline — PDF-only: first 2 hours */}
          {timeline.length > 0 && (
            <div style={{ marginBottom: 11 }}>
              <div style={{ ...SL, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                <span>Intake Timeline</span>
                <span style={{ fontSize: 9, fontWeight: 400, color: '#9ca3af', letterSpacing: 0, textTransform: 'none' }}>
                  {timelineTruncated
                    ? `— first 2h · ${totalCarbsG} g CHO (full event: ${allTotalCarbsG} g)`
                    : `— ${fmtMin(durationMin)} · ${totalCarbsG} g CHO`}
                </span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    {['Time', 'Type', 'Item', 'Carbs (g)'].map((h, i) => (
                      <th key={h} style={{
                        textAlign: i === 3 ? 'right' : 'left',
                        padding: '3px 7px', color: '#9ca3af', fontWeight: 600, fontSize: 8.5,
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeline.map((pt, i) => (
                    <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#f9fafb' : '#ffffff', borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '2px 7px', fontWeight: 600, color: '#374151', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {fmtMin(pt.minute)}
                      </td>
                      <td style={{ padding: '2px 7px', fontWeight: 600, color: pt.type === 'gel' ? '#7c3aed' : pt.type === 'drink' ? '#2563eb' : '#b45309' }}>
                        {pt.type.charAt(0).toUpperCase() + pt.type.slice(1)}
                      </td>
                      <td style={{ padding: '2px 7px', color: '#374151' }}>{pt.name}</td>
                      <td style={{ padding: '2px 7px', textAlign: 'right', color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{pt.carbsG}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 4, fontSize: 8.5, color: '#9ca3af', display: 'flex', justifyContent: 'space-between' }}>
                {strategy.gels.length > 0 && strategy.solids.length > 0 && (
                  <span>Solid food replaces gels at overlapping time points.</span>
                )}
                {timelineTruncated && (
                  <span style={{ marginLeft: 'auto' }}>PDF shows first 2 hours only — full timeline available in app.</span>
                )}
              </div>
            </div>
          )}

          {/* Coaching insights */}
          <div style={{ marginBottom: 11 }}>
            <div style={SL}>Coaching Insights</div>
            <div style={{ display: 'flex', gap: 9 }}>
              {[
                { title: 'Nutrition', text: stratAdv.nutritionAnalysis },
                { title: 'Pacing',   text: stratAdv.pacingAnalysis    },
                { title: 'Risk',     text: carbAdv.riskText           },
              ].map(({ title, text }) => (
                <div key={title} style={{ flex: 1, padding: '7px 11px', backgroundColor: '#f9fafb', borderRadius: 5, border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: '#111827', marginBottom: 3 }}>{title}</div>
                  <div style={{ fontSize: 9.5, color: '#374151', lineHeight: 1.5 }}>{text}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Metabolic summary */}
          <div style={{ marginBottom: 8 }}>
            <div style={SL}>Metabolic Summary at Target ({targetW} W)</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { label: 'Energy expenditure', value: `${target.kcalPerHour} kcal/h` },
                { label: 'Fat oxidation',      value: `${target.fatGHour.toFixed(1)} g/h` },
                { label: 'CHO oxidation',      value: `${target.choGHour.toFixed(1)} g/h` },
                { label: 'Gross efficiency',   value: `${(ge * 100).toFixed(1)}%` },
              ].map(m => (
                <div key={m.label} style={{ flex: 1, padding: '9px 11px', border: '1px solid #e5e7eb', borderRadius: 5, backgroundColor: '#f9fafb' }}>
                  <div style={{ fontSize: 8.5, color: '#9ca3af', marginBottom: 3 }}>{m.label}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#111827' }}>{m.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Page 2 footer */}
          <div style={{ paddingTop: 8, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 9, color: '#d1d5db' }}>Fueling Sense · Execution &amp; Coaching</span>
            <span style={{ fontSize: 9, color: '#d1d5db' }}>Page 2 of 3</span>
          </div>

        </div>{/* end p2ContentRef */}
      </div>{/* end page 2 container */}

      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE 3 — Appendix: Zone Substrate Summary
          ═════════════════════════════════════════════════════════════════════ */}

      <div style={PAGE_CONTAINER}>
        <div ref={p3ContentRef} style={scaledContentStyle(scale3)}>

          <PageHeader
            title="Appendix — Zone Substrate Summary"
            subtitle={athleteLine || 'Fueling Calculator'}
            today={today}
          />

          {displayZones.length > 0 ? (
            <div style={{ marginBottom: 14 }}>
              <div style={SL}>Zone Substrate Summary</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                    {['Zone', 'W range', 'W mid', 'Fat g/h', 'CHO g/h', 'kcal/h'].map((h, i) => (
                      <th key={h} style={{
                        textAlign: i >= 2 ? 'right' : 'left',
                        padding: '4px 8px', color: '#9ca3af', fontWeight: 600, fontSize: 9,
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayZones.map((zone, i) => {
                    const mid = Math.round((zone.low + zone.high) / 2);
                    const sub = lookupSubstrate(result.denseSubstrateSeries, mid);
                    const isActive = i === activeZoneIdx;
                    return (
                      <tr key={zone.name} style={{
                        backgroundColor: isActive ? '#ede9fe' : i % 2 === 0 ? '#f9fafb' : '#ffffff',
                        borderBottom: '1px solid #f3f4f6',
                      }}>
                        <td style={{ padding: '5px 8px' }}>
                          <span style={{ fontWeight: 700, color: isActive ? '#5b21b6' : '#374151' }}>{zone.name}</span>
                          <span style={{ marginLeft: 6, color: '#6b7280' }}>{zone.label}</span>
                        </td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{zone.low}–{zone.high}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>{mid}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', color: '#b45309', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{sub ? Math.round(sub.fatG) : '—'}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', color: '#1d4ed8', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{sub ? Math.round(sub.choG) : '—'}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', color: '#374151', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{sub ? sub.kcalPerHour : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ marginTop: 5, fontSize: 8.5, color: '#9ca3af' }}>
                Active zone highlighted. Anchored to LT1 ({Math.round(inputs.lt1Watts)} W) and LT2 ({Math.round(inputs.mlssWatts)} W).
              </div>
            </div>
          ) : (
            <div style={{ padding: '14px 0', fontSize: 11, color: '#9ca3af' }}>
              Metabolic profile required to generate zone summary.
            </div>
          )}

          {/* Page 3 footer */}
          <div style={{ paddingTop: 10, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 9, color: '#d1d5db' }}>Fueling Sense · Appendix</span>
            <span style={{ fontSize: 9, color: '#d1d5db' }}>Page 3 of 3</span>
          </div>

        </div>{/* end p3ContentRef */}
      </div>{/* end page 3 container */}

    </div>
  );
}
