"""
validate_bike_v23.py
─────────────────────────────────────────────────────────────────────────────
Validates the BIKE v2.3 candidate model against the INSCYD_DATASET.csv ground truth.

All equations ported verbatim from metabolicModelBikeV23.ts.
No refitting. No outlier removal.

Outputs:
  validation_bike_v23.csv
"""

import csv
import math
import sys
from pathlib import Path

import numpy as np

# ── Constants (mirrored exactly from metabolicModelBikeV23.ts) ────────────────

SPRINT_NORM_EXP   = 0.1765
SPRINT_REF_DUR    = 20

PCR_FRAC_INT      = 0.5546
PCR_FRAC_SLOPE    = 0.0999
PCR_FFM_REF       = 66
PCR_FRAC_MIN      = 0.40
PCR_FRAC_MAX      = 0.70

AEROBIC_PROXY_COEF = 0.7615

VLA_COEF  = 0.1041
VLA_EXP   = 1.1634
VLA_MIN   = 0.05
VLA_MAX   = 1.20

VO2_COEF  = 12.3563
VO2_INTCPT = -0.4508
VO2_MIN   = 20
VO2_MAX   = 85

MLSS_SCALE       = 0.911266
MLSS_DECAY       = 0.392262
MLSS_MIN         = 50
MLSS_P_MAX_FRAC  = 0.99
MLSS_ABS_MAX     = 600

LT1_MLSS_COEF = 0.914238
LT1_VLA_COEF  = 0.179812
LT1_INTERCEPT = -21.014364
LT1_MIN       = 30

FMAX_MLSS_A    = 0.734419
FMAX_MLSS_B    = 0.071120
FMAX_VLA_REF   = 0.55
FMAX_INTERCEPT = -22.786137
FMAX_W_MIN     = 30

FMAX_GH_FMAX  = 0.297128
FMAX_GH_WKG   = 0.231024
FMAX_GH_INTCPT = -1.619044

# ── Helpers ───────────────────────────────────────────────────────────────────

def clamp(v, lo, hi):
    return max(lo, min(hi, v))

def cp_model(p1, t1, p2, t2):
    """Returns (cp, w_prime, p300) or None on failure."""
    if t1 == t2 or not all(math.isfinite(x) for x in [p1, t1, p2, t2]):
        return None
    try:
        w_prime = ((p1 - p2) * t1 * t2) / (t2 - t1)
        cp = p1 - w_prime / t1
        p300 = cp + w_prime / 300
        if not math.isfinite(p300) or p300 <= 0:
            return None
        return cp, w_prime, p300
    except ZeroDivisionError:
        return None

def compute_bike_v23(row):
    """Apply v2.3 equations to one CSV row. Returns dict of predictions."""
    def f(col):
        v = row.get(col, '').strip()
        return float(v) if v else None

    weight   = f('weight_kg')
    bf_pct   = f('body_fat_pct')
    p_sprint = f('p_sprint_w')
    t_sprint = f('p_sprint_duration_s')
    p_aero1  = f('p_aero1_w');  t_aero1 = f('p_aero1_duration_s')
    p_aero2  = f('p_aero2_w');  t_aero2 = f('p_aero2_duration_s')
    p_aero3  = f('p_aero3_w');  t_aero3 = f('p_aero3_duration_s')

    if any(v is None for v in [weight, bf_pct, p_sprint, t_sprint, p_aero1, t_aero1]):
        return None

    # FFM
    bf_c = clamp(bf_pct, 3, 50)
    ffm  = max(weight * (1 - bf_c / 100), 1)

    # P20eq
    p20eq = p_sprint * math.pow(t_sprint / SPRINT_REF_DUR, SPRINT_NORM_EXP)

    # P180
    p180 = p_aero1

    # PCr fraction
    pcr_frac = clamp(PCR_FRAC_INT + PCR_FRAC_SLOPE * ((ffm - PCR_FFM_REF) / PCR_FFM_REF),
                     PCR_FRAC_MIN, PCR_FRAC_MAX)

    # Proxies
    pcr_proxy        = pcr_frac * (p20eq - p180)
    aerobic_proxy    = AEROBIC_PROXY_COEF * p180
    glyco_proxy      = p20eq - pcr_proxy - aerobic_proxy
    glyco_proxy_safe = max(glyco_proxy, 1e-6)

    # VLamax
    vlamax = clamp(VLA_COEF * math.pow(glyco_proxy_safe / ffm, VLA_EXP), VLA_MIN, VLA_MAX)

    # P300 reconstruction
    p300 = None
    p300_method = None

    if p_aero3 is not None and t_aero3 is not None and t_aero3 > t_aero1:
        result = cp_model(p_aero1, t_aero1, p_aero3, t_aero3)
        if result and result[2] > 0:
            p300       = clamp(result[2], 50, 800)
            p300_method = 'aero1+aero3'

    if p300 is None and p_aero2 is not None and t_aero2 is not None and t_aero2 > t_aero1:
        result = cp_model(p_aero1, t_aero1, p_aero2, t_aero2)
        if result and result[2] > 0:
            p300       = clamp(result[2], 50, 800)
            p300_method = 'aero1+aero2'

    if p300 is None:
        p300       = p_aero1
        p300_method = 'aero1_direct'

    # VO2max
    vo2max = clamp(VO2_COEF * (p300 / weight) + VO2_INTCPT, VO2_MIN, VO2_MAX)

    # MLSS
    mlss = clamp(p300 * MLSS_SCALE * math.exp(-MLSS_DECAY * vlamax),
                 MLSS_MIN, min(p300 * MLSS_P_MAX_FRAC, MLSS_ABS_MAX))

    # LT1
    lt1_raw = mlss * (LT1_MLSS_COEF - LT1_VLA_COEF * vlamax) + LT1_INTERCEPT
    lt1 = clamp(lt1_raw, LT1_MIN, mlss - 1)

    # FATmax position
    fatmax_w_raw = mlss * (FMAX_MLSS_A + FMAX_MLSS_B * math.log(FMAX_VLA_REF / vlamax)) + FMAX_INTERCEPT
    fatmax_w = clamp(fatmax_w_raw, FMAX_W_MIN, mlss - 1)

    # FATmax magnitude
    fatmax_gh = max(FMAX_GH_FMAX * fatmax_w - FMAX_GH_WKG * weight * vlamax + FMAX_GH_INTCPT, 0)

    return {
        'vlamax': vlamax,
        'vo2max': vo2max,
        'mlss':   mlss,
        'lt1':    lt1,
        'fatmax_w': fatmax_w,
        'fatmax_gh': fatmax_gh,
        'p300': p300,
        'p300_method': p300_method,
        'ffm': ffm,
        'p20eq': p20eq,
    }

# ── Statistics ────────────────────────────────────────────────────────────────

def stats(actuals, preds, label=''):
    a = np.array(actuals)
    p = np.array(preds)
    ss_res = np.sum((a - p) ** 2)
    ss_tot = np.sum((a - np.mean(a)) ** 2)
    r2   = 1 - ss_res / ss_tot if ss_tot > 0 else float('nan')
    mae  = float(np.mean(np.abs(a - p)))
    rmse = float(np.sqrt(np.mean((a - p) ** 2)))
    bias = float(np.mean(p - a))
    return {'r2': r2, 'mae': mae, 'rmse': rmse, 'bias': bias, 'n': len(a), 'label': label}

# ── Load and run ──────────────────────────────────────────────────────────────

data_path = Path(__file__).parent / 'INSCYD_DATASET.csv'
rows = []
with open(data_path, newline='', encoding='utf-8-sig') as f:
    rows = list(csv.DictReader(f))

print(f"Loaded {len(rows)} rows from {data_path.name}")

metrics = {
    'vlamax': {'preds': [], 'actuals': [], 'col': 'inscyd_vlamax'},
    'vo2max': {'preds': [], 'actuals': [], 'col': 'inscyd_vo2max_ml_kg_min'},
    'mlss':   {'preds': [], 'actuals': [], 'col': 'inscyd_mlss_w'},
    'lt1':    {'preds': [], 'actuals': [], 'col': 'inscyd_lt1_w'},
    'lt1_excl_low': {'preds': [], 'actuals': [], 'col': 'inscyd_lt1_w'},
    'fatmax_w':  {'preds': [], 'actuals': [], 'col': 'inscyd_fatmax_w'},
    'fatmax_gh': {'preds': [], 'actuals': [], 'col': 'fatmax_g_h_inscyd'},
}

results_rows = []
p300_methods = {}

for row in rows:
    name = row.get('athlete_name', '').strip()
    pred = compute_bike_v23(row)
    if pred is None:
        print(f"  SKIP {name}: missing inputs")
        continue

    # Count P300 methods
    m = pred['p300_method']
    p300_methods[m] = p300_methods.get(m, 0) + 1

    def g(col):
        v = row.get(col, '').strip()
        return float(v) if v else None

    actuals = {
        'vlamax':   g('inscyd_vlamax'),
        'vo2max':   g('inscyd_vo2max_ml_kg_min'),
        'mlss':     g('inscyd_mlss_w'),
        'lt1':      g('inscyd_lt1_w'),
        'fatmax_w': g('inscyd_fatmax_w'),
        'fatmax_gh': g('fatmax_g_h_inscyd'),
    }

    pred_map = {
        'vlamax':   pred['vlamax'],
        'vo2max':   pred['vo2max'],
        'mlss':     pred['mlss'],
        'lt1':      pred['lt1'],
        'fatmax_w': pred['fatmax_w'],
        'fatmax_gh': pred['fatmax_gh'],
    }

    for key in ['vlamax', 'vo2max', 'mlss', 'lt1', 'fatmax_w', 'fatmax_gh']:
        act = actuals[key]
        p   = pred_map[key]
        if act is not None:
            metrics[key]['preds'].append(p)
            metrics[key]['actuals'].append(act)
            if key == 'lt1' and act > 60:
                metrics['lt1_excl_low']['preds'].append(p)
                metrics['lt1_excl_low']['actuals'].append(act)

    row_result = {
        'athlete': name,
        'p300_method': pred['p300_method'],
        'p300': f"{pred['p300']:.1f}",
        'pred_vlamax': f"{pred['vlamax']:.3f}",
        'act_vlamax':  f"{actuals['vlamax']:.3f}" if actuals['vlamax'] else '',
        'pred_vo2max': f"{pred['vo2max']:.2f}",
        'act_vo2max':  f"{actuals['vo2max']:.2f}" if actuals['vo2max'] else '',
        'pred_mlss':   f"{pred['mlss']:.1f}",
        'act_mlss':    f"{actuals['mlss']:.1f}" if actuals['mlss'] else '',
        'pred_lt1':    f"{pred['lt1']:.1f}",
        'act_lt1':     f"{actuals['lt1']:.1f}" if actuals['lt1'] else '',
        'pred_fatmax_w': f"{pred['fatmax_w']:.1f}",
        'act_fatmax_w':  f"{actuals['fatmax_w']:.1f}" if actuals['fatmax_w'] else '',
        'pred_fatmax_gh': f"{pred['fatmax_gh']:.2f}",
        'act_fatmax_gh':  f"{actuals['fatmax_gh']:.2f}" if actuals['fatmax_gh'] else '',
    }
    results_rows.append(row_result)

# ── Print summary ─────────────────────────────────────────────────────────────

print(f"\nP300 reconstruction methods: {p300_methods}")
print()

metric_labels = {
    'vlamax':        'VLamax (mmol/L/s)',
    'vo2max':        'VO2max (ml/kg/min)',
    'mlss':          'MLSS (W)',
    'lt1':           'LT1 all rows (W)',
    'lt1_excl_low':  'LT1 excl. INSCYD ≤60W (W)',
    'fatmax_w':      'FATmax position (W)',
    'fatmax_gh':     'FATmax magnitude (g/h)',
}

expected = {
    'vlamax':       {'r2': 0.954, 'mae': 0.019, 'rmse': 0.023, 'bias': 0.000},
    'vo2max':       {'r2': 0.971, 'mae': 0.969, 'rmse': 1.201, 'bias': -0.086},
    'mlss':         {'r2': 0.942, 'mae': 7.441, 'rmse': 10.745, 'bias': 0.625},
    'lt1':          {'r2': 0.045, 'mae': 30.915, 'rmse': 58.903, 'bias': 26.605},
    'lt1_excl_low': {'r2': 0.938, 'mae': 5.562, 'rmse': 8.005, 'bias': 0.000},
    'fatmax_w':     {'r2': 0.937, 'mae': 4.921, 'rmse': 7.418, 'bias': 0.000},
    'fatmax_gh':    {'r2': 0.878, 'mae': 2.017, 'rmse': 2.853, 'bias': 0.000},
}

print("=" * 72)
print("BIKE v2.3 CANDIDATE — VALIDATION RESULTS")
print("=" * 72)

all_stats = {}
for key, label in metric_labels.items():
    preds   = metrics[key]['preds']
    actuals = metrics[key]['actuals']
    if len(actuals) < 2:
        print(f"\n  {label}: n={len(actuals)} — insufficient data")
        continue
    s = stats(actuals, preds, label)
    all_stats[key] = s
    exp = expected.get(key, {})

    print(f"\n  {label} (n={s['n']})")
    print(f"    R²    = {s['r2']:.3f}  (expected ≈ {exp.get('r2', '?')})")
    print(f"    MAE   = {s['mae']:.3f}  (expected ≈ {exp.get('mae', '?')})")
    print(f"    RMSE  = {s['rmse']:.3f}  (expected ≈ {exp.get('rmse', '?')})")
    print(f"    Bias  = {s['bias']:+.3f}  (expected ≈ {exp.get('bias', '?')})")

# ── Write CSV ─────────────────────────────────────────────────────────────────

out_path = Path(__file__).parent / 'validation_bike_v23.csv'
if results_rows:
    with open(out_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=list(results_rows[0].keys()))
        writer.writeheader()
        writer.writerows(results_rows)
    print(f"\nWrote {out_path.name}")

print("\n" + "=" * 72)
print("DONE")
