import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cycling race fuelling calculator · carbohydrate per hour",
  description: "Carbohydrate and fat use at your race power, grams of carbohydrate per hour and a glucose and fructose plan, from your metabolic profile.",
  alternates: { canonical: "/calculator/fueling" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
