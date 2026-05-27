# Fueling Sense Model — Technical Validation Report

**Generated:** 20 April 2026 (auto-generated from current engine equations)
**Dataset:** INSCYD_DATASET.csv — 39 athlete records processed (1 high-power outlier excluded)
**Model version:** FuelingSense v0.6 (metabolicModelV06.ts + fuelingEngine.ts)
**Reference:** INSCYD laboratory outputs (measured, not modelled)

---

## 1. Model Equations (Current)

All equations ported verbatim from TypeScript to Python.

### VLamax
```
ffmKg = weightKg × (1 − bodyFatPct/100)   [clamped BF 3–50, FFM ≥ 1]
VLamax = 0.054126 × (P20 / ffmKg) − 0.118864   [clamped 0.05–1.20]
```

### VO2max
```
VO2max = 12.3563 × (P300 / weightKg) − 0.4508   [clamped 20–85]
```

### MLSS
```
MLSS = P300 × 0.9129 × exp(−0.4021 × VLamax)   [clamped 50–min(P300×0.99, 600)]
```

### LT1
```
LT1 = MLSS × (0.8016 − 0.154 × VLamax) + 3.26   [clamped 30–(MLSS−1)]
If raw LT1 ≥ MLSS: LT1 = MLSS × 0.70
```

### FATmax g/h (G6 formula)
```
vlaN = clamp(VLamax, 0.10, 1.50)
vlamaxNorm = clamp((0.55 − vlaN) / 0.25, −1, 1)
fatmaxBase = max(0, 0.2094×MLSS − (0.3132×vlaN + 0.0256)×weight)
fatScale = 1 + 0.06 × vlamaxNorm
FATmax_g_h = fatmaxBase × fatScale
```

### FATmax W
```
xf = clamp(0.70 + 0.08×ln(0.55/vlaN), 0.45, 0.85)   [Standard diet]
FATmax_W = xf × MLSS
```

## 2. Dataset Summary

| Parameter | N | Min | Max | Mean |
|---|---|---|---|---|
| Weight (kg) | 39 | 53.6 | 102.0 | 77.5 |
| Body fat (%) | 39 | 6.0 | 26.4 | 14.9 |
| INSCYD VLamax (mmol/L/s) | 39 | 0.15 | 0.68 | 0.40 |
| INSCYD VO2max (ml/kg/min) | 39 | 31.9 | 58.0 | 47.2 |
| INSCYD MLSS (W) | 39 | 143 | 292 | 230 |

P300 method breakdown: {'aero1+aero2': 8, 'aero1+aero3': 30, 'aero1_direct': 1}

**Outlier excluded:** Alvaro Martin (INSCYD MLSS = 353 W) — more than 60 W above the next-highest MLSS in the dataset; excluded from all validation statistics.

## 3. Validation Results

| Metric | N | R² | MAE | Bias | RMSE | LOOCV R² | LOOCV MAE | HO R² | HO MAE |
|---|---|---|---|---|---|---|---|---|---|
| VLamax (mmol/L/s) | 39 | 0.941 | 0.02 | -0.00 | 0.03 | 0.941 | 0.02 | 0.763 | 0.02 |
| VO2max (ml/kg/min) | 39 | 0.963 | 1.03 | 0.01 | 1.29 | 0.963 | 1.03 | 0.823 | 1.16 |
| MLSS (W) | 39 | 0.935 | 7.57 | 1.15 | 10.39 | 0.935 | 7.57 | 0.868 | 8.48 |
| LT1 (W) | 30 | 0.916 | 6.11 | 0.91 | 8.17 | 0.916 | 6.11 | 0.396 | 7.63 |
| FATmax g/h | 39 | 0.795 | 2.53 | 1.46 | 3.17 | 0.795 | 2.53 | 0.833 | 1.95 |
| CARB90 W | 39 | 0.776 | 8.67 | 7.95 | 10.56 | 0.776 | 8.67 | 0.735 | 7.75 |

### LT1 Note
Nine records excluded (INSCYD LT1 = 50 W placeholder). n = 30 for LT1 validation.

## 4. VLamax Sensitivity Analysis

Fixed: VO2max=55, MLSS=270W, weight=75kg, body_fat=12%

| VLamax | FATmax g/h | CARB90 W | CHO@MLSS g/h | Fat@MLSS g/h |
|---|---|---|---|---|
| 0.15 | 54.2 | 232 | 225.2 | 7.2 |
| 0.25 | 51.7 | 224 | 229.8 | 5.2 |
| 0.35 | 48.6 | 218 | 232.9 | 3.8 |
| 0.45 | 45.1 | 212 | 235.9 | 2.5 |
| 0.55 | 41.7 | 205 | 238.4 | 1.4 |
| 0.65 | 38.4 | 198 | 240.3 | 0.6 |
| 0.75 | 35.2 | 190 | 241.4 | 0.1 |

---
*This report was auto-generated on 20 April 2026 from the current production engine.*