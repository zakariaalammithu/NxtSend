/**
 * Snov.io enrichment panel — thin wrapper over EnrichmentPanelBase.
 * NOT wired into any page; the coordinator wires it in.
 */
"use client";

import { EnrichmentPanelBase, type EnrichmentPanelProps } from "./EnrichmentPanelBase";
import { SNOV_CONFIG } from "@/lib/integrations/providers/enrichment/snov/config";

export type SnovPanelProps = Omit<
  EnrichmentPanelProps,
  "provider" | "displayName" | "docsUrl" | "capabilities" | "setupSteps"
>;

const SETUP_STEPS = [
  "Create API credentials in Snov.io (API → add a client).",
  "Store SNOV_CLIENT_ID and SNOV_CLIENT_SECRET; the adapter exchanges them for a 1-hour token automatically.",
  "Enrichment runs as async tasks and is polled for results.",
];

export default function SnovPanel(props: SnovPanelProps) {
  return (
    <EnrichmentPanelBase
      provider="snov"
      displayName="Snov.io"
      docsUrl={SNOV_CONFIG.docsUrl}
      capabilities={[...SNOV_CONFIG.capabilities]}
      setupSteps={SETUP_STEPS}
      {...props}
    />
  );
}
