import type { MetadataRoute } from "next";

const SITE = "https://www.fueling-sense.com";
const PATHS = ["/", "/method", "/calculator/profiler", "/calculator/fueling",
  "/calculator/running-profiler", "/calculator/running-fueling", "/support", "/terms", "/privacy"];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-11-11");
  return PATHS.map((p) => ({ url: `${SITE}${p}`, lastModified, priority: p === "/" ? 1 : p === "/method" ? 0.9 : 0.7 }));
}
