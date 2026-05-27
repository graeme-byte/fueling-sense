'use client';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import type { RunningSubstratePoint } from '@/lib/engine/runningTypes';
import { formatPace } from '@/lib/engine/runningMetabolicEngine';

// Caloric densities — display conversion only, never fed back into calculations
const FAT_KCAL_PER_G = 9.3;
const CHO_KCAL_PER_G = 4.1;

// Staggered y-offsets (px from chart top) — priority order matches bike chart
// 1 Target  → 12   (most actionable — fueling chart only)
// 2 CARB90  → 26
// 3 FATmax  → 40
// 4 LT1     → 54
// 5 MLSS    → 68   (anchor)
const LABEL_Y = { target: 12, carb90: 26, fatmax: 40, lt1: 54, mlss: 68 } as const;

// Custom label component — mirrors bike chart RefLabel exactly
function RefLabel(props: {
  viewBox?: { x: number; y: number; height: number };
  label:    string;
  color:    string;
  yOffset:  number;
}) {
  const { viewBox, label, color, yOffset } = props;
  if (!viewBox) return null;
  return (
    <text
      x={viewBox.x + 4}
      y={viewBox.y + yOffset}
      fill={color}
      fontSize={8}
      fontFamily="inherit"
    >
      {label}
    </text>
  );
}

interface Props {
  curve:          RunningSubstratePoint[];
  lt1SpeedMs:     number;
  fatmaxSpeedMs?: number;
  mlssSpeedMs:    number;
  carb90SpeedMs?: number;   // only passed when CARB90 is actually found
  targetSpeedMs?: number;   // fueling chart only
}

export default function RunningSubstrateCurveChart({
  curve, lt1SpeedMs, fatmaxSpeedMs, mlssSpeedMs, carb90SpeedMs, targetSpeedMs,
}: Props) {
  // Convert g/h to kcal/h at full float precision — no rounding here.
  // The engine now supplies unrounded substrate values (0.01 m/s resolution).
  // Rounding only happens in the tooltip formatter below, where it is display-only.
  // Practical lower bound: avoid absurdly slow paces (≥20 min/km)
  const lowerSpeed = Math.max(2.0, lt1SpeedMs * 0.70, mlssSpeedMs * 0.50);
  // Upper bound: at least 15% above MLSS, or 5% above CARB90 if present
  const upperSpeed = Math.max(
    mlssSpeedMs * 1.15,
    carb90SpeedMs !== undefined ? carb90SpeedMs * 1.05 : 0,
    targetSpeedMs !== undefined ? targetSpeedMs * 1.05 : 0,
  );

  const allPoints = curve.map(pt => ({
    speed: pt.speed,
    fat:   pt.fat_g_h * FAT_KCAL_PER_G,
    cho:   pt.cho_g_h * CHO_KCAL_PER_G,
    fatG:  pt.fat_g_h,
    choG:  pt.cho_g_h,
    total: pt.total_kcal_h,
  }));
  const chartData = allPoints.filter(pt => pt.speed >= lowerSpeed && pt.speed <= upperSpeed);

  return (
    <div className="w-full" style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>

          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />

          <XAxis
            dataKey="speed"
            type="number"
            domain={[lowerSpeed, upperSpeed]}
            tickCount={6}
            tickFormatter={(v: number) => formatPace(v)}
            label={{ value: 'Pace (min/km)', position: 'insideBottom', offset: -4, fontSize: 9, fill: '#9ca3af' }}
            tick={{ fontSize: 9 }}
            height={36}
          />
          <YAxis
            tick={{ fontSize: 10 }}
            label={{ value: 'kcal/h', angle: -90, position: 'insideLeft', fontSize: 9 }}
          />

          <Tooltip
            labelFormatter={(v) => `Pace: ${formatPace(Number(v))}`}
            formatter={(val, name, props) => {
              const pt = props.payload as { fat: number; cho: number; fatG: number; choG: number } | undefined;
              if (name === 'fat') {
                return [`${Math.round(Number(val))} kcal/h  (${pt ? pt.fatG.toFixed(1) : '—'} g/h)`, 'Fat'];
              }
              if (name === 'cho') {
                const totalKcal = pt ? Math.round(pt.fat + pt.cho) : '—';
                return [`${Math.round(Number(val))} kcal/h  (${pt ? pt.choG.toFixed(1) : '—'} g/h) · Total ${totalKcal} kcal/h`, 'CHO'];
              }
              return [`${Math.round(Number(val))}`, String(name)];
            }}
          />
          <Legend formatter={v => v === 'fat' ? 'Fat (kcal/h)' : 'CHO (kcal/h)'} />

          {/* LT1 */}
          <ReferenceLine
            x={lt1SpeedMs}
            stroke="#10b981" strokeDasharray="4 3"
            label={<RefLabel label={`LT1 ${formatPace(lt1SpeedMs)}`} color="#10b981" yOffset={LABEL_Y.lt1} />}
          />

          {/* FATmax — only when provided */}
          {fatmaxSpeedMs !== undefined && (
            <ReferenceLine
              x={fatmaxSpeedMs}
              stroke="#f59e0b" strokeDasharray="5 3"
              label={<RefLabel label={`FATmax ${formatPace(fatmaxSpeedMs)}`} color="#f59e0b" yOffset={LABEL_Y.fatmax} />}
            />
          )}

          {/* CARB90 — only when threshold was found within modelled range */}
          {carb90SpeedMs !== undefined && (
            <ReferenceLine
              x={carb90SpeedMs}
              stroke="#0284c7" strokeDasharray="4 2"
              label={<RefLabel label={`CARB90 ${formatPace(carb90SpeedMs)}`} color="#0284c7" yOffset={LABEL_Y.carb90} />}
            />
          )}

          {/* Target — fueling chart only */}
          {targetSpeedMs !== undefined && (
            <ReferenceLine
              x={targetSpeedMs}
              stroke="#7c3aed" strokeDasharray="5 3"
              label={<RefLabel label={`Target ${formatPace(targetSpeedMs)}`} color="#7c3aed" yOffset={LABEL_Y.target} />}
            />
          )}

          {/* MLSS */}
          <ReferenceLine
            x={mlssSpeedMs}
            stroke="#ef4444" strokeDasharray="3 2" strokeOpacity={0.5}
            label={<RefLabel label={`MLSS ${formatPace(mlssSpeedMs)}`} color="#ef4444" yOffset={LABEL_Y.mlss} />}
          />

          {/*
            Stacked areas — fat base layer (green, 0 → fatKcalH),
            CHO on top (orange, fatKcalH → totalKcalH).
            Total height = total energy demand (kcal/h).

            Solid fills (no directional gradient): a top-to-bottom gradient
            makes the bottom boundary of each fill fade toward transparent,
            which visually implies each area independently reaches zero. Flat
            fills make the stack boundary read clearly at every intensity.
          */}
          <Area
            type="monotone" dataKey="fat" stackId="sub"
            stroke="#f59e0b" strokeWidth={1.5}
            fill="#f59e0b" fillOpacity={0.45}
            name="fat"
          />
          <Area
            type="monotone" dataKey="cho" stackId="sub"
            stroke="#3b82f6" strokeWidth={1.5}
            fill="#3b82f6" fillOpacity={0.45}
            name="cho"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
