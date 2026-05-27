# Running Metabolic Model — v2.3 Candidate

## Scope

This document defines the running metabolic model from field-test inputs through to core metabolic outputs.

This version uses:

- VO2max from 6-minute speed
- VLamax v2.2 component decomposition
- Re-modelled MLSS and LT1
- CARB90 as a derived output from total energy expenditure minus fat oxidation, not as a directly fitted endpoint

Bike equations are not part of this document and must not be modified from this specification.

---

## Inputs

```ts
S20  = sprintDistanceM / sprintTimeS;  // m/s
S180 = distance3minM / 180;            // m/s
S360 = distance6minM / 360;            // m/s

Mass = bodyMassKg;
BF   = bodyFatPct;
```

---

## Constants

```ts
RE_CONST = 12.22;   // mL O2 / kg / km
O2_KCAL  = 5.0;     // kcal / L O2
FAT_KCAL = 9.3;     // kcal / g fat
CHO_KCAL = 4.1;     // kcal / g carbohydrate
```

---

## Helper Functions

```ts
function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function powerFromSpeed(speedMS: number, massKg: number): number {
  const kcalH =
    speedMS * RE_CONST * (60 / 1000) * O2_KCAL * massKg;

  const watts =
    kcalH * 1.163;

  return watts;
}
```

---

## Derived Inputs

```ts
const FFM =
  Mass * (1 - BF / 100);

const P20 =
  powerFromSpeed(S20, Mass);

const P180 =
  powerFromSpeed(S180, Mass);

const P360 =
  powerFromSpeed(S360, Mass);
```

---

## VO2max

```ts
const VO2max =
  clamp(
    -11.373079
      + 9.256613 * S360
      + 5.054782 * S180,
    20,
    85
  );
```

Units:

```text
mL/kg/min
```

---

## VLamax — v2.2 Component Decomposition

### PCr Fraction

```ts
const pcrFraction =
  0.838411 - 0.204144 * ((FFM - 66) / 66);
```

### PCr / Neuromuscular Proxy

```ts
const pcrProxy =
  pcrFraction * (P20 - P180);
```

### Aerobic-Supported Proxy

```ts
const aerobicProxy =
  0.872091 * P180;
```

### Glycolytic Proxy

```ts
const glycolyticProxy =
  P20 - pcrProxy - aerobicProxy;

const glycolyticProxySafe =
  Math.max(glycolyticProxy, 1e-6);
```

### VLamax Calculation

```ts
const VLamax =
  clamp(
    0.005731 *
      Math.pow(glycolyticProxySafe / FFM, 2.617584),
    0.05,
    0.90
  );
```

Units:

```text
mmol/L/s
```

---

## MLSS

```ts
const MLSS =
  clamp(
    -1.39219
      + 0.52459 * S180
      + 0.71862 * S360
      - 2.02976 * VLamax,
    1.0,
    7.0
  );
```

Units:

```text
m/s
```

---

## LT1

```ts
const LT1 =
  clamp(
    -1.35596
      + 0.45336 * S180
      + 0.61183 * S360
      - 2.42501 * VLamax,
    0.5,
    MLSS * 0.95
  );
```

Units:

```text
m/s
```

---

## FATmax Position

FATmax position still requires re-checking against the v2.3 VLamax and MLSS model.

Temporary v2.0-compatible form:

```ts
const lnVLa =
  Math.log(0.55 / VLamax);

const xf =
  clamp(
    0.1124
      + 0.1131 * lnVLa
      + 0.4073 * (VO2max / 50),
    0.25,
    0.80
  );

const FATmaxSpeed =
  xf * MLSS;
```

Units:

```text
m/s
```

---

## MFO — Maximum Fat Oxidation

Temporary v2.0-compatible form pending revalidation around v2.3 VLamax.

```ts
const MLSS_kcal_h =
  MLSS * RE_CONST * (60 / 1000) * O2_KCAL * Mass;

const fatmaxBase =
  Math.max(
    0,
    0.057224 * MLSS_kcal_h
      - (0.3842 * VLamax - 0.0149) * Mass
  );

const vlaNorm =
  clamp(
    (0.55 - VLamax) / 0.25,
    -1,
    1
  );

const fatScale =
  1 + 0.06 * vlaNorm;

const MFO_g_h =
  fatmaxBase * fatScale;

const MFO_kcal_h =
  MFO_g_h * FAT_KCAL;
```

---

## Fat Oxidation Curve

CARB90 should be derived from total energy expenditure minus fat oxidation.

The fat oxidation curve should therefore be treated as the primary substrate curve, with carbohydrate oxidation calculated residually.

Required relationship:

```ts
TotalEE_kcal_h =
  speedMS * RE_CONST * (60 / 1000) * O2_KCAL * Mass;

Fat_kcal_h =
  fatOxidationAtSpeed(speedMS);

CHO_kcal_h =
  Math.max(0, TotalEE_kcal_h - Fat_kcal_h);

CHO_g_h =
  CHO_kcal_h / CHO_KCAL;
```

---

## CARB90

CARB90 is not to be directly fitted as a standalone endpoint.

It is the first speed where carbohydrate oxidation reaches 90 g/h.

```ts
function detectCARB90(): number {
  const vMin = 0.5;
  const vMax = MLSS * 1.15;
  const step = 0.01;

  let previousSpeed = vMin;
  let previousCHO = 0;

  for (let v = vMin; v <= vMax; v += step) {
    const totalEE =
      v * RE_CONST * (60 / 1000) * O2_KCAL * Mass;

    const fatKcal =
      fatOxidationAtSpeed(v);

    const choKcal =
      Math.max(0, totalEE - fatKcal);

    const choGH =
      choKcal / CHO_KCAL;

    if (previousCHO < 90 && choGH >= 90) {
      const interpolated =
        previousSpeed
          + (90 - previousCHO)
          * (v - previousSpeed)
          / (choGH - previousCHO);

      return interpolated;
    }

    previousSpeed = v;
    previousCHO = choGH;
  }

  return vMax;
}
```

Units:

```text
m/s
```

---

## Derived Metrics

```ts
const VO2maxAbs =
  VO2max * Mass;

const pctVO2AtMLSS =
  (MLSS / S360) * 100;

const glycogenGkg =
  clamp(
    4.5 + 2.0 * (1 - VLamax / 0.55),
    3,
    9
  );

const glycogenAbs =
  glycogenGkg * FFM;

const aerobicGlycolyticRatio =
  VO2max / (VLamax * 100 + 1);

const vVO2max =
  S360; // vVO2max = 6-minute test speed (field-test proxy)
```

---

## Validation Notes

### VLamax v2.2

Fitted on non-Taguchi C/profile rows only.

```text
R²        = 0.998
MAE       = 0.0059 mmol/L/s
RMSE      = 0.0084 mmol/L/s
LOOCV R²  = 0.997
LOOCV MAE = 0.0079 mmol/L/s
```

### MLSS v2.3

```text
R²        = 0.995
MAE       = 0.066 m/s
RMSE      = 0.087 m/s
LOOCV R²  = 0.992
LOOCV MAE = 0.083 m/s
```

### LT1 v2.3

```text
R²        = 0.992
MAE       = 0.070 m/s
RMSE      = 0.095 m/s
LOOCV R²  = 0.989
LOOCV MAE = 0.085 m/s
```

---

## Governance Rules

```text
1. This is a running-only model.
2. Do not modify cycling/bike equations from this specification.
3. Do not use Taguchi rows for primary fitting.
4. Taguchi rows may be used only as artificial stress tests.
5. CARB90 must be derived from total energy expenditure minus fat oxidation.
6. Do not directly refit CARB90 without first validating the fat oxidation curve.
7. This is a v2.3 candidate model pending independent validation.
```
