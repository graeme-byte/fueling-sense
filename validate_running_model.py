"""
validate_running_model.py
─────────────────────────────────────────────────────────────────────────────
Validates FuelingSense running metabolic model against INSCYD ground truth.

SOURCE OF TRUTH: running_metabolic_model_spec_v2_app_safe.md
All equations and coefficients are locked — no refitting performed.

Outputs:
  running_validation_results.csv
  running_validation_plots.png
  running_validation_summary.md
─────────────────────────────────────────────────────────────────────────────
"""

import csv
import math
import statistics
import sys
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec

# ── Locked model constants (spec §7) ─────────────────────────────────────────

RE_CONST  = 12.22   # mL O2 / kg / km
O2_KCAL   = 5.0     # kcal / L O2
FAT_KCAL  = 9.3     # kcal / g fat
CHO_KCAL  = 4.1     # kcal / g carbohydrate

# ── Utility ───────────────────────────────────────────────────────────────────

def clamp(v, lo, hi):
    return max(lo, min(hi, v))

def sigmoid(x):
    return 1.0 / (1.0 + math.exp(-x))

def pace_to_ms(pace_str):
    """Parse 'MM:SS' or 'M:SS' → m/s. Returns None if blank."""
    if not pace_str or pace_str.strip() == '':
        return None
    parts = pace_str.strip().split(':')
    if len(parts) != 2:
        return None
    try:
        sec_per_km = int(parts[0]) * 60 + int(parts[1])
        return 1000.0 / sec_per_km if sec_per_km > 0 else None
    except ValueError:
        return None

# ── Locked running model equations (spec §9, §10) ────────────────────────────

def calc_vo2max(s360):
    return clamp(11.5472 * s360 + 5.5136, 20, 85)

def calc_vlamax(s20, s180, s360):
    raw = 0.0708 * s20 + 0.2785 * s180 - 0.3400 * s360 - 0.0745
    return clamp(raw, 0.05, 0.80)

def calc_mlss(vo2max, vlamax):
    raw = 0.1052 * vo2max - 1.4138 * vlamax - 1.8479
    return clamp(raw, 1.0, 7.0)

def calc_lt1(vo2max, vlamax, mlss):
    lnvla = math.log(0.55 / vlamax)
    frac_raw = 0.4273 + 0.0982 * lnvla + 0.2241 * (vo2max / 50)
    frac = clamp(frac_raw, 0.35, 0.90)
    lt1 = frac * mlss
    if lt1 >= mlss:
        lt1 = 0.70 * mlss
    return lt1

def calc_fatmax(vo2max, vlamax, mlss):
    lnvla = math.log(0.55 / vlamax)
    xf_raw = 0.1124 + 0.1131 * lnvla + 0.4073 * (vo2max / 50)
    xf = clamp(xf_raw, 0.25, 0.80)
    return xf * mlss

def calc_mfo_kcal_h(mlss, vlamax, mass):
    mlss_kcal_h = mlss * RE_CONST * (60 / 1000) * O2_KCAL * mass
    base = max(0.0, 0.057224 * mlss_kcal_h - (0.3842 * vlamax - 0.0149) * mass)
    vla_norm = clamp((0.55 - vlamax) / 0.25, -1, 1)
    fat_scale = 1 + 0.06 * vla_norm
    mfo_g_h = base * fat_scale
    return mfo_g_h * FAT_KCAL

def fcho(vn, vlamax):
    return sigmoid(-5.3519 + 5.6460 * vn + 5.9029 * vlamax - 3.7934 * vn * vlamax)

def substrate_at_speed(v, vo2max, vlamax, mlss, mass):
    vn = v / mlss
    energy = v * RE_CONST * (60 / 1000) * O2_KCAL * mass
    cho_frac = fcho(vn, vlamax)
    cho_g_h = (cho_frac * energy) / CHO_KCAL
    fat_g_h = ((1 - cho_frac) * energy) / FAT_KCAL
    return cho_g_h, fat_g_h

def detect_carb90(vo2max, vlamax, mlss, mass):
    v_max = mlss * 1.15
    step  = 0.01
    speeds = []
    v = 0.5
    while v <= v_max + 1e-9:
        speeds.append(v)
        v += step

    cho_series = [substrate_at_speed(v, vo2max, vlamax, mlss, mass)[0] for v in speeds]

    # Forward monotone clamp (spec §10g)
    for i in range(1, len(cho_series)):
        if cho_series[i] < cho_series[i - 1]:
            cho_series[i] = cho_series[i - 1]

    for i in range(len(cho_series) - 1):
        if cho_series[i] < 90 and cho_series[i + 1] >= 90:
            interp = speeds[i] + ((90 - cho_series[i]) * (speeds[i+1] - speeds[i])) \
                                  / (cho_series[i+1] - cho_series[i])
            return interp

    return v_max   # threshold not reached within range

# ── Statistics ────────────────────────────────────────────────────────────────

def r_squared(actuals, preds):
    a = np.array(actuals)
    p = np.array(preds)
    ss_res = np.sum((a - p) ** 2)
    ss_tot = np.sum((a - np.mean(a)) ** 2)
    if ss_tot == 0:
        return float('nan')
    return 1 - ss_res / ss_tot

def mae(actuals, preds):
    return float(np.mean(np.abs(np.array(actuals) - np.array(preds))))

def rmse(actuals, preds):
    return float(np.sqrt(np.mean((np.array(actuals) - np.array(preds)) ** 2)))

def bias(actuals, preds):
    return float(np.mean(np.array(preds) - np.array(actuals)))

# ── Load CSV ──────────────────────────────────────────────────────────────────

data_path = Path(__file__).parent / 'running_inscyd_profile_dataset.csv'
rows = []

with open(data_path, newline='', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    for row in reader:
        if row['profile'].strip():
            rows.append(row)

print(f"Loaded {len(rows)} profiles from {data_path.name}")

# ── Validation loop ───────────────────────────────────────────────────────────

metrics = ['vo2max', 'vlamax', 'mlss', 'lt1', 'fatmax', 'mfo', 'carb90']

metric_labels = {
    'vo2max':  'VO2max (mL/kg/min)',
    'vlamax':  'VLamax (mmol/L/s)',
    'mlss':    'MLSS (m/s)',
    'lt1':     'LT1 (m/s)',
    'fatmax':  'FATmax speed (m/s)',
    'mfo':     'MFO (kcal/h)',
    'carb90':  'CARB90 (m/s)',
}

results = []          # per-profile per-metric rows
hierarchy_flags = []  # profiles with input hierarchy issues

for row in rows:
    profile = row['profile'].strip()

    # ── Inputs ───────────────────────────────────────────────────────────────
    try:
        mass   = float(row['body_mass_kg'])
        bf_pct = float(row['body_fat_pct'])
        s20    = float(row['input_speed_20s_m_s'])
        s180   = float(row['input_speed_180s_m_s'])
        s360   = float(row['input_speed_360s_m_s'])
    except (ValueError, KeyError) as e:
        print(f"  SKIP {profile}: missing input — {e}")
        continue

    # ── Hierarchy check ───────────────────────────────────────────────────────
    hier_ok = (s20 > s180 > s360) and (3.0 <= s20 <= 12.0) and (1.0 <= s360 <= 7.5)
    if not hier_ok:
        issues = []
        if s20 <= s180:
            issues.append(f"S20({s20}) ≤ S180({s180})")
        if s180 <= s360:
            issues.append(f"S180({s180}) ≤ S360({s360})")
        if s20 < 3.0 or s20 > 12.0:
            issues.append(f"S20({s20}) out of [3,12]")
        if s360 < 1.0 or s360 > 7.5:
            issues.append(f"S360({s360}) out of [1,7.5]")
        hierarchy_flags.append({'profile': profile, 'issues': '; '.join(issues)})

    # ── Model predictions ─────────────────────────────────────────────────────
    pred_vo2max  = calc_vo2max(s360)
    pred_vlamax  = calc_vlamax(s20, s180, s360)
    pred_mlss    = calc_mlss(pred_vo2max, pred_vlamax)
    pred_lt1     = calc_lt1(pred_vo2max, pred_vlamax, pred_mlss)
    pred_fatmax  = calc_fatmax(pred_vo2max, pred_vlamax, pred_mlss)
    pred_mfo     = calc_mfo_kcal_h(pred_mlss, pred_vlamax, mass)
    pred_carb90  = detect_carb90(pred_vo2max, pred_vlamax, pred_mlss, mass)

    preds = {
        'vo2max': pred_vo2max,
        'vlamax': pred_vlamax,
        'mlss':   pred_mlss,
        'lt1':    pred_lt1,
        'fatmax': pred_fatmax,
        'mfo':    pred_mfo,
        'carb90': pred_carb90,
    }

    # ── INSCYD ground truth ───────────────────────────────────────────────────
    def f(col):
        v = row.get(col, '').strip()
        return float(v) if v else None

    inscyd_fatmax_ms = pace_to_ms(row.get('fatmax_pace_min_sec_per_km', '').strip())

    actuals = {
        'vo2max': f('inscyd_vo2max_relative_ml_kg_min'),
        'vlamax': f('inscyd_vlamax_mmol_l_s'),
        'mlss':   f('mlss_speed_m_s'),
        'lt1':    f('lt1_speed_m_s'),
        'fatmax': inscyd_fatmax_ms,
        'mfo':    f('mfo_absolute_kcal_h'),
        'carb90': f('carbmax_speed_m_s'),
    }

    for metric in metrics:
        pred   = preds[metric]
        actual = actuals[metric]

        if actual is None:
            err = pct_err = None
        else:
            err     = pred - actual
            pct_err = (err / actual * 100) if actual != 0 else None

        results.append({
            'profile':       profile,
            'metric':        metric,
            'predicted':     pred,
            'inscyd':        actual,
            'error':         err,
            'abs_error':     abs(err) if err is not None else None,
            'pct_error':     pct_err,
            'hierarchy_ok':  hier_ok,
        })

# ── Per-metric statistics ─────────────────────────────────────────────────────

print(f"\n{'='*70}")
print("PER-METRIC VALIDATION STATISTICS")
print(f"{'='*70}")

metric_stats = {}
for metric in metrics:
    metric_rows = [r for r in results if r['metric'] == metric and r['inscyd'] is not None]
    preds_m   = [r['predicted'] for r in metric_rows]
    actuals_m = [r['inscyd']    for r in metric_rows]

    if len(actuals_m) < 2:
        print(f"  {metric_labels[metric]}: insufficient data (n={len(actuals_m)})")
        continue

    r2   = r_squared(actuals_m, preds_m)
    mae_ = mae(actuals_m, preds_m)
    rmse_= rmse(actuals_m, preds_m)
    bias_= bias(actuals_m, preds_m)
    n    = len(actuals_m)

    metric_stats[metric] = {'r2': r2, 'mae': mae_, 'rmse': rmse_, 'bias': bias_, 'n': n}

    label = metric_labels[metric]
    print(f"\n  {label} (n={n})")
    print(f"    R²    = {r2:.4f}")
    print(f"    MAE   = {mae_:.4f}")
    print(f"    RMSE  = {rmse_:.4f}")
    print(f"    Bias  = {bias_:+.4f}")

# ── Hierarchy summary ─────────────────────────────────────────────────────────

print(f"\n{'='*70}")
print(f"HIERARCHY FLAGS ({len(hierarchy_flags)} profiles)")
print(f"{'='*70}")
if hierarchy_flags:
    for hf in hierarchy_flags:
        print(f"  {hf['profile']}: {hf['issues']}")
else:
    print("  All profiles pass hierarchy check ✓")

# ── Write validation CSV ──────────────────────────────────────────────────────

csv_out = Path(__file__).parent / 'running_validation_results.csv'
fieldnames = ['profile', 'metric', 'predicted', 'inscyd', 'error', 'abs_error',
              'pct_error', 'hierarchy_ok']

with open(csv_out, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    for r in results:
        row_out = {}
        for k in fieldnames:
            v = r[k]
            if isinstance(v, float):
                row_out[k] = f'{v:.4f}'
            elif v is None:
                row_out[k] = ''
            else:
                row_out[k] = v
        writer.writerow(row_out)

print(f"\nWrote {csv_out.name}")

# ── Scatter plots ─────────────────────────────────────────────────────────────

plot_metrics = [m for m in metrics if m in metric_stats]
ncols = 4
nrows = math.ceil(len(plot_metrics) / ncols)

fig = plt.figure(figsize=(5 * ncols, 4.5 * nrows))
fig.suptitle('FuelingSense Running Model — Predicted vs INSCYD Ground Truth\n'
             f'(n per plot as labelled | all profiles | no outlier removal)',
             fontsize=11, y=0.98)

colors = {'vo2max': '#3b82f6', 'vlamax': '#f97316', 'mlss': '#10b981',
          'lt1': '#8b5cf6', 'fatmax': '#f59e0b', 'mfo': '#ef4444', 'carb90': '#0284c7'}

for idx, metric in enumerate(plot_metrics):
    ax = fig.add_subplot(nrows, ncols, idx + 1)

    metric_rows = [r for r in results if r['metric'] == metric and r['inscyd'] is not None]
    preds_m   = np.array([r['predicted'] for r in metric_rows])
    actuals_m = np.array([r['inscyd']    for r in metric_rows])
    profiles  = [r['profile'] for r in metric_rows]

    color = colors.get(metric, '#6b7280')
    stats = metric_stats[metric]

    # Scatter
    ax.scatter(actuals_m, preds_m, color=color, alpha=0.75, s=55, zorder=3,
               edgecolors='white', linewidths=0.5)

    # Identity line
    lo = min(actuals_m.min(), preds_m.min()) * 0.95
    hi = max(actuals_m.max(), preds_m.max()) * 1.05
    ax.plot([lo, hi], [lo, hi], 'k--', linewidth=1, alpha=0.5, label='Identity')

    # Annotate a few outliers
    errors = np.abs(preds_m - actuals_m)
    top3 = np.argsort(errors)[-3:]
    for i in top3:
        ax.annotate(profiles[i], (actuals_m[i], preds_m[i]),
                    fontsize=6, alpha=0.7,
                    xytext=(3, 3), textcoords='offset points')

    ax.set_xlabel('INSCYD', fontsize=8)
    ax.set_ylabel('Predicted', fontsize=8)
    ax.set_title(metric_labels[metric], fontsize=9, fontweight='bold')
    ax.tick_params(labelsize=7)
    ax.set_aspect('equal', adjustable='box')
    ax.set_xlim(lo, hi)
    ax.set_ylim(lo, hi)
    ax.grid(True, alpha=0.3, linestyle=':')

    stats_text = (f"R²={stats['r2']:.3f}\n"
                  f"MAE={stats['mae']:.3f}\n"
                  f"RMSE={stats['rmse']:.3f}\n"
                  f"Bias={stats['bias']:+.3f}\n"
                  f"n={stats['n']}")
    ax.text(0.04, 0.96, stats_text, transform=ax.transAxes,
            fontsize=7, verticalalignment='top',
            bbox=dict(boxstyle='round,pad=0.3', facecolor='white', alpha=0.8))

# Hide unused subplots
for idx in range(len(plot_metrics), nrows * ncols):
    fig.add_subplot(nrows, ncols, idx + 1).set_visible(False)

plt.tight_layout(rect=[0, 0, 1, 0.96])
plot_out = Path(__file__).parent / 'running_validation_plots.png'
plt.savefig(plot_out, dpi=150, bbox_inches='tight')
plt.close()
print(f"Wrote {plot_out.name}")

# ── Markdown summary ──────────────────────────────────────────────────────────

md_lines = [
    "# Running Model Validation — FuelingSense v2.0",
    "",
    f"**Dataset:** `running_inscyd_profile_dataset.csv` — {len(rows)} profiles",
    "**Model spec:** `running_metabolic_model_spec_v2_app_safe.md`",
    "**Calibration date:** 28.04.2026",
    "**Note:** No refitting. No outlier removal. Equations locked.",
    "",
    "---",
    "",
    "## 1. Input Hierarchy",
    "",
]

if hierarchy_flags:
    md_lines.append(f"**{len(hierarchy_flags)} profile(s) have hierarchy violations** "
                    f"(S20 > S180 > S360 not satisfied or speed out of range).")
    md_lines.append("")
    md_lines.append("| Profile | Issue |")
    md_lines.append("|---|---|")
    for hf in hierarchy_flags:
        md_lines.append(f"| {hf['profile']} | {hf['issues']} |")
else:
    md_lines.append("All profiles satisfy S20 > S180 > S360 and speed range requirements. ✓")

md_lines += [
    "",
    "---",
    "",
    "## 2. Per-Metric Statistics",
    "",
    "| Metric | n | R² | MAE | RMSE | Bias |",
    "|---|---|---|---|---|---|",
]

for metric in metrics:
    if metric not in metric_stats:
        continue
    s = metric_stats[metric]
    label = metric_labels[metric]
    md_lines.append(
        f"| {label} | {s['n']} | {s['r2']:.3f} | {s['mae']:.3f} | {s['rmse']:.3f} | {s['bias']:+.3f} |"
    )

md_lines += [
    "",
    "---",
    "",
    "## 3. Profile-by-Profile Table",
    "",
]

for metric in metrics:
    md_lines.append(f"### {metric_labels[metric]}")
    md_lines.append("")
    md_lines.append("| Profile | Predicted | INSCYD | Error | Abs Error | % Error |")
    md_lines.append("|---|---|---|---|---|---|")

    metric_rows = [r for r in results if r['metric'] == metric]
    for r in metric_rows:
        pred   = f"{r['predicted']:.3f}" if r['predicted'] is not None else "—"
        ins    = f"{r['inscyd']:.3f}"    if r['inscyd']    is not None else "—"
        err    = f"{r['error']:+.3f}"    if r['error']     is not None else "—"
        aerr   = f"{r['abs_error']:.3f}" if r['abs_error'] is not None else "—"
        pct    = f"{r['pct_error']:+.1f}%" if r['pct_error'] is not None else "—"
        hier   = "" if r['hierarchy_ok'] else " ⚠"
        md_lines.append(f"| {r['profile']}{hier} | {pred} | {ins} | {err} | {aerr} | {pct} |")

    md_lines.append("")

md_lines += [
    "---",
    "",
    "## 4. Interpretation Notes",
    "",
    "### VO2max",
    "VO2max is predicted from S360 alone via a linear equation calibrated on 8 INSCYD virtual profiles.",
    "A positive bias means the model over-predicts VO2max relative to INSCYD.",
    "",
    "### VLamax",
    "VLamax uses a three-speed model. Known systematic offset of ~+0.15 vs INSCYD for low-VLamax profiles",
    "(see spec §17.1 — discrepancy documented as internal inconsistency between spec §9 equations and §17 reference values).",
    "",
    "### MLSS",
    "MLSS error propagates from both VO2max and VLamax errors. Depends on the sign of those errors.",
    "",
    "### LT1",
    "LT1 is derived from MLSS × fraction (itself driven by VLamax and VO2max). Error compounds.",
    "",
    "### FATmax",
    "FATmax is the most sensitive metric — small shifts in VLamax and VO2max move xf substantially.",
    "",
    "### MFO",
    "MFO depends on MLSS speed × mass × RE_CONST. Running economy is fixed at 12.22 mL O2/kg/km.",
    "Variability in real running economy across athletes is a known source of MFO error.",
    "",
    "### CARB90",
    "CARB90 uses the dense CHO scan (0.01 m/s resolution). Where CARB90 was not reached within",
    "1.15×MLSS, the model returns vMax = 1.15×MLSS. Compare against `carbmax_speed_m_s` from INSCYD.",
    "",
    "---",
    "",
    f"*Generated by `validate_running_model.py` — validation only, no recalibration.*",
]

md_out = Path(__file__).parent / 'running_validation_summary.md'
with open(md_out, 'w', encoding='utf-8') as f:
    f.write('\n'.join(md_lines) + '\n')

print(f"Wrote {md_out.name}")
print(f"\n{'='*70}")
print("DONE")
