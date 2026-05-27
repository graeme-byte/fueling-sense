"""
validate_economy_v25.py
─────────────────────────────────────────────────────────────────────────────
Running model v2.5 economy validation.

Compares:
  OLD — FATzero fat curve + fixed RE_CONST energy (what the engine did before Step 2)
  NEW — FATzero fat curve + VO2max-individualised, speed-adjusted economy

Primary metrics (VO2max, VLamax, MLSS, LT1) are unchanged by economy.
This script focuses on substrate realism, economy distribution, CHO demand,
and CARB90 shifts.

Dataset: running_inscyd_profile_dataset.csv (19 C0 profiles)
"""

import csv
import math
from pathlib import Path

import numpy as np

try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False

# ── Constants ─────────────────────────────────────────────────────────────────

RE_CONST  = 12.22   # mL O2 / kg / km  — used in Stage 1 + MFO anchor only
O2_KCAL   = 5.0     # kcal / L O2
FAT_KCAL  = 9.3     # kcal / g fat
CHO_KCAL  = 4.1     # kcal / g carbohydrate

# v2.4 VO2max
VO2_INTERCEPT_24    = -11.373079
VO2_COEF_S360_24    =  14.311395
VO2_COEF_RESERVE_24 =   5.054782

# v2.2 VLamax
PCR_FRAC_BASE     =  0.838411
PCR_FRAC_SLOPE    = -0.204144
PCR_FFM_REF       = 66
AEROBIC_PROXY_COEF = 0.872091
VLA_POWER_COEF    =  0.005731
VLA_POWER_EXP     =  2.617584

# v2.3 MLSS / LT1
MLSS_INTERCEPT = -1.39219;  MLSS_S180 = 0.52459;  MLSS_S360 = 0.71862;  MLSS_VLA = -2.02976
LT1_INTERCEPT  = -1.35596;  LT1_S180  = 0.45336;  LT1_S360  = 0.61183;  LT1_VLA  = -2.42501

# FATmax
XF_BASE = 0.1124; XF_LNVLA = 0.1131; XF_VO2N = 0.4073

# MFO
MFO_BASE = 0.057224; MFO_VLA_C = 0.3842; MFO_VLA_OFF = 0.0149
MFO_VLA_REF = 0.55;  MFO_SCALE_RNG = 0.25; MFO_SCALE_FAC = 0.06

# ── Helpers ───────────────────────────────────────────────────────────────────

def clamp(v, lo, hi): return max(lo, min(hi, v))
def sig(x): return 1.0 / (1.0 + math.exp(-x))

def pace_str(ms):
    if ms <= 0: return '—'
    spk = 1000.0 / ms
    m = int(spk // 60); s = int(round(spk % 60))
    return f"{m}:{s:02d}/km"

# ── Stage 1 — primary metabolic markers ──────────────────────────────────────

def power_from_speed(v, mass):
    return v * RE_CONST * (60/1000) * O2_KCAL * mass * 1.163

def calc_vo2max(s180, s360):
    return clamp(VO2_INTERCEPT_24 + VO2_COEF_S360_24*s360 + VO2_COEF_RESERVE_24*(s180-s360), 20, 85)

def calc_vlamax(s20, s180, mass, ffm):
    p20  = power_from_speed(s20, mass)
    p180 = power_from_speed(s180, mass)
    pf   = PCR_FRAC_BASE + PCR_FRAC_SLOPE * ((ffm - PCR_FFM_REF) / PCR_FFM_REF)
    glyco = max(p20 - pf*(p20-p180) - AEROBIC_PROXY_COEF*p180, 1e-6)
    return clamp(VLA_POWER_COEF * math.pow(glyco/ffm, VLA_POWER_EXP), 0.05, 0.90)

def calc_mlss(s180, s360, vla):
    return clamp(MLSS_INTERCEPT + MLSS_S180*s180 + MLSS_S360*s360 + MLSS_VLA*vla, 1.0, 7.0)

def calc_lt1(s180, s360, vla, mlss):
    return clamp(LT1_INTERCEPT + LT1_S180*s180 + LT1_S360*s360 + LT1_VLA*vla, 0.5, mlss*0.95)

def calc_fatmax(vo2, vla, mlss):
    lnvla = math.log(MFO_VLA_REF / vla)
    xf = clamp(XF_BASE + XF_LNVLA*lnvla + XF_VO2N*(vo2/50), 0.25, 0.80)
    return xf * mlss, xf

def calc_mfo(mlss, vla, mass):
    mlss_ee = mlss * RE_CONST * (60/1000) * O2_KCAL * mass  # RE_CONST retained for MFO
    base = max(0, MFO_BASE*mlss_ee - (MFO_VLA_C*vla - MFO_VLA_OFF)*mass)
    vn   = clamp((MFO_VLA_REF - vla) / MFO_SCALE_RNG, -1, 1)
    mfo_g = base * (1 + MFO_SCALE_FAC*vn)
    return mfo_g, mfo_g * FAT_KCAL

# ── v2.5 economy model ────────────────────────────────────────────────────────

def estimate_base_economy(vo2max):
    if   vo2max < 40:  eco = 220.0
    elif vo2max <= 50: eco = 216 + (210-216)*(vo2max-40)/10
    elif vo2max <= 60: eco = 210 + (202-210)*(vo2max-50)/10
    elif vo2max <= 70: eco = 202 + (196-202)*(vo2max-60)/10
    elif vo2max <= 80: eco = 196 + (190-196)*(vo2max-70)/10
    else:              eco = 188.0
    return clamp(eco, 185, 225)

def adjust_economy(base, speed, mlss):
    x = speed / mlss
    if   x <= 0.85: modifier = -0.01
    elif x <= 1.00: modifier = -0.01 + 0.01*(x-0.85)/0.15
    elif x <= 1.15: modifier = 0.035*(x-1.00)/0.15
    else:           modifier = 0.05
    return clamp(base * (1 + modifier), 180, 235)

# ── v2.4/v2.5 FATzero fat curve ───────────────────────────────────────────────
#
# Both OLD and NEW use this same fat curve shape.
# The only difference: energy_at_speed uses RE_CONST (OLD) vs economy (NEW).

def fat_zero_speed(vla, mlss):
    vn = clamp((0.55 - vla) / 0.25, -1, 1)
    return clamp(mlss * (1 + 0.04*vn), mlss*0.96, mlss*1.04)

def substrate_at_speed(v, vla, mlss, mass, fatmax_v, mfo_g, base_economy=None):
    """
    base_economy=None  → OLD: fixed RE_CONST energy
    base_economy=float → NEW: economy-adjusted energy per speed
    """
    # Energy
    if base_economy is not None:
        eco = adjust_economy(base_economy, v, mlss)
        energy = (eco * v * 3.6 / 60) * mass * (60/1000) * O2_KCAL
    else:
        energy = v * RE_CONST * (60/1000) * O2_KCAL * mass

    # Fat — FATzero anchoring (v2.4)
    fat_zero = fat_zero_speed(vla, mlss)
    eff_fatmax = min(fatmax_v, fat_zero * 0.95)

    if v >= fat_zero:
        fat_gh = 0.0
    elif v >= eff_fatmax:
        vla_norm = clamp((0.55 - vla) / 0.25, -1, 1)
        alpha    = clamp(1.7 + 0.35*vla_norm, 1.25, 2.15)
        z        = clamp((v - eff_fatmax) / (fat_zero - eff_fatmax), 0, 1)
        fat_gh   = max(0, mfo_g * (1 - z**alpha)**2)
    else:
        r          = max(0, min(1, v / fatmax_v)) if fatmax_v > 0 else 0
        curve_gh   = mfo_g * (0.50 + 0.50 * r**1.8)
        max_fat_gh = energy / FAT_KCAL
        fat_gh     = max(0, min(curve_gh, max_fat_gh))

    fat_kcal = fat_gh * FAT_KCAL
    cho_kcal = max(0, energy - fat_kcal)
    return {'cho_gh': cho_kcal / CHO_KCAL,
            'fat_gh': fat_gh,
            'energy': energy,
            'eco':    adjust_economy(base_economy, v, mlss) if base_economy else RE_CONST / 0.06}

def detect_carb90(vla, mlss, mass, fatmax_v, mfo_g, base_economy=None):
    vmax = mlss * 1.15
    speeds = [0.5 + i*0.01 for i in range(int((vmax - 0.5)/0.01) + 2)]
    cho = [substrate_at_speed(v, vla, mlss, mass, fatmax_v, mfo_g, base_economy)['cho_gh']
           for v in speeds]
    # Forward monotone clamp
    for i in range(1, len(cho)):
        if cho[i] < cho[i-1]: cho[i] = cho[i-1]
    for i in range(len(speeds)-1):
        if cho[i] < 90 <= cho[i+1]:
            return speeds[i] + (90-cho[i])*(speeds[i+1]-speeds[i])/(cho[i+1]-cho[i])
    return vmax

# ── Load dataset ──────────────────────────────────────────────────────────────

data_path = Path(__file__).parent / 'running_inscyd_profile_dataset.csv'
rows = []
with open(data_path, newline='', encoding='utf-8-sig') as f:
    for row in csv.DictReader(f):
        p = row.get('profile','').strip()
        if p and not p.upper().startswith('T'):
            rows.append(row)
print(f"Loaded {len(rows)} profiles")

def fv(row, key):
    v = row.get(key, '').strip()
    return float(v) if v else None

# ── Process each profile ──────────────────────────────────────────────────────

results = []
for row in rows:
    pid   = row.get('profile','?')
    mass  = fv(row,'body_mass_kg'); bf = fv(row,'body_fat_pct')
    s20   = fv(row,'input_speed_20s_m_s')
    s180  = fv(row,'input_speed_180s_m_s')
    s360  = fv(row,'input_speed_360s_m_s')
    if any(v is None for v in [mass, bf, s20, s180, s360]):
        print(f"  SKIP {pid}: missing inputs"); continue

    ffm  = mass * (1 - bf/100)
    vo2  = calc_vo2max(s180, s360)
    vla  = calc_vlamax(s20, s180, mass, ffm)
    mlss = calc_mlss(s180, s360, vla)
    lt1  = calc_lt1(s180, s360, vla, mlss)
    fatmax_v, xf = calc_fatmax(vo2, vla, mlss)
    mfo_g, mfo_k = calc_mfo(mlss, vla, mass)

    # Ground truth
    gt = {
        'vo2':    fv(row,'inscyd_vo2max_relative_ml_kg_min'),
        'vla':    fv(row,'inscyd_vlamax_mmol_l_s'),
        'mlss':   fv(row,'mlss_speed_m_s'),
        'lt1':    fv(row,'lt1_speed_m_s'),
        'mfo_k':  fv(row,'mfo_absolute_kcal_h'),
        'carb90': fv(row,'carbmax_speed_m_s'),
    }
    hierarchy_ok = (s20 > s180 > s360)

    # Economy
    base_eco    = estimate_base_economy(vo2)
    eco_at_mlss = adjust_economy(base_eco, mlss, mlss)   # x=1.0 → modifier=0
    eco_at_s360 = adjust_economy(base_eco, s360, mlss)
    eco_at_s180 = adjust_economy(base_eco, s180, mlss)

    # Substrate at MLSS — old vs new
    sub_mlss_old = substrate_at_speed(mlss, vla, mlss, mass, fatmax_v, mfo_g, None)
    sub_mlss_new = substrate_at_speed(mlss, vla, mlss, mass, fatmax_v, mfo_g, base_eco)

    # Substrate at HM pace proxy (85% MLSS)
    hm_v = mlss * 0.85
    sub_hm_old = substrate_at_speed(hm_v, vla, mlss, mass, fatmax_v, mfo_g, None)
    sub_hm_new = substrate_at_speed(hm_v, vla, mlss, mass, fatmax_v, mfo_g, base_eco)

    # Substrate at 3-min speed (S180) — high-speed test
    sub_s180_old = substrate_at_speed(s180, vla, mlss, mass, fatmax_v, mfo_g, None)
    sub_s180_new = substrate_at_speed(s180, vla, mlss, mass, fatmax_v, mfo_g, base_eco)

    # Substrate at 6-min speed (S360 = vVO2max proxy) — high-speed test
    sub_s360_old = substrate_at_speed(s360, vla, mlss, mass, fatmax_v, mfo_g, None)
    sub_s360_new = substrate_at_speed(s360, vla, mlss, mass, fatmax_v, mfo_g, base_eco)

    # CARB90 — old vs new
    c90_old = detect_carb90(vla, mlss, mass, fatmax_v, mfo_g, None)
    c90_new = detect_carb90(vla, mlss, mass, fatmax_v, mfo_g, base_eco)

    results.append({
        'pid': pid, 'hierarchy_ok': hierarchy_ok,
        'mass': mass, 'vo2': vo2, 'vla': vla, 'mlss': mlss, 'lt1': lt1,
        'fatmax_v': fatmax_v, 'mfo_g': mfo_g, 'mfo_k': mfo_k,
        'gt': gt,
        'base_eco': base_eco, 'eco_at_mlss': eco_at_mlss,
        'eco_at_s360': eco_at_s360, 'eco_at_s180': eco_at_s180,
        's180': s180, 's360': s360,
        'sub_mlss_old': sub_mlss_old, 'sub_mlss_new': sub_mlss_new,
        'sub_hm_old':   sub_hm_old,   'sub_hm_new':   sub_hm_new,
        'sub_s180_old': sub_s180_old, 'sub_s180_new': sub_s180_new,
        'sub_s360_old': sub_s360_old, 'sub_s360_new': sub_s360_new,
        'c90_old': c90_old, 'c90_new': c90_new,
    })

# ── Stats helper ──────────────────────────────────────────────────────────────

def stats(acts, preds):
    a, p = np.array(acts), np.array(preds)
    ss_res = np.sum((a-p)**2); ss_tot = np.sum((a-np.mean(a))**2)
    n = len(a)
    return {
        'n': n,
        'r2':   float(1 - ss_res/ss_tot) if ss_tot > 0 else float('nan'),
        'mae':  float(np.mean(np.abs(a-p))),
        'rmse': float(np.sqrt(np.mean((a-p)**2))),
        'bias': float(np.mean(p-a)),
    }

SEP = '═' * 76

# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{SEP}")
print("  SECTION 1 — PRIMARY METRICS (unchanged by economy)")
print(f"  Note: VO2max, VLamax, MLSS, LT1 use RE_CONST in Stage 1. Economy")
print(f"  affects only energy→substrate. Primary metric stats are identical")
print(f"  to the pre-economy validation.")
print(SEP)

for metric, gt_key, label, unit in [
    ('vo2',  'vo2',  'VO2max',  'mL/kg/min'),
    ('mlss', 'mlss', 'MLSS',    'm/s'),
    ('lt1',  'lt1',  'LT1',     'm/s'),
]:
    preds = [r[metric] for r in results if r['gt'][gt_key] is not None]
    acts  = [r['gt'][gt_key] for r in results if r['gt'][gt_key] is not None]
    s = stats(acts, preds)
    print(f"\n  {label} ({unit})  n={s['n']}")
    print(f"    R²={s['r2']:.3f}  MAE={s['mae']:.3f}  RMSE={s['rmse']:.3f}  Bias={s['bias']:+.3f}")

# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{SEP}")
print("  SECTION 2 — ECONOMY DISTRIBUTION AUDIT")
print(f"  (expected ranges: Elite 185–195, Competitive 198–208, Rec 210–225)")
print(SEP)

ecos = [r['base_eco'] for r in results]
print(f"\n  Base economy (VO2max-derived, pre-speed-adjustment):")
print(f"    n={len(ecos)}  min={min(ecos):.1f}  max={max(ecos):.1f}  "
      f"mean={np.mean(ecos):.1f}  SD={np.std(ecos):.1f} mL/kg/km")

print(f"\n  {'Profile':>8}  {'VO2max':>7}  {'Base eco':>9}  {'@ MLSS':>7}  "
      f"{'@ S360(vVO2)':>13}  {'@ S180(3min)':>13}")
print(f"  {'-'*8}  {'-'*7}  {'-'*9}  {'-'*7}  {'-'*13}  {'-'*13}")
for r in results:
    flag = ' ⚠' if not r['hierarchy_ok'] else ''
    print(f"  {r['pid']:>8}{flag:2}  {r['vo2']:>7.1f}  {r['base_eco']:>9.1f}  "
          f"{r['eco_at_mlss']:>7.1f}  {r['eco_at_s360']:>13.1f}  {r['eco_at_s180']:>13.1f}")

over_elite = [r for r in results if r['base_eco'] > 208]
under_elite = [r for r in results if r['base_eco'] < 195]
print(f"\n  Athletes at elite economy (<195): "
      f"{[r['pid'] for r in under_elite] or 'none'}")
print(f"  Athletes at competitive economy (195–208): "
      f"{[r['pid'] for r in results if 195 <= r['base_eco'] <= 208]}")
print(f"  Athletes at recreational economy (>208): "
      f"{[r['pid'] for r in over_elite]}")

# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{SEP}")
print("  SECTION 3 — CARB90 OLD vs NEW")
print(SEP)

c90_old = [r['c90_old'] for r in results if r['gt']['carb90'] is not None]
c90_new = [r['c90_new'] for r in results if r['gt']['carb90'] is not None]
c90_act = [r['gt']['carb90'] for r in results if r['gt']['carb90'] is not None]

s_old = stats(c90_act, c90_old)
s_new = stats(c90_act, c90_new)

print(f"\n  CARB90 (m/s)  n={s_old['n']}")
print(f"  {'':20}  {'R²':>6}  {'MAE':>6}  {'RMSE':>6}  {'Bias':>7}")
print(f"  {'OLD (fixed RE_CONST)':20}  {s_old['r2']:6.3f}  {s_old['mae']:6.3f}  {s_old['rmse']:6.3f}  {s_old['bias']:+7.3f}")
print(f"  {'NEW (economy)':20}  {s_new['r2']:6.3f}  {s_new['mae']:6.3f}  {s_new['rmse']:6.3f}  {s_new['bias']:+7.3f}")

print(f"\n  Per-profile CARB90:")
print(f"  {'Profile':>8}  {'INSCYD':>7}  {'Old pred':>9}  {'Old err':>8}  {'New pred':>9}  {'New err':>8}  {'Δ':>6}")
for r in results:
    if r['gt']['carb90'] is None: continue
    act = r['gt']['carb90']
    eo  = r['c90_old'] - act
    en  = r['c90_new'] - act
    flag = ' ⚠' if not r['hierarchy_ok'] else ''
    print(f"  {r['pid']:>8}{flag:2}  {act:>7.3f}  {r['c90_old']:>9.3f}  {eo:>+8.3f}  "
          f"{r['c90_new']:>9.3f}  {en:>+8.3f}  {en-eo:>+6.3f}")

# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{SEP}")
print("  SECTION 4 — SUBSTRATE OLD vs NEW at MLSS PACE")
print(SEP)

print(f"\n  {'Profile':>8}  {'VO2max':>7}  "
      f"{'Old kcal/h':>11}  {'New kcal/h':>11}  {'Δkcal/h':>8}  "
      f"{'Old CHO':>8}  {'New CHO':>8}  {'ΔCHO':>7}")
print(f"  {'-'*8}  {'-'*7}  {'-'*11}  {'-'*11}  {'-'*8}  {'-'*8}  {'-'*8}  {'-'*7}")
for r in results:
    old = r['sub_mlss_old']; new = r['sub_mlss_new']
    de = new['energy'] - old['energy']
    dc = new['cho_gh'] - old['cho_gh']
    flag = ' ⚠' if not r['hierarchy_ok'] else ''
    print(f"  {r['pid']:>8}{flag:2}  {r['vo2']:>7.1f}  "
          f"{old['energy']:>11.0f}  {new['energy']:>11.0f}  {de:>+8.0f}  "
          f"{old['cho_gh']:>8.1f}  {new['cho_gh']:>8.1f}  {dc:>+7.1f}")

# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{SEP}")
print("  SECTION 5 — CHO DEMAND SANITY CHECK (HM = 85% MLSS, representative)")
print(SEP)

print(f"\n  CHO at Half-Marathon representative pace (85% MLSS):")
print(f"\n  {'Profile':>8}  {'VO2max':>7}  {'MLSS':>6}  {'HM pace':>9}  "
      f"{'Old CHO':>8}  {'New CHO':>8}  {'ΔCHO':>7}  {'Eco@HM':>8}")
print(f"  {'-'*8}  {'-'*7}  {'-'*6}  {'-'*9}  {'-'*8}  {'-'*8}  {'-'*7}  {'-'*8}")
for r in results:
    hm_v = r['mlss'] * 0.85
    old = r['sub_hm_old']; new = r['sub_hm_new']
    dc  = new['cho_gh'] - old['cho_gh']
    eco_hm = adjust_economy(r['base_eco'], hm_v, r['mlss'])
    flag = ' ⚠' if not r['hierarchy_ok'] else ''
    print(f"  {r['pid']:>8}{flag:2}  {r['vo2']:>7.1f}  {r['mlss']:>6.3f}  {pace_str(hm_v):>9}  "
          f"{old['cho_gh']:>8.1f}  {new['cho_gh']:>8.1f}  {dc:>+7.1f}  {eco_hm:>8.1f}")

# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{SEP}")
print("  SECTION 6 — HIGH-SPEED BEHAVIOUR (S180 = 3-min, S360 = vVO2max proxy)")
print(SEP)

print(f"\n  At S360 (vVO2max proxy):")
print(f"  {'Profile':>8}  {'VO2max':>7}  {'S360':>6}  {'x=S360/MLSS':>12}  "
      f"{'Eco':>7}  {'Old kcal':>9}  {'New kcal':>9}  {'Δkcal':>7}")
print(f"  {'-'*8}  {'-'*7}  {'-'*6}  {'-'*12}  {'-'*7}  {'-'*9}  {'-'*9}  {'-'*7}")
for r in results:
    x = r['s360'] / r['mlss']
    old = r['sub_s360_old']; new = r['sub_s360_new']
    de  = new['energy'] - old['energy']
    eco = adjust_economy(r['base_eco'], r['s360'], r['mlss'])
    flag = ' ⚠' if not r['hierarchy_ok'] else ''
    print(f"  {r['pid']:>8}{flag:2}  {r['vo2']:>7.1f}  {r['s360']:>6.3f}  {x:>12.3f}  "
          f"{eco:>7.1f}  {old['energy']:>9.0f}  {new['energy']:>9.0f}  {de:>+7.0f}")

print(f"\n  At S180 (3-min test speed, x=S180/MLSS typically 1.3–1.5):")
print(f"  {'Profile':>8}  {'VO2max':>7}  {'S180':>6}  {'x=S180/MLSS':>12}  "
      f"{'Eco':>7}  {'Old CHO':>8}  {'New CHO':>8}  {'ΔCHO':>7}")
print(f"  {'-'*8}  {'-'*7}  {'-'*6}  {'-'*12}  {'-'*7}  {'-'*8}  {'-'*8}  {'-'*7}")
for r in results:
    x = r['s180'] / r['mlss']
    old = r['sub_s180_old']; new = r['sub_s180_new']
    dc  = new['cho_gh'] - old['cho_gh']
    eco = adjust_economy(r['base_eco'], r['s180'], r['mlss'])
    flag = ' ⚠' if not r['hierarchy_ok'] else ''
    print(f"  {r['pid']:>8}{flag:2}  {r['vo2']:>7.1f}  {r['s180']:>6.3f}  {x:>12.3f}  "
          f"{eco:>7.1f}  {old['cho_gh']:>8.1f}  {new['cho_gh']:>8.1f}  {dc:>+7.1f}")

# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{SEP}")
print("  SECTION 7 — ENERGY DELTA SUMMARY (kcal/h, averaged across all athletes)")
print(SEP)

def mean_delta(field, sub_key, speed_key):
    deltas = [r[f'sub_{speed_key}_new'][field] - r[f'sub_{speed_key}_old'][field]
              for r in results]
    return float(np.mean(deltas)), float(np.std(deltas)), float(np.min(deltas)), float(np.max(deltas))

for speed_label, speed_key in [('MLSS pace', 'mlss'), ('HM pace (85% MLSS)', 'hm'), ('S360 (vVO2max)', 's360')]:
    m, s, lo, hi = mean_delta('energy', 'energy', speed_key)
    mc, sc, loc, hic = mean_delta('cho_gh', 'cho_gh', speed_key)
    print(f"\n  {speed_label}:")
    print(f"    Energy Δ:  mean={m:+.0f}  SD={s:.0f}  range=[{lo:+.0f}, {hi:+.0f}] kcal/h")
    print(f"    CHO Δ:     mean={mc:+.1f}  SD={sc:.1f}  range=[{loc:+.1f}, {hic:+.1f}] g/h")

# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{SEP}")
print("  SECTION 8 — OUTLIER ANALYSIS")
print(SEP)

cho_deltas_hm = [(r['pid'], r['vo2'],
                  r['sub_hm_new']['cho_gh'] - r['sub_hm_old']['cho_gh'],
                  r['base_eco']) for r in results]
cho_deltas_hm.sort(key=lambda x: x[2])
print(f"\n  CHO delta at HM pace (new − old), sorted:")
print(f"  {'Profile':>8}  {'VO2max':>7}  {'ΔCHO g/h':>10}  {'Base eco':>10}")
for pid, vo2, dc, eco in cho_deltas_hm:
    flag = '  ← largest decrease' if dc == min(x[2] for x in cho_deltas_hm) else (
           '  ← largest increase' if dc == max(x[2] for x in cho_deltas_hm) else '')
    print(f"  {pid:>8}  {vo2:>7.1f}  {dc:>+10.1f}  {eco:>10.1f}{flag}")

# Check for implausibly low/high CHO
print(f"\n  Athletes with new CHO at HM > 120 g/h (potential overestimate):")
high = [(r['pid'], r['vo2'], r['sub_hm_new']['cho_gh']) for r in results
        if r['sub_hm_new']['cho_gh'] > 120]
print(f"  {high or 'none'}")
print(f"\n  Athletes with new CHO at HM < 15 g/h (potential underestimate):")
low = [(r['pid'], r['vo2'], r['sub_hm_new']['cho_gh']) for r in results
       if r['sub_hm_new']['cho_gh'] < 15]
print(f"  {low or 'none'}")

# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{SEP}")
print("  SECTION 9 — RECOMMENDATION LAYER CHECK (Half Marathon)")
print(SEP)

SHORT_CAP = 60  # Half Marathon is SHORT bucket

def recommended_hm(required):
    if required <= 30: return 30
    if required <= 60: return round(required)
    return 60

print(f"\n  {'Profile':>8}  {'VO2max':>7}  {'Old raw':>8}  {'Old rec':>8}  "
      f"{'New raw':>8}  {'New rec':>8}  {'Δ raw':>7}  {'Δ rec':>7}")
print(f"  {'-'*8}  {'-'*7}  {'-'*8}  {'-'*8}  {'-'*8}  {'-'*8}  {'-'*7}  {'-'*7}")
for r in results:
    old_raw = r['sub_hm_old']['cho_gh']
    new_raw = r['sub_hm_new']['cho_gh']
    old_rec = recommended_hm(old_raw)
    new_rec = recommended_hm(new_raw)
    flag = ' ⚠' if not r['hierarchy_ok'] else ''
    print(f"  {r['pid']:>8}{flag:2}  {r['vo2']:>7.1f}  {old_raw:>8.1f}  {old_rec:>8}  "
          f"{new_raw:>8.1f}  {new_rec:>8}  {new_raw-old_raw:>+7.1f}  {new_rec-old_rec:>+7}")

rec_changes = sum(1 for r in results
                  if recommended_hm(r['sub_hm_new']['cho_gh']) !=
                     recommended_hm(r['sub_hm_old']['cho_gh']))
print(f"\n  Profiles where recommended intake changed: {rec_changes}/{len(results)}")
print(f"  Max recommended for any athlete (new model): "
      f"{max(recommended_hm(r['sub_hm_new']['cho_gh']) for r in results)} g/h")

# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{SEP}")
print("  SECTION 10 — FINAL ASSESSMENT")
print(SEP)

# Economy range
eco_min = min(ecos); eco_max = max(ecos); eco_mean = np.mean(ecos)
vo2_range = [min(r['vo2'] for r in results), max(r['vo2'] for r in results)]

# CARB90 comparison
mae_delta_c90 = s_new['mae'] - s_old['mae']
bias_delta_c90 = s_new['bias'] - s_old['bias']

# CHO range new vs old at HM
cho_new_hm = [r['sub_hm_new']['cho_gh'] for r in results]
cho_old_hm = [r['sub_hm_old']['cho_gh'] for r in results]

print(f"""
  Economy individualisation:
    VO2max range: {vo2_range[0]:.1f}–{vo2_range[1]:.1f} mL/kg/min
    Economy range: {eco_min:.1f}–{eco_max:.1f} mL/kg/km  (mean {eco_mean:.1f})
    Δ from fixed 203.7:  {eco_min-203.7:+.1f} to {eco_max-203.7:+.1f} mL/kg/km
    → Economy scale is ±{max(abs(eco_min-203.7), abs(eco_max-203.7)):.0f} mL/kg/km
      vs the fixed 203.7 reference.

  Energy impact at HM pace:
    Old CHO range: {min(cho_old_hm):.0f}–{max(cho_old_hm):.0f} g/h  (mean {np.mean(cho_old_hm):.0f})
    New CHO range: {min(cho_new_hm):.0f}–{max(cho_new_hm):.0f} g/h  (mean {np.mean(cho_new_hm):.0f})
    Mean shift: {np.mean(cho_new_hm)-np.mean(cho_old_hm):+.1f} g/h

  CARB90 shift:
    OLD MAE={s_old['mae']:.3f}  Bias={s_old['bias']:+.3f}
    NEW MAE={s_new['mae']:.3f}  Bias={s_new['bias']:+.3f}
    ΔMAE={mae_delta_c90:+.3f}  ΔBias={bias_delta_c90:+.3f}
    {'→ CARB90 improved' if s_new['mae'] < s_old['mae'] else '→ CARB90 slightly worsened'}
""")

# ══════════════════════════════════════════════════════════════════════════════
# Plots
# ══════════════════════════════════════════════════════════════════════════════

if HAS_MATPLOTLIB:
    fig, axes = plt.subplots(2, 3, figsize=(15, 10))
    fig.suptitle('Running Economy v2.5 Validation', fontsize=14, fontweight='bold')

    vo2s   = [r['vo2'] for r in results]
    eco_b  = [r['base_eco'] for r in results]
    cho_o  = [r['sub_hm_old']['cho_gh'] for r in results]
    cho_n  = [r['sub_hm_new']['cho_gh'] for r in results]
    ee_o   = [r['sub_mlss_old']['energy'] for r in results]
    ee_n   = [r['sub_mlss_new']['energy'] for r in results]
    c90_a  = [r['gt']['carb90'] for r in results if r['gt']['carb90']]
    c90_o2 = [r['c90_old'] for r in results if r['gt']['carb90']]
    c90_n2 = [r['c90_new'] for r in results if r['gt']['carb90']]

    # 1. Economy vs VO2max
    ax = axes[0, 0]
    ax.scatter(vo2s, eco_b, color='steelblue', s=60, zorder=5)
    ax.axhline(203.7, color='gray', linestyle='--', alpha=0.6, label='Fixed 203.7')
    vo2_line = np.linspace(min(vo2s)-2, max(vo2s)+2, 100)
    eco_line = [estimate_base_economy(v) for v in vo2_line]
    ax.plot(vo2_line, eco_line, 'b-', alpha=0.4, label='Economy curve')
    ax.set_xlabel('Predicted VO2max (mL/kg/min)'); ax.set_ylabel('Base Economy (mL/kg/km)')
    ax.set_title('Economy vs VO2max'); ax.legend(fontsize=8); ax.grid(alpha=0.3)

    # 2. CHO demand at HM — old vs new
    ax = axes[0, 1]
    ax.scatter(vo2s, cho_o, color='gray', s=50, alpha=0.7, label='OLD (fixed)', marker='s')
    ax.scatter(vo2s, cho_n, color='steelblue', s=50, alpha=0.7, label='NEW (economy)')
    for v, co, cn in zip(vo2s, cho_o, cho_n):
        ax.plot([v, v], [co, cn], 'k-', alpha=0.2, linewidth=0.8)
    ax.set_xlabel('Predicted VO2max (mL/kg/min)'); ax.set_ylabel('CHO g/h at HM pace')
    ax.set_title('CHO demand at 85% MLSS (HM proxy)'); ax.legend(fontsize=8); ax.grid(alpha=0.3)

    # 3. Energy at MLSS — old vs new
    ax = axes[0, 2]
    ax.scatter(vo2s, ee_o, color='gray', s=50, alpha=0.7, label='OLD', marker='s')
    ax.scatter(vo2s, ee_n, color='steelblue', s=50, alpha=0.7, label='NEW')
    for v, eo, en in zip(vo2s, ee_o, ee_n):
        ax.plot([v, v], [eo, en], 'k-', alpha=0.2, linewidth=0.8)
    ax.set_xlabel('Predicted VO2max (mL/kg/min)'); ax.set_ylabel('Energy at MLSS (kcal/h)')
    ax.set_title('Energy at MLSS pace: OLD vs NEW'); ax.legend(fontsize=8); ax.grid(alpha=0.3)

    # 4. CARB90 old pred vs actual
    ax = axes[1, 0]
    lims = [min(c90_a)-0.1, max(c90_a)+0.1]
    ax.scatter(c90_a, c90_o2, color='gray', s=60, alpha=0.8, label='OLD', marker='s')
    ax.scatter(c90_a, c90_n2, color='steelblue', s=60, alpha=0.8, label='NEW')
    ax.plot(lims, lims, 'k--', alpha=0.4, label='y=x')
    ax.set_xlabel('INSCYD CARB90 (m/s)'); ax.set_ylabel('Predicted CARB90 (m/s)')
    ax.set_title(f'CARB90: OLD MAE={s_old["mae"]:.3f}  NEW MAE={s_new["mae"]:.3f}')
    ax.legend(fontsize=8); ax.grid(alpha=0.3)

    # 5. Economy modifier at different x values
    ax = axes[1, 1]
    x_range = np.linspace(0.5, 1.4, 200)
    for base, label, col in [(188, 'VO2max 80+ (188)', '#1a6b1a'),
                              (202, 'VO2max 62 (202)',  'steelblue'),
                              (216, 'VO2max 43 (216)',  '#b03030'),
                              (203.7, 'Fixed (203.7)', 'gray')]:
        # Use a nominal MLSS=4.0 for illustration
        if base == 203.7:
            eco_vals = [203.7 for x in x_range]
        else:
            eco_vals = [adjust_economy(base, x*4.0, 4.0) for x in x_range]
        ax.plot(x_range, eco_vals, label=label,
                color=col, linewidth=1.5 if base != 203.7 else 1, linestyle='--' if base == 203.7 else '-')
    ax.axvline(0.85, color='#aaa', linestyle=':', alpha=0.6)
    ax.axvline(1.00, color='#aaa', linestyle=':', alpha=0.6, label='x=0.85, 1.00, 1.15')
    ax.axvline(1.15, color='#aaa', linestyle=':', alpha=0.6)
    ax.set_xlabel('Speed / MLSS (x)'); ax.set_ylabel('Economy (mL/kg/km)')
    ax.set_title('Speed-economy modifier by VO2max group'); ax.legend(fontsize=7); ax.grid(alpha=0.3)

    # 6. VO2max predicted vs actual
    ax = axes[1, 2]
    gt_vo2 = [r['gt']['vo2'] for r in results if r['gt']['vo2']]
    pred_vo2 = [r['vo2'] for r in results if r['gt']['vo2']]
    lims = [min(gt_vo2)-2, max(gt_vo2)+2]
    ax.scatter(gt_vo2, pred_vo2, color='steelblue', s=60)
    ax.plot(lims, lims, 'k--', alpha=0.4)
    sv = stats(gt_vo2, pred_vo2)
    ax.set_xlabel('INSCYD VO2max (mL/kg/min)'); ax.set_ylabel('Predicted VO2max (mL/kg/min)')
    ax.set_title(f'VO2max: R²={sv["r2"]:.3f}  MAE={sv["mae"]:.2f}  Bias={sv["bias"]:+.2f}')
    ax.grid(alpha=0.3)

    plt.tight_layout()
    out_fig = Path(__file__).parent / 'validation_economy_v25_plots.png'
    plt.savefig(out_fig, dpi=120, bbox_inches='tight')
    print(f"\n  Plots saved: {out_fig.name}")
else:
    print("\n  matplotlib not available — plots skipped")

print(f"\n{SEP}\n  DONE\n{SEP}")
