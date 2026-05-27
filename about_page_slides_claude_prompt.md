# FuelingSense About Page Slide Section — Claude Build Prompt

## Context

You are working inside the `fueling_sense_app` repository.

We want to add an athlete-facing explanation section to the About page using four existing visuals.

The visuals are already available and named:

- `slide1`
- `slide2`
- `slide3`
- `slide4`

Use these as image placeholders or imported assets depending on the current app structure.

Do not redesign the science.
Do not change engine logic.
Do not alter calculator behaviour.
This is a website content/UI task only.

---

## Objective

Create a clean About page section that explains why FuelingSense uses VO2max and VLamax to estimate thresholds, substrate use, and fueling needs.

The section should be athlete-facing, clear, and confidence-building.

It should explain:

- why one power number is not enough
- how VO2max and VLamax interact
- why CP20 / 20-minute threshold estimates can overestimate sustainable threshold
- how FuelingSense derives LT1, LT2, FATmax, and carbohydrate demand
- why this leads to better training zones and smarter fueling

---

## Tone

Use a plain-English athlete-facing tone.

Avoid heavy jargon.
Avoid sounding like a research paper.
Avoid hype.
Avoid overclaiming.

The tone should be:

- clear
- credible
- practical
- coach-led
- scientifically grounded

Use British English where relevant.

---

## Section Title

Suggested heading:

`Look under the bonnet, not just at the final number`

Suggested subheading:

`FuelingSense estimates how your metabolism behaves, not just what power or pace you can hold for one test.`

---

## Main Copy

Use this core text, refining only for flow and layout:

FuelingSense is built on a simple but powerful idea from the work of Alois Mader and the Cologne sports science group.

Endurance performance is not explained by one number alone. It comes from the interaction between two sides of metabolism:

VO2max, your aerobic engine, tells us how much oxygen-based energy you can produce.

VLamax, your glycolytic engine, tells us how quickly you produce energy through glycolysis, the fast carbohydrate-burning pathway that also drives lactate production.

When we know both, we can estimate where the key balance points occur: LT1, LT2, FATmax, and carbohydrate demand.

This is where simple threshold methods, like a 20-minute test, can fall down. A 20-minute power number tells you what you produced on one hard effort, but it does not tell you how you produced it.

Two athletes can ride or run the same 20-minute result with very different metabolic profiles. One may be aerobically strong and efficient. Another may be relying more heavily on glycolytic contribution and carbohydrate burn.

That matters.

In practice, many athletes can go very deep for 20 minutes, and that can lead to threshold estimates that are 5 to 15 percent too high. The result is training that feels harder than it should. Easy sessions stop being easy. Threshold work becomes race effort. Consistency drops. Recovery suffers. Progression stalls.

FuelingSense tries to solve that by looking under the bonnet.

Instead of asking only, “What power or pace did you hold?”, we ask, “What metabolic engine produced that performance?”

That gives a better estimate of sustainable thresholds, fat oxidation, carbohydrate demand, and race fueling needs.

The goal is not just to tell you how fit you are. It is to show how your metabolism behaves, where your sustainable zones really sit, and how much carbohydrate you are likely to need at race intensity.

---

## Slide Integration

Use the four slides as a visual story.

### Slide 1

Image placeholder: `slide1`

Purpose:
Introduce the two-engine concept.

Caption:
`VO2max and VLamax describe two different sides of performance: your aerobic engine and your glycolytic engine.`

### Slide 2

Image placeholder: `slide2`

Purpose:
Explain why a 20-minute test can miss the full picture.

Caption:
`A single 20-minute result can hide very different metabolic profiles. That is why threshold estimates based only on one hard effort can be misleading.`

### Slide 3

Image placeholder: `slide3`

Purpose:
Show how two metrics lead to multiple outputs.

Caption:
`By combining VO2max and VLamax, FuelingSense estimates LT1, LT2, FATmax, and carbohydrate demand.`

### Slide 4

Image placeholder: `slide4`

Purpose:
Summarise the practical benefits.

Caption:
`Better metabolic insight means more accurate zones, better consistency, smarter fueling, and more individual recommendations.`

---

## Suggested Layout

Create a responsive section for the About page.

Desktop layout:

1. Intro text block on the left
2. Slide image or carousel on the right
3. Below, a four-card explanation grid matching slides 1–4

Mobile layout:

1. Heading
2. Intro copy
3. Slides stacked vertically or in a swipeable carousel
4. Captions under each slide
5. Final callout

Use the existing design system and styling conventions in the app.
Match the FuelingSense visual tone.
Do not introduce a new UI library unless already used in the project.

---

## Four Explanation Cards

Create four short cards below the main copy.

### Card 1 — Two engines

Title:
`Two engines, one performance`

Text:
`VO2max shows aerobic capacity. VLamax shows glycolytic drive. Together, they explain more than either number alone.`

Image:
`slide1`

### Card 2 — Why CP20 can mislead

Title:
`One test can hide the cost`

Text:
`A 20-minute result shows what you produced, but not how much aerobic or glycolytic energy went into producing it.`

Image:
`slide2`

### Card 3 — From inputs to insight

Title:
`From two metrics to key markers`

Text:
`FuelingSense uses the interaction between VO2max and VLamax to estimate LT1, LT2, FATmax, and carbohydrate demand.`

Image:
`slide3`

### Card 4 — Better decisions

Title:
`Training and fueling that fit you`

Text:
`The aim is more accurate zones, better consistency, and a fueling strategy matched to your actual metabolic profile.`

Image:
`slide4`

---

## Final Callout

Add a final callout at the bottom of the section:

`The goal is not to chase a bigger threshold number. The goal is to understand what is truly sustainable, train consistently, and fuel the work you are actually doing.`

Optional button text:

`Try the calculator`

Optional secondary link:

`Learn how the model works`

Use existing routes if available. If routes are unclear, add placeholders and note them in the output.

---

## Implementation Rules

- Do not modify metabolic model code.
- Do not change API routes.
- Do not change authentication or subscription logic.
- Only edit About page components and any necessary image imports.
- Use existing components where possible.
- Keep copy concise and readable.
- Ensure mobile layout is clean.
- Ensure images have useful alt text.

---

## Image Alt Text

Use these alt text descriptions:

- `slide1`: `Infographic showing VO2max and VLamax as two engines that drive endurance performance.`
- `slide2`: `Infographic explaining how a 20-minute test can miss different aerobic and glycolytic profiles.`
- `slide3`: `Infographic showing how VO2max and VLamax combine to estimate LT1, LT2, FATmax, and carbohydrate demand.`
- `slide4`: `Infographic summarising how better metabolic insight improves training zones, consistency, fueling, and individual recommendations.`

---

## Output Requirements

Return:

1. Files changed
2. Exact code diff or full replacement component
3. Any asset path assumptions for `slide1`, `slide2`, `slide3`, `slide4`
4. Any routes or links that need confirmation
5. Confirmation that no model or API logic was changed
