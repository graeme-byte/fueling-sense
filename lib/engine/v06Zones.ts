/**
 * v06Zones.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Locked v0.6 physiology-anchored training zone builder.
 * Isolated from the legacy calcTrainingZones() in inscydEngine.ts.
 *
 * Anchors:
 *   LT1  → L2/L3a boundary (aerobic threshold)
 *   LT2  → L4/L5a boundary (maximal lactate steady state)
 *   P300 → L5b/L6 boundary (VO2max power proxy)
 *   P20  → L6/L7 boundary  (sprint ceiling)
 *
 * Zone structure (locked — do not modify without updating the spec):
 *   Zone 1:  0          → 80% LT1      (Recovery)
 *   Zone 2:  80% LT1    → LT1          (Base Endurance)
 *   Zone 3A: LT1        → 110% LT1     (Aerobic Threshold)
 *   Zone 3B: 110% LT1   → 90% LT2     (Tempo)            ← 90%, not 95% as in legacy
 *   Zone 4:  90% LT2    → LT2          (Threshold)        ← 90%, not 95% as in legacy
 *   Zone 5A: LT2        → 90% P300     (Sub-VO2max)       conditional — omitted when gap ≤ 0
 *   Zone 5B: 90% P300   → P300         (VO2max)
 *   Zone 6:  P300       → 90% P20      (Anaerobic)        conditional — omitted when gap ≤ 0
 *   Zone 7:  90% P20    → P20          (Neuromuscular)
 *
 * ── Spec ambiguity: L7 lower bound ───────────────────────────────────────────
 * The locked spec says L7 is "> P20 − 20%" (i.e., > 80% P20). L6 ends at 90% P20.
 * A literal reading creates a backward overlap (80% P20 < 90% P20 = L6 high).
 * Resolution: L7 is implemented starting at 90% P20 (contiguous with L6 end).
 * The "> 80% P20" notation describes the zone's general intensity domain only.
 *
 * ── CP isolation ──────────────────────────────────────────────────────────────
 * CP is not used anywhere in this file. All boundaries are LT1, LT2, P300, P20.
 */

import type { TrainingZone } from '@/lib/types';

/**
 * Compute v0.6 physiology-anchored training zones.
 *
 * @param lt1  — LT1 (aerobic threshold) in watts — from v0.6 engine outputs
 * @param lt2  — LT2 / MLSS in watts — from v0.6 engine outputs
 * @param p300 — 5-minute max mean power in watts — from v0.6 engine inputs
 * @param p20  — 20-second sprint mean power in watts — from v0.6 engine inputs
 * @returns    Array of TrainingZone objects; empty array if inputs are non-monotonic
 */
export function calcV06TrainingZones(
  lt1:  number,
  lt2:  number,
  p300: number,
  p20:  number,
): TrainingZone[] {
  // ── Boundaries ────────────────────────────────────────────────────────────
  const z1High  = Math.round(lt1 * 0.80);   // 80% LT1  — L1/L2 boundary
  const z2High  = Math.round(lt1);          // LT1       — L2/L3a boundary
  const z3aHigh = Math.round(lt1 * 1.10);   // 110% LT1  — L3a/L3b boundary
  const z3bHigh = Math.round(lt2 * 0.90);   // 90% LT2   — L3b/L4 boundary (locked: 90%, not 95%)
  const z4High  = Math.round(lt2);          // LT2        — L4/L5a boundary
  const z5bLow  = Math.round(p300 * 0.90);  // 90% P300  — L5a/L5b boundary
  const z5bHigh = Math.round(p300);         // P300       — L5b/L6 boundary
  const z6High  = Math.round(p20 * 0.90);   // 90% P20   — L6/L7 boundary
  const z7High  = Math.round(p20);          // P20        — L7 ceiling

  // ── Monotonicity guard on always-present boundaries ───────────────────────
  const required: [string, number][] = [
    ['80% LT1',  z1High],
    ['LT1',      z2High],
    ['110% LT1', z3aHigh],
    ['90% LT2',  z3bHigh],
    ['LT2',      z4High],
    ['P300',     z5bHigh],
    ['90% P20',  z6High],
    ['P20',      z7High],
  ];

  for (let i = 1; i < required.length; i++) {
    if (required[i][1] <= required[i - 1][1]) {
      console.error(
        `[calcV06TrainingZones] Non-monotonic boundary: ${required[i][0]}=${required[i][1]}` +
        ` ≤ ${required[i - 1][0]}=${required[i - 1][1]}.` +
        ` Inputs: lt1=${Math.round(lt1)}, lt2=${Math.round(lt2)},` +
        ` p300=${Math.round(p300)}, p20=${Math.round(p20)}`,
      );
      return [];
    }
  }

  // ── Build zones ───────────────────────────────────────────────────────────
  // +1 applied to each low so adjacent zones never share a boundary value.
  // Anchors (z1High, z2High, etc.) are unchanged — +1 is display-only continuity.
  const zones: TrainingZone[] = [
    { name: 'Zone 1',  label: 'Recovery',         low: 0,           high: z1High  },
    { name: 'Zone 2',  label: 'Base Endurance',    low: z1High  + 1, high: z2High  },
    { name: 'Zone 3A', label: 'Aerobic Threshold', low: z2High  + 1, high: z3aHigh },
    { name: 'Zone 3B', label: 'Tempo',             low: z3aHigh + 1, high: z3bHigh },
    { name: 'Zone 4',  label: 'Threshold',         low: z3bHigh + 1, high: z4High  },
  ];

  // Zone 5A — sub-VO2max bridge; only emitted when a gap exists above LT2.
  // When absent, Zone 5B starts at LT2+1 to preserve non-overlapping continuity.
  if (z5bLow > z4High) {
    zones.push({ name: 'Zone 5A', label: 'Sub-VO2max', low: z4High  + 1, high: z5bLow  });
    zones.push({ name: 'Zone 5B', label: 'VO2max',     low: z5bLow  + 1, high: z5bHigh });
  } else {
    zones.push({ name: 'Zone 5B', label: 'VO2max',     low: z4High  + 1, high: z5bHigh });
  }

  // Zone 6 — anaerobic capacity; only emitted when a gap exists above P300.
  // When absent, Zone 7 starts at P300+1 to preserve non-overlapping continuity.
  if (z6High > z5bHigh) {
    zones.push({ name: 'Zone 6', label: 'Anaerobic',     low: z5bHigh + 1, high: z6High  });
    zones.push({ name: 'Zone 7', label: 'Neuromuscular', low: z6High  + 1, high: z7High  });
  } else {
    zones.push({ name: 'Zone 7', label: 'Neuromuscular', low: z5bHigh + 1, high: z7High  });
  }

  return zones;
}
