/**
 * ContactOut enrichment panel — thin wrapper over EnrichmentPanelBase.
 * NOT wired into any page; the coordinator wires it in.
 */
"use client";

import { EnrichmentPanelBase, type EnrichmentPanelProps } from "./EnrichmentPanelBase";
import { CONTACTOUT_CONFIG } from "@/lib/integrations/providers/enrichment/contactout/config";

export type ContactOutPanelProps = Omit<
  EnrichmentPanelProps,
  "provider" | "displayName" | "docsUrl" | "capabilities" | "setupSteps"
>;

const SETUP_STEPS = [
  "Create an API key in the ContactOut dashboard.",
  "Store it as CONTACTOUT_API_KEY (encrypted via the connection store).",
  "Enrichment works from a LinkedIn profile URL, an email, or name + company.",
];

export default function ContactOutPanel(props: ContactOutPanelProps) {
  return (
    <EnrichmentPanelBase
      provider="contactout"
      displayName="ContactOut"
      docsUrl={CONTACTOUT_CONFIG.docsUrl}
      capabilities={[...CONTACTOUT_CONFIG.capabilities]}
      setupSteps={SETUP_STEPS}
      {...props}
    />
  );
}
