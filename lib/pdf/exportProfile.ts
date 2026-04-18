import jsPDF from 'jspdf';
import type { InscydResult, SubscriptionTier } from '@/lib/types';

// A4 dimensions (mm)
const PW = 210;
const PH = 297;
const MARGIN = 16;
const CW = PW - MARGIN * 2; // content width

// ── Colour helpers ────────────────────────────────────────────────────────────

function fill(doc: jsPDF, hex: string) { doc.setFillColor(hex); }
function stroke(doc: jsPDF, hex: string) { doc.setDrawColor(hex); }
function textColor(doc: jsPDF, hex: string) { doc.setTextColor(hex); }

// ── Section label ─────────────────────────────────────────────────────────────

function sectionLabel(doc: jsPDF, text: string, y: number) {
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  textColor(doc, '#7c3aed');
  doc.text(text, MARGIN, y);
}

// ── Main export ───────────────────────────────────────────────────────────────

export function exportProfilePDF(result: InscydResult, tier: SubscriptionTier): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const isPro = tier === 'pro';

  const { vo2max, vlamax, cp, wPrime, mlss, lt1, phenotype, zones } = result;
  const name = result.inputs.name?.trim() || 'Athlete';
  const dateStr = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  // ── Header band ────────────────────────────────────────────────────────────
  fill(doc, '#7c3aed');
  doc.rect(0, 0, PW, 22, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  textColor(doc, '#ffffff');
  doc.text('Fueling Sense', MARGIN, 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Metabolic Profile Report', MARGIN, 16);
  doc.text(dateStr, PW - MARGIN, 16, { align: 'right' });

  // ── Athlete name ───────────────────────────────────────────────────────────
  let y = 30;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  textColor(doc, '#111827');
  doc.text(name, MARGIN, y);

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  textColor(doc, '#6b7280');
  doc.text(`Phenotype: ${phenotype}`, MARGIN, y);

  // ── Key Metrics ────────────────────────────────────────────────────────────
  y += 10;
  sectionLabel(doc, 'KEY METRICS', y);
  y += 4;

  const metrics: { label: string; value: string; unit: string; locked: boolean }[] = [
    { label: 'VLamax', value: vlamax.toFixed(3),            unit: 'mmol/L/s',  locked: false },
    { label: 'VO2max', value: vo2max.toFixed(1),            unit: 'ml/kg/min', locked: false },
    { label: 'CP',     value: String(Math.round(cp)),       unit: 'W',         locked: false },
    { label: "W'",     value: (wPrime / 1000).toFixed(1),  unit: 'kJ',        locked: false },
    { label: 'LT2',    value: isPro ? String(Math.round(mlss)) : '—', unit: 'W', locked: !isPro },
    { label: 'LT1',    value: isPro ? String(Math.round(lt1))  : '—', unit: 'W', locked: !isPro },
  ];

  const gap = 3;
  const cardW = (CW - gap * (metrics.length - 1)) / metrics.length;
  const cardH = 18;

  metrics.forEach((m, i) => {
    const x = MARGIN + i * (cardW + gap);
    fill(doc, m.locked ? '#f3f4f6' : '#f9fafb');
    stroke(doc, m.locked ? '#e5e7eb' : '#e5e7eb');
    doc.setLineWidth(0.2);
    doc.rect(x, y, cardW, cardH, 'FD');

    const cx = x + cardW / 2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    textColor(doc, m.locked ? '#d1d5db' : '#9ca3af');
    doc.text(m.label, cx, y + 5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    textColor(doc, m.locked ? '#d1d5db' : '#111827');
    doc.text(m.value, cx, y + 11, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    textColor(doc, m.locked ? '#d1d5db' : '#9ca3af');
    doc.text(m.unit, cx, y + 16, { align: 'center' });
  });

  y += cardH + 10;

  // ── Power-Duration Curve ───────────────────────────────────────────────────
  sectionLabel(doc, 'POWER–DURATION CURVE', y);
  y += 4;

  const chartW = CW * 0.58;
  const chartH = 48;
  const PAD = 10; // inner padding for axes

  fill(doc, '#f9fafb');
  stroke(doc, '#e5e7eb');
  doc.setLineWidth(0.2);
  doc.rect(MARGIN, y, chartW, chartH, 'FD');

  const durations = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 480, 720, 1200, 1800, 3600];
  const powers = durations.map(t => cp + wPrime / t);
  const maxPow = Math.max(...powers);
  const minPow = Math.min(...powers);
  const minLogT = Math.log10(durations[0]);
  const maxLogT = Math.log10(durations[durations.length - 1]);

  const innerLeft  = MARGIN + PAD;
  const innerRight = MARGIN + chartW - PAD * 0.5;
  const innerTop   = y + 3;
  const innerBot   = y + chartH - 5;
  const innerH     = innerBot - innerTop;
  const innerW     = innerRight - innerLeft;

  function px(t: number): number {
    return innerLeft + ((Math.log10(t) - minLogT) / (maxLogT - minLogT)) * innerW;
  }
  function py(p: number): number {
    return innerBot - ((p - minPow) / (maxPow - minPow)) * innerH;
  }

  // CP reference line
  stroke(doc, '#7c3aed');
  doc.setLineWidth(0.2);
  doc.line(innerLeft, py(cp), innerRight, py(cp));
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  textColor(doc, '#7c3aed');
  doc.text(`CP ${Math.round(cp)} W`, innerRight - 1, py(cp) - 1, { align: 'right' });

  // PD curve
  stroke(doc, '#2563eb');
  doc.setLineWidth(0.7);
  for (let i = 0; i < durations.length - 1; i++) {
    doc.line(px(durations[i]), py(powers[i]), px(durations[i + 1]), py(powers[i + 1]));
  }

  // X-axis labels
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  textColor(doc, '#9ca3af');
  [{ t: 30, l: '30s' }, { t: 60, l: '1m' }, { t: 300, l: '5m' }, { t: 1200, l: '20m' }, { t: 3600, l: '1h' }]
    .forEach(({ t, l }) => doc.text(l, px(t), y + chartH - 0.5, { align: 'center' }));

  // Y-axis labels
  const yTicks = [Math.ceil(minPow / 50) * 50, Math.round((minPow + maxPow) / 2 / 50) * 50, Math.floor(maxPow / 50) * 50];
  yTicks.forEach(p => {
    if (p >= minPow && p <= maxPow) {
      doc.text(`${p}`, MARGIN + PAD - 1.5, py(p) + 1.5, { align: 'right' });
    }
  });

  y += chartH + 10;

  // ── Training Zones ─────────────────────────────────────────────────────────
  if (isPro && zones.length > 0) {
    sectionLabel(doc, 'TRAINING ZONES', y);
    y += 4;

    const zoneBg: Record<string, string> = {
      'Zone 1':  '#dbeafe', 'Zone 2':  '#bfdbfe',
      'Zone 3A': '#dcfce7', 'Zone 3B': '#bbf7d0',
      'Zone 4':  '#fef9c3', 'Zone 5A': '#ffedd5',
      'Zone 5B': '#fee2e2', 'Zone 6':  '#fecaca',
      'Zone 7':  '#ede9fe',
    };

    const rowH  = 7;
    const labelCol = MARGIN + 22;
    const wattCol  = MARGIN + CW - 1;

    zones.forEach((z, i) => {
      const ry = y + i * rowH;
      fill(doc, zoneBg[z.name] ?? '#f3f4f6');
      doc.rect(MARGIN, ry, CW, rowH - 0.5, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      textColor(doc, '#111827');
      doc.text(z.name, MARGIN + 2, ry + 4.7);

      doc.setFont('helvetica', 'normal');
      textColor(doc, '#6b7280');
      doc.text(z.label, labelCol, ry + 4.7);

      doc.setFont('helvetica', 'bold');
      textColor(doc, '#111827');
      doc.text(`${Math.round(z.low)}–${Math.round(z.high)} W`, wattCol, ry + 4.7, { align: 'right' });
    });

    y += zones.length * rowH + 8;
  }

  // ── Confidence intervals ───────────────────────────────────────────────────
  sectionLabel(doc, 'CONFIDENCE INTERVALS', y);
  y += 4;

  [
    { label: 'VLamax 95% CI', value: `${result.vlaNLow} – ${result.vlaNHigh} mmol/L/s` },
    { label: 'CP 95% CI',     value: `${result.ftpLow} – ${result.ftpHigh} W` },
  ].forEach((ci, i) => {
    const x = MARGIN + i * ((CW / 2) + 3);
    fill(doc, '#f9fafb');
    stroke(doc, '#e5e7eb');
    doc.setLineWidth(0.2);
    doc.rect(x, y, CW / 2 - 3, 12, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    textColor(doc, '#374151');
    doc.text(ci.label, x + 3, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    textColor(doc, '#6b7280');
    doc.text(ci.value, x + 3, y + 10);
  });

  // ── Footer ─────────────────────────────────────────────────────────────────
  stroke(doc, '#e5e7eb');
  doc.setLineWidth(0.2);
  doc.line(MARGIN, PH - 12, PW - MARGIN, PH - 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  textColor(doc, '#9ca3af');
  doc.text('Generated by Fueling Sense · fuelingsense.com', MARGIN, PH - 7);
  doc.text(dateStr, PW - MARGIN, PH - 7, { align: 'right' });

  // ── Save ───────────────────────────────────────────────────────────────────
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  doc.save(`fueling-sense-profile-${slug}.pdf`);
}
