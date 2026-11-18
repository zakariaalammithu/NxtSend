/**
 * Clay enrichment panel — thin wrapper over EnrichmentPanelBase.
 * NOT wired into any page; the coordinator wires it in.
 */
"use client";

import { EnrichmentPanelBase, type EnrichmentPanelProps } from "./EnrichmentPanelBase";
import { CLAY_CONFIG } from "@/lib/integrations/providers/enrichment/clay/config";

export type ClayPanelProps = Omit<
  EnrichmentPanelProps,
  "provider" | "displayName" | "docsUrl" | "capabilities" | "setupSteps"
>;

const SETUP_STEPS = [
  "Create an API key in Clay (Settings → Account → API keys).",
  "Store it as CLAY_API_KEY and note the routine id of the enrichment routine to run.",
  "The routine id is operator-supplied; routine outputs are mapped generically onto lead fields.",
];

export default function ClayPanel(props: ClayPanelProps) {
  return (
    <EnrichmentPanelBase
      provider="clay"
      displayName="Clay"
      docsUrl={CLAY_CONFIG.docsUrl}
      capabilities={[...CLAY_CONFIG.capabilities]}
      setupSteps={SETUP_STEPS}
      {...props}
    />
  );
}
