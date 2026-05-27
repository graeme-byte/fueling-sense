"""
validate_run_v23_vo2_v24.py
─────────────────────────────────────────────────────────────────────────────
Validates the RUN metabolic model v2.3 (with VO2max v2.4 update) against
INSCYD ground truth using C0 profile rows only.

T/Taguchi rows are excluded from all validation metrics.

Source of truth: claude_run_model_v23_vo2_v24_implementation_prompt.md
                 running_metabolic_model_v2_3_candidate.md
"""

import csv
import math
from pathlib import Path

import numpy as np

# ── Constants ─────────────────────────────────────────────────────────────────

RE_CONST = 12.22   # mL O2 / kg / km
O2_KCAL  = 5.0     # kcal / L O2
FAT_KCAL = 9.3     # kcal / g fat
CHO_KCAL = 4.1     # kcal / g carbohydrate

# VO2max v2.4 — aerobic-reserve equation
VO2_INTERCEPT_24    = -11.373079
VO2_COEF_S360_24    =  14.311395
VO2_COEF_RESERVE_24 =   5.054782

# VLamax v2.2 component decomposition
PCR_FRAC_BASE    = 0.838411
PCR_FRAC_SLOPE   = -0.204144
PCR_FFM_REF      = 66
AEROBIC_PROXY_COEF = 0.872091
VLA_POWER_COEF   = 0.005731
VLA_POWER_EXP    = 2.617584
VLA_MIN, VLA_MAX = 0.05, 0.90

# MLSS v2.3
MLSS_INTERCEPT_23 = -1.39219
MLSS_COEF_S180_23 =  0.52459
MLSS_COEF_S360_23 =  0.71862
MLSS_COEF_VLA_23  = -2.02976

# LT1 v2.3
LT1_INTERCEPT_23 = -1.35596
LT1_COEF_S180_23 =  0.45336
LT1_COEF_S360_23 =  0.61183
LT1_COEF_VLA_23  = -2.42501

# FATmax position (v2.0-compatible, uses updated VO2max)
XF_BASE       = 0.1124
XF_COEF_LNVLA = 0.1131
XF_COEF_VO2N  = 0.4073

# MFO
MFO_BASE_COEF    = 0.057224
MFO_VLA_COEF     = 0.3842
MFO_VLA_OFFSET   = 0.0149
MFO_VLA_NORM_REF = 0.55
MFO_SCALE_RANGE  = 0.25
MFO_SCALE_FACTOR = 0.06

# CHO sigmoid (fat-primary substrate architecture)
CHO_SIG_CONST  = -5.3519
CHO_SIG_VN     =  5.6460
CHO_SIG_VLA    =  5.9029
CHO_SIG_VN_VLA = -3.7934

# ── Helpers ───────────────────────────────────────────────────────────────────

def clamp(v, lo, hi): return max(lo, min(hi, v))
def sig(x): return 1.0 / (1.0 + math.exp(-x))
def power_from_speed(v, mass): return v * RE_CONST * (60/1000) * O2_KCAL * mass * 1.163

# ── Equations ─────────────────────────────────────────────────────────────────

def calc_vo2max(s180, s360):
    aerobic_reserve = s180 - s360
    return clamp(VO2_INTERCEPT_24 + VO2_COEF_S360_24 * s360 + VO2_COEF_RESERVE_24 * aerobic_reserve, 20, 85)

def calc_vlamax(s20, s180, mass, ffm):
    p20  = power_from_speed(s20,  mass)
    p180 = power_from_speed(s180, mass)
    pcr_frac = PCR_FRAC_BASE + PCR_FRAC_SLOPE * ((ffm - PCR_FFM_REF) / PCR_FFM_REF)
    glyco = max(p20 - pcr_frac * (p20 - p180) - AEROBIC_PROXY_COEF * p180, 1e-6)
    return clamp(VLA_POWER_COEF * math.pow(glyco / ffm, VLA_POWER_EXP), VLA_MIN, VLA_MAX)

def calc_mlss(s180, s360, vlamax):
    return clamp(MLSS_INTERCEPT_23 + MLSS_COEF_S180_23*s180 + MLSS_COEF_S360_23*s360 + MLSS_COEF_VLA_23*vlamax, 1.0, 7.0)

def calc_lt1(s180, s360, vlamax, mlss):
    return clamp(LT1_INTERCEPT_23 + LT1_COEF_S180_23*s180 + LT1_COEF_S360_23*s360 + LT1_COEF_VLA_23*vlamax, 0.5, mlss*0.95)

def calc_fatmax(vo2max, vlamax, mlss):
    lnvla = math.log(MFO_VLA_NORM_REF / vlamax)
    xf = clamp(XF_BASE + XF_COEF_LNVLA * lnvla + XF_COEF_VO2N * (vo2max / 50), 0.25, 0.80)
    return xf * mlss, xf

def calc_mfo(mlss, vlamax, mass):
    mlss_kcal_h = mlss * RE_CONST * (60/1000) * O2_KCAL * mass
    base = max(0, MFO_BASE_COEF * mlss_kcal_h - (MFO_VLA_COEF * vlamax - MFO_VLA_OFFSET) * mass)
    vla_norm = clamp((MFO_VLA_NORM_REF - vlamax) / MFO_SCALE_RANGE, -1, 1)
    mfo_g = base * (1 + MFO_SCALE_FACTOR * vla_norm)
    return mfo_g, mfo_g * FAT_KCAL

def fat_oxidation_at_speed(v, vlamax, mlss, mass):
    """Fat-primary: fat = (1-fCHO) × totalEE. CARB90 derived as total − fat."""
    ee = v * RE_CONST * (60/1000) * O2_KCAL * mass
    vn = v / mlss
    cho_frac = sig(CHO_SIG_CONST + CHO_SIG_VN*vn + CHO_SIG_VLA*vlamax + CHO_SIG_VN_VLA*vn*vlamax)
    return (1 - cho_frac) * ee

def detect_carb90(vlamax, mlss, mass):
    vmin, vmax, step = 0.5, mlss * 1.15, 0.01
    prev_v, prev_cho = vmin, 0.0
    v = vmin
    while v <= vmax + 1e-9:
        ee     = v * RE_CONST * (60/1000) * O2_KCAL * mass
        fat_kc = fat_oxidation_at_speed(v, vlamax, mlss, mass)
        cho_gh = max(0, ee - fat_kc) / CHO_KCAL
        if prev_cho < 90 and cho_gh >= 90:
            return prev_v + (90 - prev_cho) * (v - prev_v) / (cho_gh - prev_cho)
        prev_v, prev_cho = v, cho_gh
        v += step
    return vmax

def compute_profile(row):
    def f(k): v = row.get(k,'').strip(); return float(v) if v else None
    mass = f('body_mass_kg'); bf = f('body_fat_pct')
    s20  = f('input_speed_20s_m_s'); s180 = f('input_speed_180s_m_s'); s360 = f('input_speed_360s_m_s')
    if any(v is None for v in [mass, bf, s20, s180, s360]): return None

    ffm    = mass * (1 - bf / 100)
    vo2    = calc_vo2max(s180, s360)
    vla    = calc_vlamax(s20, s180, mass, ffm)
    mlss   = calc_mlss(s180, s360, vla)
    lt1    = calc_lt1(s180, s360, vla, mlss)
    fatmax_v, xf = calc_fatmax(vo2, vla, mlss)
    mfo_g, mfo_k = calc_mfo(mlss, vla, mass)
    carb90 = detect_carb90(vla, mlss, mass)
    return {'vo2': vo2, 'vla': vla, 'mlss': mlss, 'lt1': lt1,
            'fatmax': fatmax_v, 'mfo_g': mfo_g, 'mfo_k': mfo_k, 'carb90': carb90}

# ── Statistics ────────────────────────────────────────────────────────────────

def stats(acts, preds):
    a, p = np.array(acts), np.array(preds)
    ss_res = np.sum((a-p)**2); ss_tot = np.sum((a-np.mean(a))**2)
    return {
        'n': len(a),
        'r2':   float(1 - ss_res/ss_tot) if ss_tot > 0 else float('nan'),
        'mae':  float(np.mean(np.abs(a-p))),
        'rmse': float(np.sqrt(np.mean((a-p)**2))),
        'bias': float(np.mean(p-a)),
    }

# ── Load data — C0 rows only (exclude any T / Taguchi rows) ──────────────────

data_path = Path(__file__).parent / 'running_inscyd_profile_dataset.csv'
rows = []
skipped_T = []

with open(data_path, newline='', encoding='utf-8-sig') as f:
    for row in csv.DictReader(f):
        profile = row.get('profile','').strip()
        if profile.upper().startswith('T'):
            skipped_T.append(profile)    # Taguchi row — excluded
        else:
            rows.append(row)

print(f"Loaded {len(rows)} C0 rows  (excluded {len(skipped_T)} T/Taguchi rows: {skipped_T or 'none'})")

# ── Validation ────────────────────────────────────────────────────────────────

metric_keys = {'vo2': 'inscyd_vo2max_relative_ml_kg_min',
               'vla': 'inscyd_vlamax_mmol_l_s',
               'mlss': 'mlss_speed_m_s',
               'lt1':  'lt1_speed_m_s',
               'mfo_g': 'mfo_absolute_kcal_h',   # note: comparing predicted g/h vs kcal/h separately below
               'fatmax': None}  # derived from fatmax_pace

FATMAX_PACE_COL = 'fatmax_pace_min_sec_per_km'

def pace_to_ms(s):
    if not s or ':' not in s: return None
    parts = s.strip().split(':')
    try:
        sec_km = int(parts[0])*60 + int(parts[1])
        return 1000.0/sec_km if sec_km > 0 else None
    except: return None

preds_by_metric = {k: [] for k in ['vo2','vla','mlss','lt1','fatmax','mfo_g']}
acts_by_metric  = {k: [] for k in ['vo2','vla','mlss','lt1','fatmax','mfo_g']}
out_rows = []

for row in rows:
    pred = compute_profile(row)
    if pred is None: print(f"  SKIP {row.get('profile')}: missing inputs"); continue
    def g(col): v=row.get(col,'').strip(); return float(v) if v else None

    act = {'vo2': g('inscyd_vo2max_relative_ml_kg_min'),
           'vla': g('inscyd_vlamax_mmol_l_s'),
           'mlss': g('mlss_speed_m_s'),
           'lt1':  g('lt1_speed_m_s'),
           'fatmax': pace_to_ms(row.get(FATMAX_PACE_COL,'')),
           'mfo_g': g('mfo_absolute_kcal_h')}   # INSCYD stores MFO as kcal/h

    for k in ['vo2','vla','mlss','lt1','fatmax']:
        if act[k] is not None:
            preds_by_metric[k].append(pred[k if k != 'fatmax' else 'fatmax'])
            acts_by_metric[k].append(act[k])

    # MFO: compare model g/h vs INSCYD kcal/h (convert model to kcal/h for comparison)
    if act['mfo_g'] is not None:
        preds_by_metric['mfo_g'].append(pred['mfo_k'])  # model kcal/h
        acts_by_metric['mfo_g'].append(act['mfo_g'])     # INSCYD kcal/h

    out_rows.append({
        'profile': row.get('profile'),
        'pred_vo2': f"{pred['vo2']:.3f}", 'act_vo2': f"{act['vo2']:.3f}" if act['vo2'] else '',
        'pred_vla': f"{pred['vla']:.4f}", 'act_vla': f"{act['vla']:.4f}" if act['vla'] else '',
        'pred_mlss': f"{pred['mlss']:.3f}", 'act_mlss': f"{act['mlss']:.3f}" if act['mlss'] else '',
        'pred_lt1': f"{pred['lt1']:.3f}",  'act_lt1':  f"{act['lt1']:.3f}"  if act['lt1'] else '',
        'pred_fatmax': f"{pred['fatmax']:.3f}", 'act_fatmax': f"{act['fatmax']:.3f}" if act['fatmax'] else '',
        'pred_mfo_kcalh': f"{pred['mfo_k']:.1f}", 'pred_mfo_gh': f"{pred['mfo_g']:.2f}",
        'act_mfo_kcalh': f"{act['mfo_g']:.1f}" if act['mfo_g'] else '',
    })

# ── Print results ─────────────────────────────────────────────────────────────

expected = {
    'vla':    {'r2': 0.998, 'mae': 0.006, 'rmse': 0.008, 'bias': 0.000},
    'vo2':    {'r2': 0.992, 'mae': 1.011, 'rmse': 1.254, 'bias': 0.000},
    'mlss':   {'r2': 0.995, 'mae': 0.066, 'rmse': 0.087, 'bias': 0.000},
    'lt1':    {'r2': 0.992, 'mae': 0.070, 'rmse': 0.094, 'bias': 0.000},
    'fatmax': {'r2': 0.988, 'mae': 0.103, 'rmse': 0.121, 'bias': 0.064},
    'mfo_g':  {'r2': 0.951, 'mae': None,  'rmse': None,  'bias': None},
}

labels = {
    'vla': 'VLamax (mmol/L/s)', 'vo2': 'VO2max (ml/kg/min)',
    'mlss': 'MLSS (m/s)',        'lt1': 'LT1 (m/s)',
    'fatmax': 'FATmax speed (m/s)', 'mfo_g': 'MFO (kcal/h — model vs INSCYD)',
}

print(f"\n{'='*72}")
print("RUN v2.3 + VO2max v2.4 — VALIDATION RESULTS (C0 rows only)")
print(f"{'='*72}")

for k, label in labels.items():
    p, a = preds_by_metric[k], acts_by_metric[k]
    if len(a) < 2: continue
    s = stats(a, p)
    exp = expected.get(k, {})
    print(f"\n  {label} (n={s['n']})")
    print(f"    R²    = {s['r2']:.3f}   expected ≈ {exp.get('r2', '?')}")
    print(f"    MAE   = {s['mae']:.3f}   expected ≈ {exp.get('mae', '?')}")
    print(f"    RMSE  = {s['rmse']:.3f}   expected ≈ {exp.get('rmse', '?')}")
    print(f"    Bias  = {s['bias']:+.3f}   expected ≈ {exp.get('bias', '?')}")

# ── Write CSVs ────────────────────────────────────────────────────────────────

import csv as csv_mod

out_path = Path(__file__).parent / 'validation_run_v23_vo2_v24.csv'
with open(out_path, 'w', newline='', encoding='utf-8') as f:
    writer = csv_mod.DictWriter(f, fieldnames=list(out_rows[0].keys()))
    writer.writeheader(); writer.writerows(out_rows)

print(f"\nWrote {out_path.name}")
print(f"\n{'='*72}\nDONE")
