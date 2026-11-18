/**
 * Persana AI enrichment panel — thin wrapper over EnrichmentPanelBase.
 * Config-ready only: no public Persana API reference has been found,
 * so the adapter refuses every call until the endpoints are verified.
 * NOT wired into any page; the coordinator wires it in.
 */
"use client";

import { EnrichmentPanelBase, type EnrichmentPanelProps } from "./EnrichmentPanelBase";
import { PERSANA_CONFIG } from "@/lib/integrations/providers/enrichment/persana/config";

export type PersanaPanelProps = Omit<
  EnrichmentPanelProps,
  "provider" | "displayName" | "docsUrl" | "capabilities" | "setupSteps"
>;

const SETUP_STEPS = [
  "Config-ready only — no public Persana API reference has been found.",
  "Obtain the official API reference from Persana, then wire the endpoints in the adapter.",
  "Store the key as PERSANA_API_KEY once the API is documented.",
];

export default function PersanaPanel(props: PersanaPanelProps) {
  return (
    <EnrichmentPanelBase
      provider="persana"
      displayName="Persana AI"
      docsUrl={PERSANA_CONFIG.docsUrl}
      capabilities={[...PERSANA_CONFIG.capabilities]}
      setupSteps={SETUP_STEPS}
      {...props}
    />
  );
}
