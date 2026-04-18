'use client';

import Link from 'next/link';

interface Props {
  mlss: number;  // LT2 in watts
}

/**
 * Preview CHO estimate at ~72.5% of LT2 (Ironman race intensity).
 *
 * Formula:
 *   target_W     = mlss × 0.725          (72.5% of LT2)
 *   energy_in    = target_W / 0.23       (gross efficiency 23%)
 *   cho_rate     = energy_in × 3.6 × 0.58 / 16.74
 *                → target_W × 0.393 g/hr
 *
 * Constants:
 *   GE = 0.23  |  CHO fraction at intensity ≈ 0.58  |  CHO = 16.74 kJ/g
 *
 * This is a simplified preview approximation — NOT the full fueling model.
 */
function estimateCHO(mlss: number): number {
  return Math.round(mlss * 0.393);
}

export default function FuelingSnapshot({ mlss }: Props) {
  const choGhr  = estimateCHO(mlss);
  const rangeLo = Math.round(mlss * 0.70);
  const rangeHi = Math.round(mlss * 0.75);

  return (
    <div className="space-y-3">

      {/* Teaser card */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
          Fueling Snapshot
        </p>

        <p className="text-base font-bold text-gray-900 leading-snug">
          Your carbohydrate use at Ironman race intensity is ~{choGhr} g/h.
        </p>

        <p className="text-sm font-semibold text-violet-700 mt-2">
          Can you actually fuel this?
        </p>

        <p className="text-xs text-gray-400 mt-1.5">
          Estimated at ~70–75% of threshold power ({rangeLo}–{rangeHi} W)
        </p>
      </div>

      {/* Locked strategy preview */}
      <div className="bg-white rounded-xl shadow-sm border border-dashed border-gray-200 relative overflow-hidden">
        <div className="p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
            Fueling Strategy
          </p>

          {/* Content — blurred to indicate locked state */}
          <div className="space-y-2 select-none pointer-events-none blur-[3px]">
            {[
              { label: 'CHO intake target',       value: '-- g/h'   },
              { label: 'Glucose : Fructose ratio', value: '-- : --'  },
              { label: 'Race fueling plan',        value: 'Personalised' },
            ].map(row => (
              <div
                key={row.label}
                className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0"
              >
                <span className="text-xs text-gray-500">{row.label}</span>
                <span className="text-sm font-bold text-gray-700">{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/75">
          <Link
            href="/pricing"
            className="px-5 py-2.5 bg-violet-600 text-white text-sm font-bold rounded-lg hover:bg-violet-700 transition shadow-sm"
          >
            Unlock Fueling Sense →
          </Link>
          <p className="text-xs text-gray-400 mt-2">Full fueling model with Pro</p>
        </div>
      </div>

    </div>
  );
}
