import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Matokeo ya Mitihani",
  description:
    "Tafuta matokeo ya mtihani kwa namba ya usajili ya mwanafunzi bila kuingia – Amali Kitukutu (Kitukutu Technical Secondary School). Search exam results by student registration number.",
  robots: {
    index: true,
    follow: true,
  },
};

export default function ResultsLayout({ children }: { children: ReactNode }) {
  return children;
}