/**
 * Hunter.io enrichment panel — thin wrapper over EnrichmentPanelBase.
 * NOT wired into any page; the coordinator wires it in.
 */
"use client";

import { EnrichmentPanelBase, type EnrichmentPanelProps } from "./EnrichmentPanelBase";
import { HUNTER_CONFIG } from "@/lib/integrations/providers/enrichment/hunter/config";

export type HunterPanelProps = Omit<
  EnrichmentPanelProps,
  "provider" | "displayName" | "docsUrl" | "capabilities" | "setupSteps"
>;

const SETUP_STEPS = [
  "Create an API key at hunter.io (dashboard → API).",
  "Store it as HUNTER_API_KEY (encrypted via the connection store).",
  "The same key also powers the Hunter Email Verifier adapter.",
];

export default function HunterPanel(props: HunterPanelProps) {
  return (
    <EnrichmentPanelBase
      provider="hunter"
      displayName="Hunter.io"
      docsUrl={HUNTER_CONFIG.docsUrl}
      capabilities={[...HUNTER_CONFIG.capabilities]}
      setupSteps={SETUP_STEPS}
      {...props}
    />
  );
}
