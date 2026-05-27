'use client';

import type { RunningZone } from '@/lib/engine/runningTypes';

interface Props {
  zones: RunningZone[];
}

const zoneColors: Record<string, string> = {
  REC:  'bg-blue-50  text-blue-700  border-blue-200',
  BASE: 'bg-green-50 text-green-700 border-green-200',
  TMP:  'bg-teal-50  text-teal-700  border-teal-200',
  FAT:  'bg-amber-50 text-amber-700 border-amber-200',
  THR:  'bg-orange-50 text-orange-700 border-orange-200',
  AMAX: 'bg-red-50   text-red-700   border-red-200',
  ANAX: 'bg-purple-50 text-purple-700 border-purple-200',
  LAEX: 'bg-indigo-50 text-indigo-700 border-indigo-200',
};

export default function RunningSubstrateZonesTable({ zones }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 px-2 font-semibold text-gray-500 whitespace-nowrap">Zone</th>
            <th className="text-left py-2 px-2 font-semibold text-gray-500 whitespace-nowrap">Pace range</th>
            <th className="text-left py-2 px-2 font-semibold text-gray-500 whitespace-nowrap">Target</th>
            <th className="text-right py-2 px-2 font-semibold text-gray-500">kcal/h</th>
            <th className="text-right py-2 px-2 font-semibold text-gray-500">% Fat</th>
            <th className="text-right py-2 px-2 font-semibold text-gray-500">% CHO</th>
            <th className="text-right py-2 px-2 font-semibold text-gray-500 whitespace-nowrap">Fat g/h</th>
            <th className="text-right py-2 px-2 font-semibold text-gray-500 whitespace-nowrap">CHO g/h</th>
          </tr>
        </thead>
        <tbody>
          {zones.map(z => (
            <tr key={z.code} className="border-b border-gray-100 hover:bg-gray-50 transition">
              <td className="py-2 px-2">
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-semibold ${zoneColors[z.code] ?? 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                  <span className="font-mono">{z.code}</span>
                  <span className="hidden sm:inline font-normal">{z.name}</span>
                </span>
              </td>
              <td className="py-2 px-2 font-mono text-gray-600 whitespace-nowrap">
                {z.pace_lo} – {z.pace_hi}
              </td>
              <td className="py-2 px-2 font-mono font-semibold text-gray-800 whitespace-nowrap">
                {z.pace_target}
              </td>
              <td className="py-2 px-2 text-right text-gray-700">{z.kcal_h}</td>
              <td className="py-2 px-2 text-right text-emerald-700 font-medium">{z.pct_fat}%</td>
              <td className="py-2 px-2 text-right text-orange-700 font-medium">{z.pct_cho}%</td>
              <td className="py-2 px-2 text-right text-emerald-700">{z.fat_g_h}</td>
              <td className="py-2 px-2 text-right text-orange-700">{z.cho_g_h}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
