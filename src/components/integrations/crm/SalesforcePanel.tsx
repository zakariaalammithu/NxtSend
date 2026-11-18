/**
 * Salesforce panel — thin wrapper over CrmPanelBase. NOT wired into
 * any page; the coordinator wires it in.
 */
"use client";

import { CrmPanelBase, type CrmPanelProps } from "./CrmPanelBase";
import { SALESFORCE_CONFIG } from "@/lib/integrations/providers/crm/salesforce/config";

export type SalesforcePanelProps = Omit<CrmPanelProps, "provider" | "displayName" | "docsUrl" | "capabilities" | "setupSteps">;

export default function SalesforcePanel(props: SalesforcePanelProps) {
  return (
    <CrmPanelBase
      provider="salesforce"
      displayName="Salesforce"
      docsUrl={SALESFORCE_CONFIG.docsUrl}
      capabilities={[...SALESFORCE_CONFIG.capabilities]}
      setupSteps={[...SALESFORCE_CONFIG.setup]}
      {...props}
    />
  );
}
