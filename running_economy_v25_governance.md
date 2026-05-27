# Running Economy v2.5 — MODEL GOVERNANCE NOTE
Status: ACTIVE
Date: 2026-05-27

========================================
PURPOSE
========================================

Running Economy v2.5 replaces the previous fixed running economy implementation with:

1. VO2max-individualised baseline running economy
2. Speed-dependent economy scaling
3. Explicit economy representation in the fueling engine

This update affects:
- running fueling calculations
- substrate energy cost
- CARB90 derivation
- running substrate curves

This update does NOT affect:
- cycling engine
- running VLamax equations
- running VO2max equations
- running MLSS equations
- running LT1 equations
- fat oxidation curve structure
- recommendation caps introduced in Step 1
- profiler validation pipeline
- zone equations

========================================
BACKGROUND
========================================

Previous implementation used:

RE_CONST = 12.22

Units:

mL O2 · kg^-1 · min^-1 per (m/s)

Equivalent to:

203.7 mL O2 · kg^-1 · km^-1

This assumed:
- identical running economy for all athletes
- identical economy at all running speeds

Validation against INSCYD observations suggested:
- economy is athlete-dependent
- economy worsens slightly at high speeds
- fixed economy likely inflated substrate demand for economical athletes
- fixed economy likely underestimated cost near vVO2max

========================================
IMPLEMENTED MODEL
========================================

----------------------------------------
1. Base Running Economy
----------------------------------------

Function:

estimateBaseRunningEconomy(vo2maxMlKgMin)

Output:
mL O2 · kg^-1 · km^-1

Logic:

VO2max < 40:
  220

40–50:
  interpolate 216 → 210

50–60:
  interpolate 210 → 202

60–70:
  interpolate 202 → 196

70–80:
  interpolate 196 → 190

>80:
  188

Clamp:
185–225 mL/kg/km

Interpretation:
Higher-performing athletes are assumed to be modestly more economical.

----------------------------------------
2. Speed-Dependent Economy Scaling
----------------------------------------

Function:

adjustEconomyForSpeed(
  baseEconomy,
  speedMs,
  mlssSpeedMs
)

Definitions:

x = speedMs / mlssSpeedMs

Logic:

x <= 0.85:
  modifier = -0.01

0.85 < x <= 1.00:
  interpolate -0.01 → 0.00

1.00 < x <= 1.15:
  interpolate 0.00 → +0.035

x > 1.15:
  modifier = +0.05

Final:

speedAdjustedEconomy =
  baseEconomy × (1 + modifier)

Clamp:
180–235 mL/kg/km

Interpretation:
Economy remains approximately flat across submaximal speeds and worsens modestly above MLSS / near vVO2max.

This approximates observed INSCYD behaviour and the general shape of Léger-Mercier-style outdoor running economy curves without introducing a full cubic aerodynamic model.

========================================
ENERGY COST IMPLEMENTATION
========================================

Previous:

energyKcalH =
  speedMs × 12.22 × 0.06 × 5.0 × massKg

Current:

speedKmh = speedMs × 3.6

vo2CostMlKgMin =
  economyMlKgKm × speedKmh / 60

energyKcalH =
  vo2CostMlKgMin × massKg × 0.06 × 5.0

Substrate calculation remains:

choGH =
  (energyKcalH - fatGH × 9.3) / 4.1

Fat oxidation model unchanged.

========================================
VALIDATION SUMMARY
========================================

Primary validation metrics unchanged:

VO2max:
  R² 0.992
  MAE 1.005

MLSS:
  R² 0.997
  MAE 0.055

LT1:
  R² 0.994
  MAE 0.061

CARB90:
  Slight RMSE improvement
  Slight positive bias increase
  Largest previous outlier corrected

Economy distribution:
  Mean: 205.2 mL/kg/km
  SD: 9.5
  Range: 194–220

Observed HM substrate shift:
  Mean −3.7 g/h CHO
  Range:
    −15.8 to +8.2 g/h

Recommendation layer:
  Stable
  0/19 recommendation category changes

========================================
ARCHITECTURAL STATUS
========================================

Fueling engine:
- economy-adjusted
- speed-adjusted
- CARB90-adjusted
- substrate curves adjusted

Profiler pipeline:
- intentionally unchanged
- continues using legacy RE_CONST path
- preserves historical validation and zone behaviour

This divergence is currently intentional and documented.

========================================
KNOWN LIMITATIONS
========================================

1. Economy is inferred from VO2max only.
No direct biomechanical or stride metrics used.

2. Speed scaling is simplified.
Not a full aerodynamic or Léger-Mercier cubic model.

3. Profiler still uses fixed economy.
Fueling and profiler are not yet fully unified.

4. Economy is not currently user-editable.

========================================
FUTURE DIRECTIONS (NOT IMPLEMENTED)
========================================

Potential future upgrades:

- explicit user economy input
- race-performance-derived economy
- terrain-specific economy
- gradient-adjusted economy
- temperature effects
- shoe/surface modifiers
- full speed-dependent cubic economy model
- unified profiler + fueling economy pipeline

========================================
GOVERNANCE
========================================

This implementation is now part of the running metabolic engine specification.

Do not:
- alter economy equations
- alter scaling magnitudes
- alter clamps
- alter recommendation interaction

without:
1. validation against INSCYD dataset
2. CARB90 regression check
3. substrate stability review
4. documented governance update
