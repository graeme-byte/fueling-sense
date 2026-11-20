import type { MetadataRoute } from "next";

const SITE = "https://www.fueling-sense.com";
const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User",
  "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "CCBot"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      ...AI_BOTS.map((userAgent) => ({ userAgent, allow: "/", disallow: ["/login", "/api/", "/account"] })),
      { userAgent: "*", allow: "/", disallow: ["/login", "/api/", "/account"] },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
