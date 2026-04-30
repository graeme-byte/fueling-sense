# FuelingSense Bike Equations — v2.3 Candidate

## Purpose

This file defines the proposed updated BIKE metabolic model chain after remodelling:

- VLamax
- P300 reconstruction
- VO2max
- MLSS / LT2
- LT1
- FATmax position
- FATmax magnitude

This version uses a physiology-first decomposition approach for BIKE VLamax, then carries that value through the downstream model.

---

# 1. Shared Helpers

```ts
function clamp(value: number, lower: number, upper: number): number {
  return Math.max(lower, Math.min(upper, value));
}
```

---

# 2. Required Inputs

```ts
weightKg: number;
bodyFatPct: number;

pSprintWatts: number;
pSprintDurationSec: number;

pAero1Watts: number;       // approximately 180 s effort
pAero1DurationSec: number;

pAero2Watts?: number;      // approximately 360 s effort
pAero2DurationSec?: number;

pAero3Watts?: number;      // approximately 720 s effort
pAero3DurationSec?: number;
```

---

# 3. Fat-Free Mass

```ts
const bodyFatClamped =
  clamp(bodyFatPct, 3, 50);

const FFM =
  Math.max(
    weightKg * (1 - bodyFatClamped / 100),
    1
  );
```

Units:

```text
kg
```

---

# 4. BIKE VLamax — v2.3 Component Decomposition

## 4.1 Sprint-Duration Normalisation

The INSCYD bike dataset contains sprint efforts from roughly 12 to 24 seconds. These are normalised to a 20-second equivalent sprint power.

```ts
const P20eq =
  pSprintWatts *
  Math.pow(pSprintDurationSec / 20, 0.1765);
```

Units:

```text
W
```

---

## 4.2 Aerobic Anchor

```ts
const P180 = pAero1Watts;
```

Units:

```text
W
```

---

## 4.3 PCr / Neuromuscular Fraction

```ts
const pcrFractionRaw =
  0.5546 +
  0.0999 * ((FFM - 66) / 66);

const pcrFraction =
  clamp(pcrFractionRaw, 0.40, 0.70);
```

Interpretation:

```text
The PCr / neuromuscular fraction estimates how much of the sprint-aerobic gap is likely explained by short-duration non-glycolytic contribution.
```

---

## 4.4 PCr / Neuromuscular Proxy

```ts
const pcrProxy =
  pcrFraction * (P20eq - P180);
```

Units:

```text
W
```

---

## 4.5 Aerobic-Supported Proxy

```ts
const aerobicProxy =
  0.7615 * P180;
```

Units:

```text
W
```

Interpretation:

```text
This is a fitted aerobic-supported sprint-power proxy. It should not be interpreted as the literal aerobic energy contribution during a 20-second sprint.
```

---

## 4.6 Glycolytic Proxy

```ts
const glycolyticProxy =
  P20eq - pcrProxy - aerobicProxy;

const glycolyticProxySafe =
  Math.max(glycolyticProxy, 1e-6);
```

Units:

```text
W
```

---

## 4.7 VLamax Calculation

```ts
const VLamaxRaw =
  0.1041 *
  Math.pow(glycolyticProxySafe / FFM, 1.1634);

const VLamax =
  clamp(VLamaxRaw, 0.05, 1.20);
```

Units:

```text
mmol/L/s
```

---

# 5. P300 Reconstruction

P300 is the estimated 5-minute power used as the VO2max anchor.

The INSCYD dataset does not always provide a direct 5-minute power, so P300 is reconstructed using the hyperbolic CP + W'/t model.

---

## 5.1 Primary Method

Use aero1 and aero3 when available.

```ts
const P1 = pAero1Watts;
const t1 = pAero1DurationSec;

const P2 = pAero3Watts;
const t2 = pAero3DurationSec;

const WPrime =
  ((P1 - P2) * t1 * t2) / (t2 - t1);

const CP =
  P1 - WPrime / t1;

const P300 =
  CP + WPrime / 300;
```

---

## 5.2 Fallback Method

If aero3 is unavailable, use aero1 and aero2.

```ts
const P1 = pAero1Watts;
const t1 = pAero1DurationSec;

const P2 = pAero2Watts;
const t2 = pAero2DurationSec;

const WPrime =
  ((P1 - P2) * t1 * t2) / (t2 - t1);

const CP =
  P1 - WPrime / t1;

const P300 =
  CP + WPrime / 300;
```

---

## 5.3 Direct Proxy

If only aero1 is available:

```ts
const P300 = pAero1Watts;
```

Units:

```text
W
```

---

# 6. VO2max

```ts
const VO2maxRaw =
  VO2max = 12.3563 * (P300 / weightKg) - 0.4508;

const VO2max =
  clamp(VO2maxRaw, 20, 85);
```

Units:

```text
ml/kg/min
```

Note:

```text
VO2max is derived from P300 and body mass.
VO2max is not used as a predictor in the MLSS equation.
```

---

# 7. MLSS / LT2 — v2.3 Refit

Current model candidate:

```ts
const MLSSRaw =
  P300 *
  0.911266 *
  Math.exp(-0.392262 * VLamax);

const MLSS =
  clamp(
    MLSSRaw,
    50,
    Math.min(P300 * 0.99, 600)
  );
```

Units:

```text
W
```

Interpretation:

```text
MLSS is anchored primarily by P300, with higher VLamax reducing the sustainable fraction of P300.
```

Validation summary on current 40-athlete INSCYD bike dataset:

```text
Fit:
R²   = 0.942
MAE  = 7.4 W
RMSE = 10.7 W
Bias = +0.6 W

LOOCV:
R²   = 0.935
MAE  = 7.9 W
RMSE = 11.4 W
Bias = +0.6 W
```

---

# 8. LT1 — v2.3 Refit

Current model candidate:

```ts
const LT1Raw =
  MLSS *
  (0.914238 - 0.179812 * VLamax)
  - 21.014364;

const LT1 =
  clamp(
    LT1Raw,
    30,
    MLSS - 1
  );
```

Units:

```text
W
```

Interpretation:

```text
LT1 is anchored by MLSS. Higher VLamax reduces LT1 as a fraction of MLSS.
```

Validation note:

```text
The INSCYD dataset contains several LT1 values at 50 W. These behave like floor/default values rather than true physiological LT1 values.
For LT1 validation, exclude INSCYD LT1 values <= 60 W unless confirmed as true measured LT1.
```

Validation summary excluding LT1 values <= 60 W:

```text
Fit:
R²   = 0.938
MAE  = 5.6 W
RMSE = 8.0 W
Bias = 0.0 W

LOOCV:
R²   = 0.915
MAE  = 6.3 W
RMSE = 9.3 W
Bias = -0.3 W
```

---

# 9. FATmax Position — v2.3 Refit

Current model candidate:

```ts
const FATmaxWattsRaw =
  MLSS *
  (
    0.734419 +
    0.071120 * Math.log(0.55 / VLamax)
  )
  - 22.786137;

const FATmaxWatts =
  clamp(
    FATmaxWattsRaw,
    30,
    MLSS - 1
  );
```

Units:

```text
W
```

Interpretation:

```text
Higher VLamax shifts FATmax to a lower fraction of MLSS.
Lower VLamax shifts FATmax to a higher fraction of MLSS.
```

Validation summary on current 40-athlete INSCYD bike dataset:

```text
Fit:
R²   = 0.937
MAE  = 4.9 W
RMSE = 7.4 W
Bias = 0.0 W

LOOCV:
R²   = 0.921
MAE  = 5.5 W
RMSE = 8.3 W
Bias = -0.2 W
```

---

# 10. FATmax Magnitude — v2.3 Refit

Current compact production candidate:

```ts
const FATmaxGramsPerHourRaw =
  0.297128 * FATmaxWatts
  - 0.231024 * weightKg * VLamax
  - 1.619044;

const FATmaxGramsPerHour =
  Math.max(FATmaxGramsPerHourRaw, 0);
```

Units:

```text
g/h
```

Interpretation:

```text
Higher FATmax power increases peak fat oxidation magnitude.
Higher body mass × VLamax reduces predicted FATmax magnitude.
```

Validation summary on current 40-athlete INSCYD bike dataset:

```text
Fit:
R²   = 0.878
MAE  = 2.0 g/h
RMSE = 2.9 g/h
Bias = 0.0 g/h

LOOCV:
R²   = 0.847
MAE  = 2.2 g/h
RMSE = 3.2 g/h
Bias = -0.1 g/h
```

---

# 11. Optional Alternative FATmax Magnitude Model

This model performed slightly better statistically but is less compact.

```ts
const FATmaxGramsPerHourRaw =
  0.341401 * FATmaxWatts
  - 15.692409 * VLamax
  - 0.260847 * weightKg
  + 10.851239;

const FATmaxGramsPerHour =
  Math.max(FATmaxGramsPerHourRaw, 0);
```

Validation summary:

```text
LOOCV:
R²   = 0.870
MAE  = 2.16 g/h
RMSE = 2.95 g/h
```

Recommendation:

```text
Use the compact weightKg × VLamax interaction model unless the small statistical improvement is worth the added complexity.
```

---

# 12. Full Calculation Chain

```ts
// 1. FFM
const bodyFatClamped = clamp(bodyFatPct, 3, 50);

const FFM =
  Math.max(
    weightKg * (1 - bodyFatClamped / 100),
    1
  );

// 2. Sprint normalisation
const P20eq =
  pSprintWatts *
  Math.pow(pSprintDurationSec / 20, 0.1765);

// 3. VLamax decomposition
const P180 = pAero1Watts;

const pcrFractionRaw =
  0.5546 +
  0.0999 * ((FFM - 66) / 66);

const pcrFraction =
  clamp(pcrFractionRaw, 0.40, 0.70);

const pcrProxy =
  pcrFraction * (P20eq - P180);

const aerobicProxy =
  0.7615 * P180;

const glycolyticProxy =
  P20eq - pcrProxy - aerobicProxy;

const glycolyticProxySafe =
  Math.max(glycolyticProxy, 1e-6);

const VLamaxRaw =
  0.1041 *
  Math.pow(glycolyticProxySafe / FFM, 1.1634);

const VLamax =
  clamp(VLamaxRaw, 0.05, 1.20);

// 4. P300
// Use aero1+aero3 where available, otherwise aero1+aero2, otherwise aero1 direct.

const WPrime =
  ((P1 - P2) * t1 * t2) / (t2 - t1);

const CP =
  P1 - WPrime / t1;

const P300 =
  CP + WPrime / 300;

// 5. VO2max
const VO2maxRaw =
  12.3563 *
  Math.pow(P300 / weightKg, 0.4508);

const VO2max =
  clamp(VO2maxRaw, 20, 85);

// 6. MLSS / LT2
const MLSSRaw =
  P300 *
  0.911266 *
  Math.exp(-0.392262 * VLamax);

const MLSS =
  clamp(
    MLSSRaw,
    50,
    Math.min(P300 * 0.99, 600)
  );

// 7. LT1
const LT1Raw =
  MLSS *
  (0.914238 - 0.179812 * VLamax)
  - 21.014364;

const LT1 =
  clamp(
    LT1Raw,
    30,
    MLSS - 1
  );

// 8. FATmax position
const FATmaxWattsRaw =
  MLSS *
  (
    0.734419 +
    0.071120 * Math.log(0.55 / VLamax)
  )
  - 22.786137;

const FATmaxWatts =
  clamp(
    FATmaxWattsRaw,
    30,
    MLSS - 1
  );

// 9. FATmax magnitude
const FATmaxGramsPerHourRaw =
  0.297128 * FATmaxWatts
  - 0.231024 * weightKg * VLamax
  - 1.619044;

const FATmaxGramsPerHour =
  Math.max(FATmaxGramsPerHourRaw, 0);
```

---

# 13. Model Governance Notes

```text
This file is a v2.3 candidate specification.

Before production implementation:
1. Update MODEL_EQUATIONS.md.
2. Lock the equation constants.
3. Run full validation report.
4. Run client-facing validation report with equations redacted.
5. Check downstream effects on substrate curves, CARB90, zones and PDF export.
6. Do not silently refit constants in implementation files.
```

---

# 14. Current Recommended Production Candidate Summary

```text
VLamax:
0.1041 × (glycolyticProxySafe / FFM)^1.1634

MLSS:
P300 × 0.911266 × exp(-0.392262 × VLamax)

LT1:
MLSS × (0.914238 - 0.179812 × VLamax) - 21.014364

FATmax position:
MLSS × (0.734419 + 0.071120 × ln(0.55 / VLamax)) - 22.786137

FATmax magnitude:
0.297128 × FATmax_W - 0.231024 × weightKg × VLamax - 1.619044
```
