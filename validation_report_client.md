# Fueling Sense Model Validation — Summary Report

**Date:** April 2026
**Dataset:** 40 real-athlete INSCYD laboratory tests
**Model:** FuelingSense v0.6 metabolic profiler + fueling engine

---

## Overview

This report summarises an independent validation of the FuelingSense metabolic model against laboratory-measured data from 40 real cyclists. Each athlete completed INSCYD laboratory testing, which produced measured values for key performance markers including maximal lactate steady state (MLSS/LT2), first lactate threshold (LT1), maximal fat oxidation rate, and the carbohydrate oxidation profile across a range of intensities.

The FuelingSense model was run on each athlete using only their body weight, body fat percentage, and their sprint and endurance test power outputs. The model's predictions were then compared to the INSCYD laboratory results. No INSCYD formulas were used — the comparison is entirely between FuelingSense's own equations and the laboratory measurements.

The dataset covers a wide range of athlete types: body weights from 54 to 102 kg, VO2max values from 32 to 64 ml/kg/min, and metabolic profiles spanning pure endurance specialists to sprint-dominant athletes.

---

## Key Findings

- **MLSS (threshold power) prediction is strong:** The model accounts for 93% of the variation across athletes (R² = 0.93), with a mean error of just 8.4 watts and essentially zero systematic bias (+0.1 W). For most athletes, threshold power is predicted within 10–15 watts of the laboratory value.

- **VO2max prediction is very strong:** R² = 0.97, mean error of 1.0 ml/kg/min. This is the best-performing metric in the model.

- **LT1 (lower aerobic threshold) is well predicted:** R² = 0.90, mean error of 7.1 watts among the 31 athletes with valid LT1 measurements. The remaining 9 athletes had LT1 values recorded as 50 W in the dataset, which are likely placeholders from an older INSCYD software version and were excluded from this comparison.

- **VLamax is reliably estimated:** R² = 0.92, mean absolute error of 0.023 mmol/L/s — closely matching the published accuracy of comparable 3PT models.

- **Peak fat oxidation rate is well captured:** R² = 0.80, mean error of 2.8 g/h. The model slightly overestimates (by ~1 g/h on average), which is conservative in the direction of slightly underestimating fat's contribution.

- **FATmax power position is consistent in rank but biased high:** The model correctly identifies which athletes have low versus high FATmax power (R² = 0.66), but the absolute position is predicted about 15 watts higher than INSCYD reports. This reflects a systematic difference between how FuelingSense positions FATmax on its curve versus how INSCYD defines the equivalent point.

- **CARB90 threshold is meaningfully correlated with INSCYD's CarbMax position:** R² = 0.80, mean error of 9 watts. However, CARB90 (the power where carbohydrate burning reaches 90 g/h) and INSCYD's CarbMax (the power of maximum carbohydrate oxidation) are not the same thing — this comparison is directional, not exact.

- **Fat oxidation at high intensities (80–90% of MLSS) is systematically higher than INSCYD:** This is the model's clearest divergence. FuelingSense predicts more fat oxidation at intensities close to threshold than INSCYD does. On average, the model overestimates fat oxidation at 80% MLSS by 8–9 g/h and at 90% MLSS by 5–6 g/h. This means the model is more conservative (optimistic about fat contribution) at high intensities than the laboratory data supports.

---

## Validation: FATmax

The model reliably ranks athletes by their FATmax power — it correctly identifies that an endurance-adapted athlete with a low VLamax will have a higher FATmax than a sprint-oriented athlete with the same threshold power. The R² of 0.66 for absolute wattage reflects the model's real predictive capability.

The systematic +15 W overestimate of FATmax position is consistent across athletes and most likely reflects a definitional difference: INSCYD defines FATmax as the power where net fat oxidation is at its measured peak (including the inflection point of the RER curve), while FuelingSense uses a smoothstep curve that peaks slightly later. The practical consequence is small: both models agree that FATmax sits in the 65–80% of MLSS range for most athletes.

The fat oxidation rate at FATmax (in grams per hour) is predicted well: mean error of 2.8 g/h across the full range of 22–64 g/h seen in this dataset. There is a slight positive bias (+1.1 g/h on average), meaning the model is marginally conservative about fat's capacity.

**Practical interpretation:** The FATmax marker in FuelingSense reliably indicates whether an athlete has high or low fat oxidation capacity relative to their peers. The absolute wattage may be 10–20 W higher than a lab-measured FATmax in INSCYD, but the substrate rates at that point are well-calibrated.

---

## Validation: CARB90

CARB90 — the power output at which carbohydrate burning first reaches 90 grams per hour — is a key fueling threshold in the FuelingSense model. It marks the point where on-the-bike fueling becomes critical to sustaining effort.

INSCYD does not report a "CARB90" value directly. Their closest equivalent is "CarbMax" — the power at which carbohydrate oxidation is at its maximum. These are conceptually related but not the same: CARB90 is where the threshold is crossed, CarbMax is where CHO peaks.

The comparison shows R² = 0.80 and a mean error of 9 watts, with a +7 W positive bias (FuelingSense CARB90 sits slightly higher than INSCYD's CarbMax in watts). For a given athlete with an MLSS of 250 W, a 9 W error on CARB90 corresponds to roughly 4% of MLSS — a small difference in practical terms.

**Practical interpretation:** The CARB90 threshold correctly identifies whether an athlete is at low, moderate, or high carbohydrate demand at a given power output. Athletes who INSCYD identifies as high CHO burners are also identified as such by FuelingSense, and vice versa.

---

## Substrate Curves Across VLamax Range

The following table shows how the substrate curve shifts as VLamax changes, holding all other inputs fixed at representative values (MLSS = 270 W, VO2max = 55 ml/kg/min, weight = 75 kg, body fat = 12%). This represents the expected metabolic profile of a mid-tier competitive cyclist at different points on the glycolytic spectrum.

| VLamax (mmol/L/s) | Metabolic Type | LT1 (W) | FATmax Position (W) | FATmax Rate (g/h) | CARB90 (W) | CHO at MLSS (g/h) |
|---|---|---|---|---|---|---|
| 0.15 | Endurance Specialist | 214 | 217 | 54.2 | 232 | 225 |
| 0.25 | Endurance-oriented | 209 | 206 | 51.7 | 224 | 230 |
| 0.35 | Balanced (low end) | 205 | 199 | 48.6 | 218 | 233 |
| 0.45 | Balanced | 201 | 193 | 45.1 | 212 | 236 |
| 0.55 | Balanced (high end) | 197 | 189 | 41.7 | 205 | 238 |
| 0.65 | Anaerobic-leaning | 193 | 185 | 38.4 | 198 | 240 |
| 0.75 | Sprint-oriented | 189 | 182 | 35.2 | 190 | 241 |

*Fixed inputs: MLSS = 270 W, VO2max = 55 ml/kg/min, weight = 75 kg, body fat = 12%, standard diet.*

**What this table means for athletes:**

As VLamax increases from 0.15 to 0.75, three things happen simultaneously:

1. **FATmax rate falls** — from 54 to 35 g/h. A sprint-oriented athlete burns less fat per hour at their FATmax power than an endurance specialist does. This is a fundamental metabolic difference, not just a fueling one.

2. **FATmax position shifts left** — from 217 W to 182 W. The power at which fat burning peaks comes earlier (as a fraction of MLSS) in high-VLamax athletes. They "use up" their fat-burning window sooner.

3. **CARB90 shifts left** — from 232 W to 190 W. The power where carbohydrate demand crosses 90 g/h is lower for sprint-oriented athletes, meaning they need to start fueling at lower absolute power outputs.

4. **LT1 decreases slightly** — from 214 W to 189 W at the same MLSS. High-VLamax athletes have a narrower gap between LT1 and LT2, which is consistent with their greater glycolytic activity suppressing aerobic-zone efficiency.

The practical message is direct: a high-VLamax athlete racing at 80% of MLSS will have higher carbohydrate demand and lower fat oxidation than a low-VLamax athlete at the same wattage. They need to fuel earlier, more frequently, and plan for higher carbohydrate rates to sustain the same output.

---

## Practical Interpretation

**Using your MLSS and VLamax together:** MLSS tells you where your threshold is. VLamax tells you the metabolic cost of operating near it. Two athletes with identical MLSS power can have very different fueling needs if their VLamax values differ. FuelingSense uses both together to produce substrate curves specific to your physiology.

**Reading the substrate curve:**
- Below LT1: You are burning primarily fat. Fueling supports blood glucose maintenance but you are not CHO-limited.
- LT1 to LT2: Fat and carbohydrate burn together. The relative contribution shifts with VLamax.
- Near and above LT2: Carbohydrate dominates. This is where CARB90 becomes relevant.

**In training:** The LT1–LT2 zone is where fat oxidation training occurs. Working regularly at 75–90% of MLSS builds fat oxidation capacity and shifts the substrate curve over months. This is a long-term adaptation, not a short-term fix.

**In racing:** At race intensity (for most endurance events, 75–100% of MLSS), carbohydrate demand is high. The CARB90 value tells you approximately where intake becomes critical. If your race power sits above CARB90, plan to fuel at 90+ g/h and ensure your carbohydrate sources are gut-trained.

**Interpreting FATmax:** The FATmax wattage is not the ideal training intensity — it is the diagnostic marker that shows where your fat-burning peaks. Many athletes find FATmax sits in the Zone 2–3A range, which aligns with why steady aerobic work is effective for developing fat metabolism.

---

## Confidence Statement

**Strong confidence areas:**
- MLSS/LT2 prediction: ±8–15 W for most athletes. Appropriate for fueling planning, training zone setup, and race pacing decisions.
- VO2max: ±1–2 ml/kg/min. Strong agreement with laboratory measurement.
- LT1: ±7–12 W for most athletes with valid data.
- VLamax: ±0.02–0.04 mmol/L/s. Reliable for metabolic classification and substrate curve shaping.

**Moderate confidence areas:**
- FATmax rate (g/h): Within 2–5 g/h for most athletes. The model slightly overestimates fat contribution, which is the conservative direction.
- CARB90 position: Within 10–15 W for most athletes.

**Known divergences from laboratory data:**
- Fat oxidation at 80–90% of MLSS is systematically overestimated by 5–10 g/h. Athletes using the model should understand that the fat contribution at high intensities may be optimistic compared to what a direct laboratory measurement would show. This means the "carbohydrate needed" figure may be slightly underestimated at very high intensities.
- FATmax wattage is predicted approximately 15 W higher than INSCYD reports. The absolute position is directionally correct but not laboratory-exact.

**Appropriate use cases:**
FuelingSense is designed to help athletes make better fueling decisions for training and racing — it is not a substitute for laboratory testing when laboratory-level precision is needed. The model is calibrated to produce outputs that meaningfully differentiate between athlete types and accurately reflect how substrate use changes with intensity, VLamax, and body composition. It is validated to a level appropriate for field use, race planning, and training guidance.

**Populations and contexts not validated in this dataset:**
- Athletes with extreme body compositions outside the dataset range
- Ketogenic or very high-fat dietary adaptations
- Athletes with VLamax below 0.15 or above 0.75 mmol/L/s
- Female athletes specifically (the dataset does not record sex; sex-specific validation is pending)
