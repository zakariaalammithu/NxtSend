/**
 * HubSpot panel — thin wrapper over CrmPanelBase. NOT wired into any
 * page; the coordinator wires it in.
 */
"use client";

import { CrmPanelBase, type CrmPanelProps } from "./CrmPanelBase";
import { HUBSPOT_CONFIG } from "@/lib/integrations/providers/crm/hubspot/config";

export type HubSpotPanelProps = Omit<CrmPanelProps, "provider" | "displayName" | "docsUrl" | "capabilities" | "setupSteps">;

export default function HubSpotPanel(props: HubSpotPanelProps) {
  return (
    <CrmPanelBase
      provider="hubspot"
      displayName="HubSpot"
      docsUrl={HUBSPOT_CONFIG.docsUrl}
      capabilities={[...HUBSPOT_CONFIG.capabilities]}
      setupSteps={[...HUBSPOT_CONFIG.setup]}
      {...props}
    />
  );
}
