/**
 * Weezly enrichment panel — thin wrapper over EnrichmentPanelBase.
 * Not implemented: no public Weezly developer API was found, so
 * the adapter refuses every call. NOT wired into any page; the
 * coordinator wires it in.
 */
"use client";

import { EnrichmentPanelBase, type EnrichmentPanelProps } from "./EnrichmentPanelBase";
import { WEEZLY_CONFIG } from "@/lib/integrations/providers/enrichment/weezly/config";

export type WeezlyPanelProps = Omit<
  EnrichmentPanelProps,
  "provider" | "displayName" | "docsUrl" | "capabilities" | "setupSteps"
>;

const SETUP_STEPS = [
  "Not implemented — no public Weezly developer API was found.",
  "If Weezly publishes an API, wire its endpoints in the adapter.",
  "Store the key as WEEZLY_API_KEY once the API is documented.",
];

export default function WeezlyPanel(props: WeezlyPanelProps) {
  return (
    <EnrichmentPanelBase
      provider="weezly"
      displayName="Weezly"
      docsUrl={WEEZLY_CONFIG.docsUrl}
      capabilities={[...WEEZLY_CONFIG.capabilities]}
      setupSteps={SETUP_STEPS}
      {...props}
    />
  );
}
