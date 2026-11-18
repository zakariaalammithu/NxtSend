/**
 * Dropcontact enrichment panel — thin wrapper over EnrichmentPanelBase.
 * NOT wired into any page; the coordinator wires it in.
 */
"use client";

import { EnrichmentPanelBase, type EnrichmentPanelProps } from "./EnrichmentPanelBase";
import { DROPCONTACT_CONFIG } from "@/lib/integrations/providers/enrichment/dropcontact/config";

export type DropcontactPanelProps = Omit<
  EnrichmentPanelProps,
  "provider" | "displayName" | "docsUrl" | "capabilities" | "setupSteps"
>;

const SETUP_STEPS = [
  "Create an API key at app.dropcontact.com.",
  "Store it as DROPCONTACT_API_KEY (encrypted via the connection store).",
  "Enrichment is batched (up to 250 contacts) and polled; credits are only spent when a verified email is returned.",
];

export default function DropcontactPanel(props: DropcontactPanelProps) {
  return (
    <EnrichmentPanelBase
      provider="dropcontact"
      displayName="Dropcontact"
      docsUrl={DROPCONTACT_CONFIG.docsUrl}
      capabilities={[...DROPCONTACT_CONFIG.capabilities]}
      setupSteps={SETUP_STEPS}
      {...props}
    />
  );
}
