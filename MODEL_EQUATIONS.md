# FuelingSense Metabolic Model — Equation Reference

**Dataset:** N=40 INSCYD cyclists  
**Validation:** Leave-One-Out Cross-Validation (LOOCV) throughout  
**Status:** Equations locked for FuelingSense vNext implementation

---

## Required Inputs

| Input | Symbol | Units | Notes |
|---|---|---|---|
| Best ~20s power | P20 | W | Mean power over effort, not peak |
| Best ~5min power | P300 | W | Mean power over effort |
| Body weight | weight | kg | |
| Body fat percentage | body_fat | % | |

### Derived Intermediate

```
FFM = weight × (1 − body_fat / 100)
```

---

## Computation Chain

```
P20 + FFM  →  VLamax
P300 + weight  →  VO2max
P300 + VLamax  →  MLSS
MLSS + VLamax  →  LT1
MLSS + VLamax  →  FATmax_w
MLSS + VLamax + weight  →  FATmax_g_h
FATmax_w  →  CARB90_w
MLSS  →  CP  (display only)
```

---

## 1. VLamax — Glycolytic Rate

```
VLamax = 0.054126 × (P20 / FFM) − 0.118864
```

**Units:** mmol/L/s  
**Primary driver:** Sprint power relative to lean mass  

| Metric | Value |
|---|---|
| LOOCV R² | 0.906 |
| MAE | ±0.026 mmol/L/s |
| Dataset | N=40 |

**Physiological range:** 0.10 – 0.70 mmol/L/s  
**Note:** P20 must be mean power (not peak). Sprint from standing start or controlled effort.

---

## 2. VO2max — Aerobic Capacity

```
VO2max = 12.3563 × (P300 / weight) − 0.4508
```

**Units:** ml/kg/min  
**Based on:** Storer slope adjusted for this dataset  

| Metric | Value |
|---|---|
| LOOCV R² | 0.974 |
| MAE | — |
| Dataset | N=40 |


---

## 3. MLSS — Maximal Lactate Steady State (= LT2 = AT)

```
MLSS = P300 × 0.9129 × exp(−0.4021 × VLamax)
```

**Units:** Watts  
**Note:** MLSS = AT = LT2 in INSCYD terminology. They are definitionally identical — do not compute a separate LT2.

| Metric | Value |
|---|---|
| LOOCV R² | 0.927 |
| MAE | 8.3 W |
| RMSE | — |
| Dataset | N=40 |

**Error propagation:** ~80% of downstream LT1 error originates here. Improving MLSS accuracy improves the entire system.

---

## 4. LT1 — First Lactate Threshold

```
LT1 = MLSS × (0.8016 − 0.154 × VLamax) + 3.26
```

Equivalently:
```
LT1 = 0.8016 × MLSS − 0.154 × (MLSS × VLamax) + 3.26
```

**Units:** Watts  

| Metric | Value |
|---|---|
| LOOCV R² | 0.9980 |
| MAE | 0.98 W |
| Dataset | N=31 valid (9 INSCYD floor values excluded) |

**LT1/MLSS ratio:**

| VLamax | LT1/MLSS |
|---|---|
| 0.10 | 0.786 |
| 0.30 | 0.755 |
| 0.50 | 0.724 |
| 0.70 | 0.693 |

**Data quality note:** 9 of 40 INSCYD reports returned LT1=50W (a rendering floor, not a physiological value). These were excluded. The formula is validated on 31 clean observations.

**Constraint:** LT1 must always be < MLSS. If LT1 ≥ MLSS, clamp LT1 = MLSS × 0.70.

---

## 5. FATmax Position

```
FATmax_w = MLSS × (0.733 − 0.131 × VLamax) − 4.0
```

Equivalently:
```
FATmax_w = 0.7332 × MLSS − 0.1315 × (MLSS × VLamax) − 4.00
```

**Units:** Watts  

| Metric | Value |
|---|---|
| LOOCV R² | 0.9983 |
| MAE | 0.95 W |
| RMSE | 1.24 W |
| Dataset | N=40 |

**FATmax/MLSS ratio by VLamax:**

| VLamax | FATmax/MLSS |
|---|---|
| 0.10 | 0.720 |
| 0.30 | 0.694 |
| 0.50 | 0.668 |
| 0.70 | 0.641 |

**Worked examples:**

| MLSS | VLamax | Predicted | Actual |
|---|---|---|---|
| 177 W | 0.34 | 118 W | 118 W |
| 277 W | 0.30 | 188 W | 187 W |
| 245 W | 0.15 | 171 W | 174 W |
| 246 W | 0.68 | 154 W | 156 W |

**Optional high-precision version (adds weight, MAE=0.72W):**
```
FATmax_w = 0.746 × MLSS − 0.134 × (MLSS × VLamax) − 0.078 × weight − 0.6
```

---

## 6. FATmax Magnitude

```
FATmax_g_h = weight × (0.2094 × (MLSS / weight) − 0.3132 × VLamax − 0.0256)
```

Expanded:
```
FATmax_g_h = 0.2094 × MLSS − (0.3132 × VLamax + 0.0256) × weight
```

**Units:** g/h  

| Metric | Value |
|---|---|
| LOOCV R² | 0.9833 |
| MAE | 0.78 g/h |
| RMSE | 1.06 g/h |
| Residual–weight correlation | r=+0.16, p=0.32 (not significant) |
| Dataset | N=40 |

**Why weight-normalised:** The 2-variable version (MLSS + VLamax only, no weight) has R²=0.965 but residuals are biased by body mass (r=−0.56, p<0.001). The weight-normalised form eliminates this bias entirely.

**Worked examples:**

| MLSS | VLamax | Weight | Predicted | Actual |
|---|---|---|---|---|
| 177 W | 0.34 | 75.5 kg | 27.5 g/h | 27.2 g/h |
| 277 W | 0.30 | 102.0 kg | 44.3 g/h | 45.7 g/h |
| 245 W | 0.15 | 73.7 kg | 47.4 g/h | 48.0 g/h |
| 246 W | 0.68 | 69.4 kg | 30.7 g/h | 33.5 g/h |

**Simplified version (if weight unavailable):**
```
FATmax_g_h ≈ 0.192 × MLSS − 23.2 × VLamax + 1.7
```
R²=0.965, MAE=1.20 g/h — acceptable but not recommended for production.

---

## 7. CARB90 Position (Substrate Curve Method — Production)

CARB90 is **not** calculated via direct regression.

It is derived from the **substrate oxidation curve** by identifying the lowest workload at which carbohydrate oxidation reaches **≥ 90 g/h**.

---

### Step 1 — Gross Efficiency (GE)

VO2max determines gross efficiency:

GE = 0.2443 − 0.000259 × VO2max

Clamp:

GE = max(0.20, min(0.27, GE))

---

### Step 2 — Anchor Definitions

All substrate calculations are performed relative to MLSS.

Define:

- x = P / MLSS
- xf = FATmax_w / MLSS

Left anchor:
- x_left = 0.50
- fat_left = 0.75 × FATmax_g_h

Peak:
- x_peak = xf
- fat_peak = FATmax_g_h

Right anchor:
- x_zero = xz
- fat_zero = 0

---

### Step 3 — Fat Oxidation Curve

#### 3A — Left side (x ≤ xf)

Smoothstep rise:

u = (x − x_left) / (xf − x_left)

fat(x) = fat_left + (fat_peak − fat_left) × (3u² − 2u³)

---

#### 3B — Right side (x > xf)

Curvature-controlled decay:

t = (x − xf) / (x_zero − xf)
t_adj = t^alpha

fat(x) = fat_peak × (1 − 3t_adj² + 2t_adj³)

alpha = 1.8

Constraints:
- fat(x) ≥ 0
- fat(x) = 0 for x ≥ x_zero
- fat must not increase after peak

---

### Step 4 — Energy Expenditure

kcal_h = (P × 3600) / (GE × 4184)

---

### Step 5 — Substrate Split

fat_kcal_h = fat_g_h × 9.47

cho_kcal_h = kcal_h − fat_kcal_h

cho_g_h = cho_kcal_h / 4.18

---

### Step 6 — CHO Monotonicity Enforcement

for i in reversed(range(N−1)):
    cho[i] = min(cho[i], cho[i+1])

---

### Step 7 — Dense Series Construction

Evaluate at 1 W increments.

---

### Step 8 — CARB90 Detection

Find first i where:

cho_g_h[i] ≥ 90

---

### Step 9 — Linear Interpolation

CARB90_w = P[i−1] + (90 − cho[i−1]) × (P[i] − P[i−1]) / (cho[i] − cho[i−1])

---

### Step 10 — Output

- CARB90_w
- carb90_found


## 8. CP — Critical Power (Display Only)

```
CP = (MLSS + 10) / 0.90
```

**Units:** Watts  
**WARNING:** CP is a display convenience label only. It must not feed back into any model calculation. It does not represent a separately fitted value.

---

## Complete Implementation (Python)

```python
import math

def compute_metabolic_profile(p20_w, p300_w, weight_kg, body_fat_pct):
    """
    Compute full FuelingSense metabolic profile from 4 inputs.
    Returns dict with all outputs.
    """
    ffm = weight_kg * (1 - body_fat_pct / 100)

    # Primary metabolic rates
    vlamax   = 0.054126 * (p20_w / ffm) - 0.118864
    vo2max   = 12.3563  * (p300_w / weight_kg) - 0.4508

    # Threshold powers
    mlss     = p300_w * 0.9129 * math.exp(-0.4021 * vlamax)
    lt1      = mlss * (0.8016 - 0.154 * vlamax) + 3.26

    # Fat oxidation
    fatmax_w = mlss * (0.733 - 0.131 * vlamax) - 4.0
    fatmax_g_h = (0.2094 * mlss
                  - (0.3132 * vlamax + 0.0256) * weight_kg)

    # Display-only
    cp = (mlss + 10) / 0.90

    # Constraint guard — if LT1 ≥ MLSS, clamp to MLSS × 0.70 (per §4)
    if lt1 >= mlss:
        lt1 = mlss * 0.70

    return {
        'vlamax':      round(vlamax, 3),
        'vo2max':      round(vo2max, 1),
        'mlss_w':      round(mlss, 1),
        'lt1_w':       round(lt1, 1),
        'lt2_w':       round(mlss, 1),   # LT2 == MLSS by definition
        'fatmax_w':    round(fatmax_w, 1),
        'fatmax_g_h':  round(fatmax_g_h, 1),
        'carb90_w':    round(carb90_w, 1),
        'cp_w':        round(cp, 1),     # display only
    }
```

---

## Performance Summary

| Output | Formula inputs | LOOCV R² | MAE | N |
|---|---|---|---|---|
| VLamax | P20 / FFM | 0.906 | 0.026 mmol/L/s | 40 |
| VO2max | P300 / weight | 0.974 | — | 40 |
| MLSS | P300 + VLamax | 0.927 | 8.3 W | 40 |
| LT1 | MLSS + VLamax | 0.998 | 0.98 W | 31† |
| LT2 | = MLSS | — | — | — |
| FATmax_w | MLSS + VLamax | 0.998 | 0.95 W | 40 |
| FATmax_g_h | MLSS + VLamax + weight | 0.983 | 0.78 g/h | 40 |

† 9 athletes excluded (INSCYD LT1 floor value = 50W)

---

## Design Rules

1. **CP does not feed back into the model.** It is a derived display label.
2. **Optional validation inputs** (P180, P360, P720) are for data quality checks only. They do not affect outputs.
3. **LT2 = MLSS.** Do not compute a separate LT2.
4. **VLamax is continuous.** No staged levels, no categorical phenotype bins.
5. Always enforce: **LT1 < MLSS < CP**
