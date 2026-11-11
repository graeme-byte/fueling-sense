// Shared entity graph. The @id values MUST match graemestewart.com and endurancesignals.ai
// exactly — that is what tells search engines and AI tools these are one person's products.
const HUB = "https://graemestewart.com";
const SITE = "https://www.fueling-sense.com";

const graph = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE}/#app`,
      name: "FuelingSense",
      url: `${SITE}/`,
      applicationCategory: "HealthApplication",
      operatingSystem: "Web",
      description:
        "Metabolic profiler and race fuelling calculator: estimates VO2max, VLamax, LT1 and LT2 from short all-out field efforts (a 20-second sprint plus a 5-minute effort on the bike, or 3- and 6-minute efforts running), without blood lactate.",
      creator: { "@id": `${HUB}/#graeme` },
      publisher: { "@id": `${HUB}/#stewart-sports` },
      isRelatedTo: { "@id": "https://endurancesignals.ai/#app" },
    },
    { "@type": "Person", "@id": `${HUB}/#graeme`, name: "Graeme Stewart", honorificPrefix: "Dr", url: `${HUB}/about` },
    { "@type": "Organization", "@id": `${HUB}/#stewart-sports`, name: "Stewart Sports Limited", identifier: "07426879" },
  ],
};

export default function JsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, "\\u003c") }}
    />
  );
}
