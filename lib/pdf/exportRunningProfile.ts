/**
 * lib/pdf/exportRunningProfile.ts
 * Programmatic A4 PDF export for the Running Metabolic Profile.
 * Uses jsPDF directly — no DOM capture — so no UI chrome leaks into the output.
 */

import jsPDF from 'jspdf';
import type { RunningMetabolicProfile, RunningProfilerZone } from '@/lib/engine/runningTypes';

// A4 portrait
const PW = 210;
const PH = 297;
const M  = 14;       // page margin (mm)
const CW = PW - M * 2; // content width = 182 mm

// ── Colour helpers ─────────────────────────────────────────────────────────────

function fill(doc: jsPDF, hex: string)   { doc.setFillColor(hex); }
function stroke(doc: jsPDF, hex: string) { doc.setDrawColor(hex); }
function tc(doc: jsPDF, hex: string)     { doc.setTextColor(hex); }

function sectionLabel(doc: jsPDF, text: string, y: number) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  tc(doc, '#7c3aed');
  doc.text(text, M, y);
}

// ── Pace formatter (mirrors runningMetabolicEngine.formatPace) ─────────────────

function fmtPace(speedMs: number): string {
  if (speedMs <= 0) return '—';
  const secPerKm = 1000 / speedMs;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, '0')}/km`;
}

// ── Lactate simulation (identical to RunningProfilerResults.tsx) ───────────────

const VLA_REF      = 0.45;
const CURVE_BASE_K = 2.0;

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

function simulatedLactate(speed: number, lowerSpeed: number, lt2: number, vla: number): number {
  const vlaRatio    = clamp(vla / VLA_REF, 0.5, 1.5);
  const laBaseline  = 1.0 * (0.8 + 0.4 * vlaRatio);
  const laLt2Level  = 3.5 * (0.95 + 0.15 * vlaRatio);
  const laSteepness = CURVE_BASE_K * (0.8 + 0.6 * vlaRatio);
  const x           = (speed - lowerSpeed) / (lt2 - lowerSpeed);
  const denom       = Math.exp(laSteepness) - 1;
  const la          = laBaseline + (laLt2Level - laBaseline) * (Math.exp(laSteepness * x) - 1) / denom;
  return Math.max(laBaseline, la);
}

// ── Zone accent fills (print-friendly) ────────────────────────────────────────

const ZONE_FILL: Record<string, string> = {
  'Zone 1':  '#dbeafe',
  'Zone 2':  '#bfdbfe',
  'Zone 3A': '#dcfce7',
  'Zone 3B': '#bbf7d0',
  'Zone 4':  '#fef9c3',
  'Zone 5A': '#ffedd5',
  'Zone 5B': '#fee2e2',
  'Zone 6':  '#fecaca',
  'Zone 7':  '#ede9fe',
};

const ZONE_PURPOSE: Record<string, string> = {
  'Zone 1':  'Active aerobic recovery',
  'Zone 2':  'Low-intensity aerobic development',
  'Zone 3A': 'LT1 / upper aerobic work',
  'Zone 3B': 'Durable steady-state tempo work',
  'Zone 4':  'LT2 / maximal lactate steady state',
  'Zone 5A': 'Upper aerobic / approach VO2max',
  'Zone 5B': 'High aerobic power at VO2max',
  'Zone 6':  'Anaerobic / high glycolytic demand',
  'Zone 7':  'Sprint / neuromuscular power',
};

// ── Main export ────────────────────────────────────────────────────────────────

export function exportRunningProfilePDF(
  profile:       RunningMetabolicProfile,
  name:          string,
  isPro:         boolean,
  profilerZones: RunningProfilerZone[],
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { primary, derived, classification } = profile;

  const athleteName = name?.trim() || 'Athlete';
  const dateStr = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  // ── 1. Header band ───────────────────────────────────────────────────────────
  fill(doc, '#4f46e5');
  doc.rect(0, 0, PW, 30, 'F');

  // Wordmark
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  tc(doc, '#c7d2fe');
  doc.text('FUELINGSENSE', M, 8.5);

  // Report type
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  tc(doc, '#a5b4fc');
  doc.text('Running Performance Profile', M, 14);

  // Athlete name — dominant
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  tc(doc, '#ffffff');
  doc.text(athleteName, M, 25);

  // Date top-right
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  tc(doc, '#a5b4fc');
  doc.text(dateStr, PW - M, 8.5, { align: 'right' });

  // ── 2. Summary subtitle ──────────────────────────────────────────────────────
  let y = 36;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  tc(doc, '#6b7280');
  doc.text(
    `${classification.type}  ·  VO₂max ${primary.vo2maxMlKgMin.toFixed(1)} mL/kg/min  ·  VLamax ${primary.vlamaxMmolLS.toFixed(3)} mmol/L/s`,
    M, y,
  );

  // ── 3. Key metric cards ──────────────────────────────────────────────────────
  y += 7;
  sectionLabel(doc, 'KEY METRICS', y);
  y += 4;

  const metrics = [
    { label: 'VLamax',       value: primary.vlamaxMmolLS.toFixed(3),              unit: 'mmol/L/s',  accent: '#ef4444' },
    { label: 'VO₂max',  value: primary.vo2maxMlKgMin.toFixed(1),             unit: 'mL/kg/min', accent: '#3b82f6' },
    { label: 'LT2 Pace',     value: isPro ? primary.mlssPace : '––',    unit: 'min/km',    accent: '#f97316' },
    { label: 'LT1 Pace',     value: isPro ? primary.lt1Pace  : '––',    unit: 'min/km',    accent: '#10b981' },
    { label: 'Athlete Type', value: classification.type,                           unit: 'phenotype', accent: '#7c3aed' },
  ];

  const N_CARDS = metrics.length;
  const CARD_GAP = 2.5;
  const cardW = (CW - CARD_GAP * (N_CARDS - 1)) / N_CARDS;
  const cardH = 19;

  metrics.forEach((m, i) => {
    const cx = M + i * (cardW + CARD_GAP);

    fill(doc, '#f9fafb');
    stroke(doc, '#e5e7eb');
    doc.setLineWidth(0.2);
    doc.rect(cx, y, cardW, cardH, 'FD');

    // Left accent strip
    fill(doc, m.accent);
    doc.rect(cx, y, 1.5, cardH, 'F');

    const midX = cx + (cardW + 1.5) / 2;

    // Label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    tc(doc, '#9ca3af');
    doc.text(m.label, midX, y + 5.5, { align: 'center' });

    // Value — shrink font for Athlete Type string
    const isType = m.label === 'Athlete Type';
    const valSize = isType
      ? (m.value.length > 14 ? 7 : m.value.length > 10 ? 8 : 9.5)
      : 11;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(valSize);
    tc(doc, '#111827');
    const valY = isType ? y + 12.5 : y + 13;
    doc.text(m.value, midX, valY, { align: 'center' });

    // Unit
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    tc(doc, '#9ca3af');
    doc.text(m.unit, midX, y + 17.5, { align: 'center' });
  });

  y += cardH + 9;

  // ── 4. Lactate accumulation chart ────────────────────────────────────────────
  sectionLabel(doc, 'ESTIMATED LACTATE ACCUMULATION CURVE', y);
  y += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  tc(doc, '#9ca3af');
  doc.text('Modelled from profile outputs. Not a measured lactate test.', M, y);
  y += 5;

  const chartW = CW;
  const chartH = 56;
  const PAD_L  = 11;
  const PAD_R  = 4;
  const PAD_T  = 5;
  const PAD_B  = 11;

  // White plot background with very light outer border
  fill(doc, '#ffffff');
  stroke(doc, '#e8e8e8');
  doc.setLineWidth(0.12);
  doc.rect(M, y, chartW, chartH, 'FD');

  const iLeft  = M + PAD_L;
  const iRight = M + chartW - PAD_R;
  const iTop   = y + PAD_T;
  const iBot   = y + chartH - PAD_B;
  const iW     = iRight - iLeft;
  const iH     = iBot - iTop;

  // Data parameters
  const lt1  = primary.lt1SpeedMs;
  const lt2  = primary.mlssSpeedMs;
  const vla  = primary.vlamaxMmolLS;
  const vVO2 = derived.vVO2maxSpeedMs;

  const lowerSpeed = Math.max(2.0, lt1 * 0.70, lt2 * 0.50);
  const upperSpeed = Math.max(lt2 * 1.15, vVO2 > 0 ? vVO2 * 1.02 : lt2 * 1.15);

  const LA_MAX = 8;
  const LA_MIN = 0;

  function xPx(spd: number): number {
    return iLeft + ((spd - lowerSpeed) / (upperSpeed - lowerSpeed)) * iW;
  }
  function yPx(la: number): number {
    return iBot - ((la - LA_MIN) / (LA_MAX - LA_MIN)) * iH;
  }

  // Horizontal gridlines — very light, hairline weight
  doc.setLineWidth(0.1);
  stroke(doc, '#efefef');
  for (const la of [2, 4, 6, 8]) {
    doc.line(iLeft, yPx(la), iRight, yPx(la));
  }

  // Axis lines — thin L-shape at left and bottom of plot area
  doc.setLineWidth(0.25);
  stroke(doc, '#d1d5db');
  doc.line(iLeft, iTop, iLeft, iBot);   // left axis
  doc.line(iLeft, iBot, iRight, iBot);  // bottom axis

  // Y-axis tick marks (small, outward from plot)
  doc.setLineWidth(0.15);
  stroke(doc, '#d1d5db');
  for (const la of [0, 2, 4, 6, 8]) {
    doc.line(iLeft - 1.2, yPx(la), iLeft, yPx(la));
  }

  // X-axis tick marks
  const speedSpan = upperSpeed - lowerSpeed;
  const xMarks: number[] = [];
  for (let k = 0; k <= 4; k++) {
    xMarks.push(lowerSpeed + (speedSpan / 4) * k);
  }
  for (const s of xMarks) {
    doc.line(xPx(s), iBot, xPx(s), iBot + 1.2);
  }

  // Y-axis labels
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  tc(doc, '#9ca3af');
  for (const la of [0, 2, 4, 6, 8]) {
    doc.text(String(la), iLeft - 2, yPx(la) + 1.5, { align: 'right' });
  }

  // Y-axis title (rotated)
  doc.setFontSize(5.5);
  tc(doc, '#9ca3af');
  doc.text('mmol/L', M + 3.5, y + chartH / 2 - 1, { angle: 90, align: 'center' });

  // X-axis tick labels
  doc.setFontSize(5.5);
  tc(doc, '#9ca3af');
  xMarks.forEach(s => {
    doc.text(fmtPace(s), xPx(s), iBot + 6, { align: 'center' });
  });

  // X-axis title
  doc.setFontSize(6);
  tc(doc, '#9ca3af');
  doc.text('Pace (min/km)', M + chartW / 2, y + chartH - 1, { align: 'center' });

  // Reference lines — thin dashed verticals; labels staggered vertically to avoid overlap
  const refs = [
    { spd: lt1,  col: '#10b981', lbl: `LT1 ${fmtPace(lt1)}`,   labelOffsetY: 4.5  },
    { spd: lt2,  col: '#f97316', lbl: `LT2 ${fmtPace(lt2)}`,   labelOffsetY: 10.0 },
    ...(vVO2 > 0 && vVO2 >= lowerSpeed && vVO2 <= upperSpeed
      ? [{ spd: vVO2, col: '#8b5cf6', lbl: `vVO₂ ${fmtPace(vVO2)}`, labelOffsetY: 15.5 }]
      : []),
  ];

  type DocWithDash = jsPDF & { setLineDashPattern: (d: number[], p: number) => void };
  const setDash = (pattern: number[]) =>
    (doc as DocWithDash).setLineDashPattern(pattern, 0);

  refs.forEach(ref => {
    const xr = xPx(ref.spd);
    if (xr < iLeft - 0.5 || xr > iRight + 0.5) return;

    stroke(doc, ref.col);
    doc.setLineWidth(0.28);
    setDash([2, 2]);
    doc.line(xr, iTop, xr, iBot);
    setDash([]);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    tc(doc, ref.col);
    doc.text(ref.lbl, xr + 1, iTop + ref.labelOffsetY);
  });

  // Lactate curve — thin, clean, scientific weight
  const laData: { spd: number; la: number }[] = [];
  for (let v = lowerSpeed; v <= upperSpeed + 1e-6; v += 0.04) {
    laData.push({ spd: v, la: simulatedLactate(v, lowerSpeed, lt2, vla) });
  }

  stroke(doc, '#dc2626');
  doc.setLineWidth(0.5);
  for (let i = 0; i < laData.length - 1; i++) {
    const x1 = xPx(laData[i].spd);
    const x2 = xPx(laData[i + 1].spd);
    const y1 = Math.max(iTop, Math.min(iBot, yPx(laData[i].la)));
    const y2 = Math.max(iTop, Math.min(iBot, yPx(laData[i + 1].la)));
    if (x1 >= iLeft - 0.1 && x2 <= iRight + 0.1) {
      doc.line(x1, y1, x2, y2);
    }
  }

  y += chartH + 9;

  // ── 5. Training zones ────────────────────────────────────────────────────────
  if (isPro && profilerZones.length > 0) {
    sectionLabel(doc, 'TRAINING ZONES', y);
    y += 4;

    // Column positions
    const COL_ZONE    = M;
    const COL_NAME    = M + 18;
    const COL_PURPOSE = M + 50;
    const COL_PACE    = M + CW; // right-aligned

    // Header row
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    tc(doc, '#9ca3af');
    doc.text('Zone',      COL_ZONE    + 1, y);
    doc.text('Name',      COL_NAME,        y);
    doc.text('Purpose',   COL_PURPOSE,     y);
    doc.text('Pace Range', COL_PACE,       y, { align: 'right' });

    y += 2;
    stroke(doc, '#e5e7eb');
    doc.setLineWidth(0.2);
    doc.line(M, y, M + CW, y);
    y += 1.5;

    const ROW_H = 7.5;

    profilerZones.forEach(z => {
      // Row background
      fill(doc, ZONE_FILL[z.name] ?? '#f9fafb');
      doc.rect(M, y, CW, ROW_H, 'F');

      // Zone name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      tc(doc, '#111827');
      doc.text(z.name, COL_ZONE + 1, y + ROW_H / 2 + 2);

      // Label
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      tc(doc, '#374151');
      doc.text(z.label, COL_NAME, y + ROW_H / 2 + 2);

      // Purpose
      doc.setFontSize(6);
      tc(doc, '#6b7280');
      const purpose = ZONE_PURPOSE[z.name] ?? '';
      doc.text(purpose, COL_PURPOSE, y + ROW_H / 2 + 2);

      // Pace range
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      tc(doc, '#111827');
      doc.text(z.paceRange, COL_PACE, y + ROW_H / 2 + 2, { align: 'right' });

      y += ROW_H;
    });
  }

  // ── 6. Footer ────────────────────────────────────────────────────────────────
  stroke(doc, '#e5e7eb');
  doc.setLineWidth(0.2);
  doc.line(M, PH - 14, PW - M, PH - 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  tc(doc, '#9ca3af');
  doc.text('Generated by FuelingSense  ·  fuelingsense.com', M, PH - 9);
  doc.text(
    'This profile is modelled from athlete inputs and should be interpreted alongside coaching judgement.',
    M, PH - 5,
  );
  doc.text(dateStr, PW - M, PH - 9, { align: 'right' });

  // ── Save ─────────────────────────────────────────────────────────────────────
  const slug = athleteName.toLowerCase().replace(/\s+/g, '-');
  doc.save(`running-profile-${slug}.pdf`);
}
