/**
 * Apollo.io enrichment panel — thin wrapper over EnrichmentPanelBase.
 * NOT wired into any page; the coordinator wires it in.
 */
"use client";

import { EnrichmentPanelBase, type EnrichmentPanelProps } from "./EnrichmentPanelBase";
import { APOLLO_CONFIG } from "@/lib/integrations/providers/enrichment/apollo/config";

export type ApolloPanelProps = Omit<
  EnrichmentPanelProps,
  "provider" | "displayName" | "docsUrl" | "capabilities" | "setupSteps"
>;

const SETUP_STEPS = [
  "Create an API key in Apollo (Settings → Integrations → API).",
  "Store it as APOLLO_API_KEY (encrypted via the connection store).",
  "Enrichment runs per lead or in bulk; credits are only spent when data is returned.",
];

export default function ApolloPanel(props: ApolloPanelProps) {
  return (
    <EnrichmentPanelBase
      provider="apollo"
      displayName="Apollo.io"
      docsUrl={APOLLO_CONFIG.docsUrl}
      capabilities={[...APOLLO_CONFIG.capabilities]}
      setupSteps={SETUP_STEPS}
      {...props}
    />
  );
}
