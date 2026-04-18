'use client';

/**
 * ProfilerPrintView — static A4-width layout captured by html2canvas for PDF export.
 *
 * Rules:
 * - No interactive elements (no buttons, tooltips, collapsibles).
 * - Inline styles only — Tailwind classes are not applied reliably by html2canvas.
 * - Fixed width 794 px (A4 at 96 dpi). Parent positions this off-screen.
 */

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { classifyVO2max, classifyVlamax, classifyLT2Wkg } from '@/lib/benchmarks/athleteBenchmarks';
import type { MetabolicV06Result } from '@/lib/engine/metabolicModelV06';
import type { TrainingZone } from '@/lib/types';

interface Props {
  profile:        MetabolicV06Result;
  name?:          string;
  sex?:           'Male' | 'Female';
  age?:           number;
  dietType?:      string;
  isPro:          boolean;
  laData:         { w: number; la: number }[];
  zones:          TrainingZone[];
  phenotypeLabel: 'Aerobic' | 'Mixed' | 'Glycolytic';
}

const S = {
  page: {
    width: 794, padding: '32px 40px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    backgroundColor: '#ffffff', color: '#111827',
    boxSizing: 'border-box' as const,
  },
  sectionLabel: {
    fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase' as const, color: '#9ca3af', marginBottom: 10,
  },
};

export default function ProfilerPrintView({
  profile, name, sex, age, dietType, isPro, laData, zones, phenotypeLabel,
}: Props) {
  const { vlamax, vo2max, mlssWatts, lt1Watts, cpWatts } = profile.outputs;
  const { weightKg, bodyFatPct } = profile.inputs;
  const lt2Wkg = mlssWatts / weightKg;

  const vo2Cls = classifyVO2max(vo2max, sex);
  const vlaCls = classifyVlamax(vlamax, sex);
  const lt2Cls = classifyLT2Wkg(lt2Wkg);

  const today = new Date().toLocaleDateString(undefined, {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const phenoColors: Record<string, { bg: string; color: string }> = {
    Aerobic:    { bg: '#f0fdf4', color: '#15803d' },
    Mixed:      { bg: '#fffbeb', color: '#b45309' },
    Glycolytic: { bg: '#fef2f2', color: '#b91c1c' },
  };
  const pheno = phenoColors[phenotypeLabel] ?? phenoColors.Mixed;

  const metrics = [
    { label: 'VLamax',  value: vlamax.toFixed(3),             unit: 'mmol/L/s',  border: '#ef4444' },
    { label: 'VO\u2082max', value: vo2max.toFixed(1),        unit: 'ml/kg/min', border: '#3b82f6' },
    { label: 'LT1',     value: isPro ? String(Math.round(lt1Watts))   : '—', unit: isPro ? 'W' : 'Pro only', border: '#22c55e' },
    { label: 'LT2',     value: isPro ? String(Math.round(mlssWatts))  : '—', unit: isPro ? 'W' : 'Pro only', border: '#f97316' },
    { label: 'CP',      value: String(Math.round(cpWatts)),   unit: 'W',         border: '#8b5cf6' },
  ];

  const benchmarks = [
    { label: 'VLamax', value: vlamax.toFixed(3), unit: 'mmol/L/s',  cls: vlaCls },
    { label: 'VO\u2082max', value: vo2max.toFixed(1), unit: 'ml/kg/min', cls: vo2Cls },
    { label: 'LT2',    value: lt2Wkg.toFixed(2), unit: 'W/kg',      cls: lt2Cls },
  ];

  return (
    <div style={S.page}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 24, paddingBottom: 16, borderBottom: '2px solid #7c3aed',
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#7c3aed', letterSpacing: '-0.5px' }}>Fueling Sense</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Metabolic Profiler</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Metabolic Profile Report</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{today}</div>
        </div>
      </div>

      {/* ── Athlete row ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20,
        padding: '10px 14px', backgroundColor: '#f9fafb', borderRadius: 8,
      }}>
        {name && name !== 'Athlete' && (
          <span style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>{name}</span>
        )}
        {sex  && <span style={{ fontSize: 12, color: '#374151' }}>{sex}</span>}
        {age  && <span style={{ fontSize: 12, color: '#374151' }}>{age} yrs</span>}
        <span style={{ fontSize: 12, color: '#374151' }}>{weightKg} kg · {bodyFatPct}% body fat</span>
        {dietType && (
          <span style={{ fontSize: 12, color: '#374151' }}>
            {dietType === 'Keto' ? 'Fat adapted' : 'Standard diet'}
          </span>
        )}
        <span style={{
          marginLeft: 'auto', fontSize: 11, fontWeight: 700,
          padding: '3px 10px', borderRadius: 20,
          backgroundColor: pheno.bg, color: pheno.color,
        }}>
          {phenotypeLabel}
        </span>
      </div>

      {/* ── Key metrics ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={S.sectionLabel}>Key Metrics</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {metrics.map(m => (
            <div key={m.label} style={{
              flex: 1, borderLeft: `4px solid ${m.border}`,
              padding: '10px 10px', backgroundColor: '#f9fafb',
              borderRadius: '0 6px 6px 0',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6b7280' }}>{m.label}</div>
              <div style={{ fontSize: 19, fontWeight: 900, color: '#111827', lineHeight: 1.1, marginTop: 3 }}>{m.value}</div>
              <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>{m.unit}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Lactate accumulation curve ── */}
      {laData.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={S.sectionLabel}>Lactate Accumulation Curve</div>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 8px' }}>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={laData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="w" type="number" domain={['dataMin', 'dataMax']}
                    tick={{ fontSize: 9 }}
                    label={{ value: 'W', position: 'insideBottomRight', offset: -5, fontSize: 8 }}
                  />
                  <YAxis
                    tick={{ fontSize: 9 }} domain={[0.5, 'auto']}
                    label={{ value: 'mmol/L', angle: -90, position: 'insideLeft', fontSize: 8 }}
                  />
                  {isPro && (
                    <ReferenceLine
                      x={Math.round(lt1Watts)} stroke="#27ae60" strokeDasharray="4 4"
                      label={{ value: 'LT1', position: 'insideTopRight', fontSize: 8, fill: '#27ae60' }}
                    />
                  )}
                  {isPro && (
                    <ReferenceLine
                      x={Math.round(mlssWatts)} stroke="#f57c00" strokeDasharray="4 4"
                      label={{ value: 'LT2', position: 'insideTopRight', fontSize: 8, fill: '#f57c00' }}
                    />
                  )}
                  <Line dataKey="la" stroke="#e53935" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {!isPro && (
              <p style={{ fontSize: 9, textAlign: 'center', color: '#9ca3af', marginTop: 4 }}>
                LT1 and LT2 markers available on Pro
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Training zones ── */}
      {isPro && zones.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={S.sectionLabel}>Training Zones</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                {['Zone', 'Description', 'Range (W)'].map((h, i) => (
                  <th key={h} style={{
                    textAlign: i === 2 ? 'right' : 'left',
                    padding: '4px 8px', color: '#9ca3af', fontWeight: 600, fontSize: 9,
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zones.map((z, i) => (
                <tr key={z.name} style={{
                  backgroundColor: i % 2 === 0 ? '#f9fafb' : '#ffffff',
                  borderBottom: '1px solid #f3f4f6',
                }}>
                  <td style={{ padding: '5px 8px', fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>{z.name}</td>
                  <td style={{ padding: '5px 8px', color: '#6b7280' }}>{z.label}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(z.low)}–{Math.round(z.high)} W
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Benchmark comparison (3-metric) ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={S.sectionLabel}>Comparison vs Trained Cyclists</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {benchmarks.map(m => (
            <div key={m.label} style={{
              flex: 1, padding: '12px 14px', border: '1px solid #e5e7eb',
              borderRadius: 8, backgroundColor: '#f9fafb',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6b7280' }}>
                {m.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#111827', marginTop: 4 }}>
                {m.value}
                <span style={{ fontSize: 10, fontWeight: 600, marginLeft: 4, color: '#374151' }}>{m.unit}</span>
              </div>
              <div style={{
                marginTop: 5, fontSize: 10, fontWeight: 700, padding: '2px 8px',
                borderRadius: 4, display: 'inline-block', border: '1px solid #d1d5db',
                backgroundColor: '#ffffff', color: '#374151',
              }}>
                {m.cls.category}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ paddingTop: 12, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 9, color: '#d1d5db' }}>Generated by Fueling Sense</span>
        <span style={{ fontSize: 9, color: '#d1d5db' }}>Metabolic Profiler v0.6 · {today}</span>
      </div>

    </div>
  );
}
