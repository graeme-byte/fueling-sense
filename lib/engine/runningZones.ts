/**
 * runningZones.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Running zone builder — exact Stage 4 of running_metabolic_equations_v2.1.md.
 *
 * SOURCE OF TRUTH: running_metabolic_equations_v2.1.md (Stewart Sports Ltd v2.1)
 *
 * v2.1 signature: buildZones(lt1, mlss, xf, vlamax, mass)
 *   xf  = FATmax fraction (0.25–0.80) — not the pre-multiplied speed
 *   vo2max is NOT a parameter (substrateAtSpeed no longer accepts it)
 *
 * ISOLATION: imports only from runningTypes and runningMetabolicEngine.
 * No imports from any bike engine file.
 */

import type { RunningZone, RunningProfilerZone } from './runningTypes';
import { substrateAtSpeed, formatPace } from './runningMetabolicEngine';

export function buildRunningZones(
  lt1: number,
  mlss: number,
  xf: number,     // FATmax fraction — v2.1: pass the fraction, not the speed
  vlamax: number,
  mass: number,
): RunningZone[] {
  type Ref = 'lt1' | 'mlss' | 'fatmax' | 'range';

  const zoneDefs: {
    name: string;
    code: string;
    lo: number;
    hi: number;
    ref: Ref;
  }[] = [
    { name: 'Recovery',          code: 'REC',  lo: 0.60, hi: 0.75, ref: 'lt1'    },
    { name: 'Base / Aerobic',    code: 'BASE', lo: 0.75, hi: 0.90, ref: 'lt1'    },
    { name: 'Tempo',             code: 'TMP',  lo: 0.90, hi: 1.00, ref: 'lt1'    },
    { name: 'FATmax',            code: 'FAT',  lo: 0.85, hi: 0.97, ref: 'fatmax' },
    { name: 'Threshold (MLSS)',  code: 'AT',   lo: 0.97, hi: 1.03, ref: 'mlss'   },
    { name: 'Aerobic Max',       code: 'AMAX', lo: 1.03, hi: 1.10, ref: 'mlss'   },
    { name: 'High Anaerobic',    code: 'ANAX', lo: 1.10, hi: 1.25, ref: 'mlss'   },
    { name: 'Lactate Shuttle',   code: 'LAEX', lo: 0.80, hi: 1.08, ref: 'range'  },
  ];

  return zoneDefs.map(z => {
    let vLo: number;
    let vHi: number;
    let vTarget: number;

    if (z.ref === 'lt1') {
      vLo     = lt1 * z.lo;
      vHi     = lt1 * z.hi;
      vTarget = lt1 * ((z.lo + z.hi) / 2);
    } else if (z.ref === 'mlss') {
      vLo     = mlss * z.lo;
      vHi     = mlss * z.hi;
      vTarget = mlss * ((z.lo + z.hi) / 2);
    } else if (z.ref === 'fatmax') {
      // v2.1: v_target = xf × mlss; v_lo = target × 0.95; v_hi = target × 1.05
      vTarget = xf * mlss;
      vLo     = vTarget * 0.95;
      vHi     = vTarget * 1.05;
    } else {
      // 'range' — Lactate Shuttle: lt1 × 0.90 → mlss × 1.05
      vLo     = lt1  * 0.90;
      vHi     = mlss * 1.05;
      vTarget = (vLo + vHi) / 2;
    }

    // v2.1: substrateAtSpeed(v, vlamax, mlss, mass) — no vo2max
    const sub = substrateAtSpeed(Math.max(0.5, vTarget), vlamax, mlss, mass);

    const pctFat = Math.round((sub.fat_g_h * 9.3 / sub.total_kcal_h) * 100);
    const pctCho = Math.round((sub.cho_g_h * 4.1 / sub.total_kcal_h) * 100);

    return {
      name:         z.name,
      code:         z.code,
      speed_lo:     vLo,
      speed_hi:     vHi,
      speed_target: vTarget,
      pace_lo:      formatPace(vLo),
      pace_hi:      formatPace(vHi),
      pace_target:  formatPace(vTarget),
      fat_g_h:      Math.round(sub.fat_g_h),
      cho_g_h:      Math.round(sub.cho_g_h),
      kcal_h:       Math.round(sub.total_kcal_h),
      pct_fat:      pctFat,
      pct_cho:      pctCho,
    };
  });
}


// ── Profiler-facing zone builder ──────────────────────────────────────────────
//
// Produces bike-aligned zones (Zone 1 – Zone 7, with 3A/3B and 5A/5B) for the
// Running Profiler zone table. No substrate columns — intensity anchors only.
//
// Mirrors the bike profiler's v06Zones.ts boundary logic, translated to m/s:
//   Zone 1  : anchor → 80% LT1
//   Zone 2  : 80% LT1 → LT1
//   Zone 3A : LT1 → 110% LT1
//   Zone 3B : 110% LT1 → 90% LT2   (omitted if ≤ 3A upper)
//   Zone 4  : previous upper → LT2
//   Zone 5A : LT2 → 90% vVO2max    (omitted if gap ≤ 0)
//   Zone 5B : 90% vVO2max → vVO2max
//   Zone 6  : vVO2max → 90% sprint  (omitted if gap ≤ 0)
//   Zone 7  : 90% sprint → sprint

export function buildRunningProfilerZones(
  lt1Ms:   number,
  mlssMs:  number,   // = LT2
  vVO2Ms:  number,   // = vVO2max speed
  s20Ms:   number,   // = sprint speed
): RunningProfilerZone[] {
  // Display: slow end (high pace value) first, then fast end (low pace value).
  // e.g. '5:44/km – 4:47/km' (easy → hard — the natural athlete reading order)
  function paceRange(speedLo: number, speedHi: number): string {
    return `${formatPace(speedLo)} – ${formatPace(speedHi)}`;
  }

  const zones: RunningProfilerZone[] = [];
  const lowerAnchor = Math.max(1.0, lt1Ms * 0.50);

  const z1Hi  = lt1Ms * 0.80;
  const z2Hi  = lt1Ms;
  const z3aHi = lt1Ms * 1.10;
  const z3bHi = mlssMs * 0.90;
  const z4Hi  = mlssMs;

  zones.push({ name: 'Zone 1', label: 'Recovery',         paceRange: paceRange(lowerAnchor, z1Hi), speedLow: lowerAnchor, speedHigh: z1Hi });
  zones.push({ name: 'Zone 2', label: 'Base Endurance',   paceRange: paceRange(z1Hi,  z2Hi),  speedLow: z1Hi,  speedHigh: z2Hi });
  zones.push({ name: 'Zone 3A', label: 'Aerobic Threshold', paceRange: paceRange(z2Hi, z3aHi), speedLow: z2Hi, speedHigh: z3aHi });

  // Zone 3B: 110% LT1 → 90% LT2 — only when a meaningful gap exists
  let prevHi = z3aHi;
  if (z3bHi > z3aHi) {
    zones.push({ name: 'Zone 3B', label: 'Tempo', paceRange: paceRange(z3aHi, z3bHi), speedLow: z3aHi, speedHigh: z3bHi });
    prevHi = z3bHi;
  }
  zones.push({ name: 'Zone 4', label: 'Threshold', paceRange: paceRange(prevHi, z4Hi), speedLow: prevHi, speedHigh: z4Hi });

  if (vVO2Ms > mlssMs) {
    const z5aHi = vVO2Ms * 0.90;
    const z5bHi = vVO2Ms;

    if (z5aHi > mlssMs) {
      zones.push({ name: 'Zone 5A', label: 'Sub-VO2max', paceRange: paceRange(mlssMs, z5aHi), speedLow: mlssMs, speedHigh: z5aHi });
    }
    zones.push({ name: 'Zone 5B', label: 'VO₂max', paceRange: paceRange(z5aHi > mlssMs ? z5aHi : mlssMs, z5bHi), speedLow: z5aHi > mlssMs ? z5aHi : mlssMs, speedHigh: z5bHi });

    if (s20Ms > vVO2Ms) {
      const z6Hi = s20Ms * 0.90;
      if (z6Hi > vVO2Ms) {
        zones.push({ name: 'Zone 6', label: 'Anaerobic', paceRange: paceRange(vVO2Ms, z6Hi), speedLow: vVO2Ms, speedHigh: z6Hi });
      }
      zones.push({ name: 'Zone 7', label: 'Neuromuscular', paceRange: paceRange(z6Hi > vVO2Ms ? z6Hi : vVO2Ms, s20Ms), speedLow: z6Hi > vVO2Ms ? z6Hi : vVO2Ms, speedHigh: s20Ms });
    }
  }

  return zones;
}
