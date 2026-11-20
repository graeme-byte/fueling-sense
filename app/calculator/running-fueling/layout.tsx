import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Running race fuelling calculator · carbohydrate per hour",
  description: "Carbohydrate and fat use at your race pace, grams of carbohydrate per hour and a race fuelling plan, from your metabolic profile.",
  alternates: { canonical: "/calculator/running-fueling" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
