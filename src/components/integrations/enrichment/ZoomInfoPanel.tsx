/**
 * ZoomInfo enrichment panel — thin wrapper over EnrichmentPanelBase.
 * NOT wired into any page; the coordinator wires it in.
 */
"use client";

import { EnrichmentPanelBase, type EnrichmentPanelProps } from "./EnrichmentPanelBase";
import { ZOOMINFO_CONFIG } from "@/lib/integrations/providers/enrichment/zoominfo/config";

export type ZoomInfoPanelProps = Omit<
  EnrichmentPanelProps,
  "provider" | "displayName" | "docsUrl" | "capabilities" | "setupSteps"
>;

const SETUP_STEPS = [
  "Create OAuth credentials in the ZoomInfo admin (Client Credentials flow).",
  "Store ZOOMINFO_CLIENT_ID and ZOOMINFO_CLIENT_SECRET; the adapter exchanges them for an access token (ZOOMINFO_ACCESS_TOKEN is also accepted).",
  "Note: the adapter calls the legacy Enterprise API paths; the new GTM API paths are not yet verified — see the adapter docs.",
];

export default function ZoomInfoPanel(props: ZoomInfoPanelProps) {
  return (
    <EnrichmentPanelBase
      provider="zoominfo"
      displayName="ZoomInfo"
      docsUrl={ZOOMINFO_CONFIG.docsUrl}
      capabilities={[...ZOOMINFO_CONFIG.capabilities]}
      setupSteps={SETUP_STEPS}
      {...props}
    />
  );
}
