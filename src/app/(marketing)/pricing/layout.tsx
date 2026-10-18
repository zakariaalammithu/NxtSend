import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing Plans — Simple, Transparent Pricing",
  description:
    "Choose the right plan for your outreach scale. 14-day free trial, no credit card required. Starter, Growth, and Agency tiers.",
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
