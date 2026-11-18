/**
 * Trigify enrichment panel — thin wrapper over EnrichmentPanelBase.
 * Provider blocked: Trigify shut down on 22 October 2026, so the
 * adapter refuses every call. NOT wired into any page; the
 * coordinator wires it in.
 */
"use client";

import { EnrichmentPanelBase, type EnrichmentPanelProps } from "./EnrichmentPanelBase";
import { TRIGIFY_CONFIG } from "@/lib/integrations/providers/enrichment/trigify/config";

export type TrigifyPanelProps = Omit<
  EnrichmentPanelProps,
  "provider" | "displayName" | "docsUrl" | "capabilities" | "setupSteps"
>;

const SETUP_STEPS = [
  "Blocked — Trigify shut down on 22 October 2026.",
  "API access, monitoring, and signal collection all stopped.",
  "No credential can be connected; the adapter refuses every call.",
];

export default function TrigifyPanel(props: TrigifyPanelProps) {
  return (
    <EnrichmentPanelBase
      provider="trigify"
      displayName="Trigify"
      docsUrl={TRIGIFY_CONFIG.docsUrl}
      capabilities={[...TRIGIFY_CONFIG.capabilities]}
      setupSteps={SETUP_STEPS}
      {...props}
    />
  );
}
