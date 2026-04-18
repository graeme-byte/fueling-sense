'use client';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import type { DenseSubstratePoint } from '@/lib/types';

interface Props {
  denseSubstrateSeries: DenseSubstratePoint[];
  fatmaxPctMLSS:        number;
  targetPctMLSS:        number;
  mlssWatts:            number;
  lt1Watts:             number;
  carb90:               { watts: number; found: boolean };
}

// Custom label component for reference lines.
// `yOffset` positions the text at a fixed distance from the top of the chart area,
// giving deterministic stagger regardless of marker proximity.
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

// Staggered vertical offsets (px from chart top) — priority order:
// 1 Target  → 12   (highest priority — most actionable)
// 2 CARB90  → 26
// 3 FATmax  → 40
// 4 LT1     → 54
// 5 LT2     → 68   (anchor — always at right edge)
const LABEL_Y = { target: 12, carb90: 26, fatmax: 40, lt1: 54, lt2: 68 } as const;

export default function SubstrateCurveChart({
  denseSubstrateSeries, fatmaxPctMLSS, targetPctMLSS, mlssWatts, lt1Watts, carb90,
}: Props) {
  // Chart display range: [50% MLSS → 120% MLSS].
  // v0.6 produces no explicit FTP; MLSS is the FTP proxy (FTP ≈ MLSS in this model).
  // Lower bound filters the data array so the area fill starts at 50% MLSS, not 1 W.
  const chartCeiling = Math.round(1.20 * mlssWatts);
  const chartFloor   = Math.round(0.50 * mlssWatts);
  const chartData = denseSubstrateSeries
    .filter(p => p.watts >= chartFloor && p.watts <= chartCeiling)
    .map(p => ({
      watts: p.watts,
      fat:   p.fatKcalH,
      cho:   p.choKcalH,
      fatG:  Math.round(p.fatG),
      choG:  Math.round(p.choG),
      total: p.kcalPerHour,
    }));

  const fatmaxWatts = Math.round(fatmaxPctMLSS * mlssWatts);
  const targetWatts = Math.round(targetPctMLSS  * mlssWatts);

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-bold text-gray-800 mb-1">Substrate Oxidation (kcal/h)</h3>
        <p className="text-xs text-gray-400 mb-3">
          Fat and carbohydrate contribution across power output
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="fatGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="choGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="watts"
              type="number"
              domain={[Math.round(0.5 * mlssWatts), 'dataMax']}
              tickFormatter={(v: number) => `${Math.round(v)}`}
              label={{ value: 'Power (W)', position: 'insideBottom', offset: -4, fontSize: 9 }}
              tick={{ fontSize: 10 }}
              height={36}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              label={{ value: 'kcal/h', angle: -90, position: 'insideLeft', fontSize: 9 }}
            />
            <Tooltip
              labelFormatter={(w) => `${Math.round(Number(w))} W`}
              formatter={(v, name) => [
                `${Math.round(Number(v))} kcal/h`,
                name === 'fat' ? 'Fat' : 'CHO',
              ]}
            />
            <Legend formatter={v => v === 'fat' ? 'Fat (kcal/h)' : 'CHO (kcal/h)'} />

            {/* LT1 — only rendered when explicitly set (lt1Watts > 0); hidden for manual users */}
            {lt1Watts > 0 && (
              <ReferenceLine
                x={lt1Watts}
                stroke="#10b981" strokeDasharray="4 3"
                label={<RefLabel label={`LT1 ${Math.round(lt1Watts)}W`} color="#10b981" yOffset={LABEL_Y.lt1} />}
              />
            )}
            {/* FATmax */}
            <ReferenceLine
              x={fatmaxWatts}
              stroke="#f59e0b" strokeDasharray="5 3"
              label={<RefLabel label={`FATmax ${fatmaxWatts}W`} color="#f59e0b" yOffset={LABEL_Y.fatmax} />}
            />
            {/* CARB90 — only shown when the threshold exists within the modelled range */}
            {carb90.found && (
              <ReferenceLine
                x={carb90.watts}
                stroke="#0284c7" strokeDasharray="4 2"
                label={<RefLabel label={`CARB90 ${carb90.watts}W`} color="#0284c7" yOffset={LABEL_Y.carb90} />}
              />
            )}
            {/* Target */}
            <ReferenceLine
              x={targetWatts}
              stroke="#7c3aed" strokeDasharray="5 3"
              label={<RefLabel label={`Target ${targetWatts}W`} color="#7c3aed" yOffset={LABEL_Y.target} />}
            />
            {/* LT2 */}
            <ReferenceLine
              x={mlssWatts}
              stroke="#ef4444" strokeDasharray="3 2" strokeOpacity={0.5}
              label={<RefLabel label={`LT2 ${Math.round(mlssWatts)}W`} color="#ef4444" yOffset={LABEL_Y.lt2} />}
            />

            {/* Stacked areas — fat base, cho on top */}
            <Area
              type="monotone" dataKey="fat" stackId="sub"
              stroke="#f59e0b" strokeWidth={2}
              fill="url(#fatGrad)"
              name="fat"
            />
            <Area
              type="monotone" dataKey="cho" stackId="sub"
              stroke="#3b82f6" strokeWidth={2}
              fill="url(#choGrad)"
              name="cho"
            />
          </AreaChart>
        </ResponsiveContainer>
    </div>
  );
}
