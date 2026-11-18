/**
 * Apify enrichment panel — thin wrapper over EnrichmentPanelBase.
 * NOT wired into any page; the coordinator wires it in.
 */
"use client";

import { EnrichmentPanelBase, type EnrichmentPanelProps } from "./EnrichmentPanelBase";
import { APIFY_CONFIG } from "@/lib/integrations/providers/enrichment/apify/config";

export type ApifyPanelProps = Omit<
  EnrichmentPanelProps,
  "provider" | "displayName" | "docsUrl" | "capabilities" | "setupSteps"
>;

const SETUP_STEPS = [
  "Create an API token in the Apify Console (Settings → API & Integrations).",
  "Store it as APIFY_TOKEN and choose a Store Actor; note its id (username~actor-name).",
  "The adapter runs the Actor asynchronously and reads its dataset; only run Actors that respect the target service's terms.",
];

export default function ApifyPanel(props: ApifyPanelProps) {
  return (
    <EnrichmentPanelBase
      provider="apify"
      displayName="Apify"
      docsUrl={APIFY_CONFIG.docsUrl}
      capabilities={[...APIFY_CONFIG.capabilities]}
      setupSteps={SETUP_STEPS}
      {...props}
    />
  );
}
