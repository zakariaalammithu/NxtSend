/**
 * Clearbit / HubSpot Data Enrichment panel — thin wrapper over
 * EnrichmentPanelBase. Provider blocked: the standalone Clearbit
 * API was deprecated after HubSpot's acquisition, so the adapter
 * refuses every call. NOT wired into any page; the coordinator
 * wires it in.
 */
"use client";

import { EnrichmentPanelBase, type EnrichmentPanelProps } from "./EnrichmentPanelBase";
import { CLEARBIT_CONFIG } from "@/lib/integrations/providers/enrichment/clearbit/config";

export type ClearbitPanelProps = Omit<
  EnrichmentPanelProps,
  "provider" | "displayName" | "docsUrl" | "capabilities" | "setupSteps"
>;

const SETUP_STEPS = [
  "Blocked — the standalone Clearbit API was deprecated after HubSpot's acquisition.",
  "Enrichment is now only available inside paid HubSpot (Breeze Intelligence) on HubSpot records.",
  "No credential can be connected; the adapter refuses every call.",
];

export default function ClearbitPanel(props: ClearbitPanelProps) {
  return (
    <EnrichmentPanelBase
      provider="clearbit"
      displayName="Clearbit / HubSpot Data Enrichment"
      docsUrl={CLEARBIT_CONFIG.docsUrl}
      capabilities={[...CLEARBIT_CONFIG.capabilities]}
      setupSteps={SETUP_STEPS}
      {...props}
    />
  );
}
