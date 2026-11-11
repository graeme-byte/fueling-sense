import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How the FuelingSense field test works · VLamax and VO2max without a lab",
  description:
    "FuelingSense estimates VO2max, VLamax, LT1, LT2, zones and carbohydrate use from a 20-second sprint and a 5-minute all-out effort plus body composition. The protocol, the model and its limits.",
  alternates: { canonical: "https://www.fueling-sense.com/method" },
};

const faqs: [string, string][] = [
  ["What is VLamax?", "VLamax is the maximal rate of lactate production through glycolysis. A high VLamax supports sprints and surges but burns more carbohydrate at a given intensity; a low VLamax favours fat use and long steady efforts."],
  ["Can VLamax be estimated without blood lactate?", "Approximately, yes. Peak 20-second power relative to fat-free mass tracks glycolytic capacity, and FuelingSense estimates VLamax from it without blood samples."],
  ["How often should I retest?", "Every 8 to 12 weeks, or at the start and end of a training block."],
  ["How does FuelingSense relate to Endurance Signals?", "Endurance Signals uses the same engine to keep each athlete's profile current from recent peak power. FuelingSense is the standalone, more detailed profiler and race fuelling calculator."],
];

export default function MethodPage() {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 20px", lineHeight: 1.6 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, "\\u003c") }} />
      <h1>How the FuelingSense field test works</h1>
      <p>
        FuelingSense estimates an athlete&apos;s metabolic profile from two maximal efforts and body composition. No lab,
        no blood samples. It was built by <a href="https://graemestewart.com/about">Dr Graeme Stewart</a>, a biochemist
        and former professional triathlete.
      </p>

      <h2>The protocol</h2>
      <ol>
        <li><strong>20-second all-out sprint (P20).</strong> Reflects glycolytic power, and so VLamax relative to fat-free mass.</li>
        <li><strong>5-minute all-out effort (P300).</strong> Reflects aerobic power, and so VO2max.</li>
        <li><strong>Body mass and body fat</strong>, to calculate fat-free mass.</li>
      </ol>

      <h2>What the model calculates</h2>
      <ul>
        <li>VO2max and VLamax</li>
        <li>Lactate production and clearance across intensities, giving LT1 and LT2</li>
        <li>Training zones anchored to those thresholds</li>
        <li>Fat and carbohydrate use at each intensity, and carbohydrate needed per hour at race pace</li>
        <li>A race fuelling plan, including the glucose and fructose mix</li>
      </ul>

      <h2>Validation</h2>
      <p>
        The v0.6 cycling model was compared with INSCYD laboratory tests from 40 cyclists (April 2026), using only
        body weight, body fat and the two test powers. Threshold power (MLSS): R² 0.93, mean error 8.4 W. VO2max:
        R² 0.97. VLamax: R² 0.92. LT1: R² 0.90 (31 athletes with a valid LT1). The clearest difference: the model
        predicts more fat use close to threshold (80 to 90% of MLSS) than the laboratory data shows.
      </p>

      <h2>Limits</h2>
      <p>
        Field estimates depend on true maximal efforts and accurate body composition. A sprint that is not all-out
        underestimates VLamax. Treat results as a model to track change over time, not a laboratory measurement.
      </p>

      <h2>Common questions</h2>
      {faqs.map(([q, a]) => (
        <section key={q}><h3>{q}</h3><p>{a}</p></section>
      ))}

      <p>
        <Link href="/calculator/profiler">Run the cycling profiler</Link> ·{" "}
        <Link href="/calculator/running-profiler">Run the running profiler</Link> ·{" "}
        <a href="https://graemestewart.com/blog/metabolic-profile-without-a-lab">Longer explanation on the blog</a>
      </p>
    </main>
  );
}
