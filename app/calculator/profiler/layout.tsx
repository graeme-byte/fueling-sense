import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cycling metabolic profiler · VO2max, VLamax, LT1 and LT2",
  description: "Estimate VO2max, VLamax, LT1, LT2 and training zones from a 20-second sprint and a 5-minute all-out effort on the bike. No lab or blood lactate.",
  alternates: { canonical: "/calculator/profiler" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
