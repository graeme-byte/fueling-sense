import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Running metabolic profiler · VO2max, VLamax and thresholds",
  description: "Estimate VO2max, VLamax, thresholds and running zones from short all-out run efforts and body composition. No lab or blood lactate.",
  alternates: { canonical: "/calculator/running-profiler" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
