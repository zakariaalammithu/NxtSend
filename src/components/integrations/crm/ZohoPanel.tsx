/**
 * Zoho CRM panel — thin wrapper over CrmPanelBase. NOT wired into
 * any page; the coordinator wires it in.
 */
"use client";

import { CrmPanelBase, type CrmPanelProps } from "./CrmPanelBase";
import { ZOHO_CONFIG } from "@/lib/integrations/providers/crm/zoho/config";

export type ZohoPanelProps = Omit<CrmPanelProps, "provider" | "displayName" | "docsUrl" | "capabilities" | "setupSteps">;

export default function ZohoPanel(props: ZohoPanelProps) {
  return (
    <CrmPanelBase
      provider="zoho"
      displayName="Zoho CRM"
      docsUrl={ZOHO_CONFIG.docsUrl}
      capabilities={[...ZOHO_CONFIG.capabilities]}
      setupSteps={[...ZOHO_CONFIG.setup]}
      {...props}
    />
  );
}
