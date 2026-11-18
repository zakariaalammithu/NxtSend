/**
 * Factors.ai enrichment panel — thin wrapper over EnrichmentPanelBase.
 * Config-ready only: the Factors API reference has not been
 * verified, so the adapter refuses every call until the endpoints
 * are supplied. NOT wired into any page; the coordinator wires it
 * in.
 */
"use client";

import { EnrichmentPanelBase, type EnrichmentPanelProps } from "./EnrichmentPanelBase";
import { FACTORS_CONFIG } from "@/lib/integrations/providers/enrichment/factors/config";

export type FactorsPanelProps = Omit<
  EnrichmentPanelProps,
  "provider" | "displayName" | "docsUrl" | "capabilities" | "setupSteps"
>;

const SETUP_STEPS = [
  "Config-ready only — the Factors API reference has not been verified.",
  "Obtain the official API reference from Factors.ai, then wire the endpoints in the adapter.",
  "Store the key as FACTORS_API_KEY once the API is documented.",
];

export default function FactorsPanel(props: FactorsPanelProps) {
  return (
    <EnrichmentPanelBase
      provider="factors"
      displayName="Factors.ai"
      docsUrl={FACTORS_CONFIG.docsUrl}
      capabilities={[...FACTORS_CONFIG.capabilities]}
      setupSteps={SETUP_STEPS}
      {...props}
    />
  );
}
