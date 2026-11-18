/**
 * RB2B enrichment panel — thin wrapper over EnrichmentPanelBase.
 * RB2B is webhook-only: visitor data arrives as an outbound push,
 * there is no pull API and no API key. NOT wired into any page;
 * the coordinator wires it in.
 */
"use client";

import { EnrichmentPanelBase, type EnrichmentPanelProps } from "./EnrichmentPanelBase";
import { RB2B_CONFIG } from "@/lib/integrations/providers/enrichment/rb2b/config";

export type Rb2bPanelProps = Omit<
  EnrichmentPanelProps,
  "provider" | "displayName" | "docsUrl" | "capabilities" | "setupSteps"
>;

const SETUP_STEPS = [
  "RB2B is webhook-only — there is no pull API and no API key.",
  "Paste the NxtSend webhook URL into the RB2B dashboard; set RB2B_WEBHOOK_SECRET so the destination URL stays a shared secret.",
  "Visitor data arrives per page view and is mapped onto lead fields; US traffic only.",
];

export default function Rb2bPanel(props: Rb2bPanelProps) {
  return (
    <EnrichmentPanelBase
      provider="rb2b"
      displayName="RB2B"
      docsUrl={RB2B_CONFIG.docsUrl}
      capabilities={[...RB2B_CONFIG.capabilities]}
      setupSteps={SETUP_STEPS}
      {...props}
    />
  );
}
